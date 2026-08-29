import { getAuthHeaders } from '@/lib/api/client';
import { parseSSE } from '@/lib/ai/parseSSE';
import type { SSEEvent } from '@/lib/ai/parseSSE';
import type { ChatReferences } from '@/lib/api/chat';
import { normalizeStreamEvents, type NormalizationContext } from '@/lib/ai/normalize';
import type { AIStreamEvent } from '@/lib/ai/events';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

/**
 * Extended stream event with typed fields for all agent events.
 */
export interface StreamEvent extends SSEEvent {
  type: 'chunk' | 'done' | 'error' | 'tool_call' | 'tool_result' | 'thought' | 'keepalive' | 'provider_switched' | (string & {});
  content?: string;
  error?: string;
  error_code?: 'rate_limit' | 'auth' | 'provider_unavailable' | 'timeout' | 'tool_error' | 'internal' | 'network' | 'no_provider' | (string & {});
  recoverable?: boolean;
  message_id?: number;
  session_id?: number;
  parent_message_id?: number;
  tool?: string;
  arguments?: Record<string, unknown>;
  result?: string;
  // provider_switched event fields
  from?: string;
  to?: string;
  reason?: string;
  /** Opaque SSE resume cursor for reconnectable streams. */
  id?: string;
}

/**
 * Legacy wire event. New consumers should pass a stream through
 * `normalizeStreamEvents` before updating UI state.
 */
export type WireStreamEvent = StreamEvent;

/** Normalize any parsed AI stream without changing the legacy client methods. */
export async function* normalizedStream(
  source: AsyncIterable<SSEEvent | unknown> | Iterable<SSEEvent | unknown>,
  context?: NormalizationContext,
): AsyncGenerator<AIStreamEvent, void, unknown> {
  yield* normalizeStreamEvents(source, context);
}

export interface ChatStreamOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  onRetry?: (attempt: number, error: Error) => void;
  /** Pin a specific user AI provider for this message. */
  providerId?: number;
  /** Send an opaque Last-Event-ID cursor when reconnecting. */
  cursor?: string;
}

export class StreamingHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StreamingHttpError';
    this.status = status;
  }
}

/**
 * Attempt to refresh the auth token and return the new token.
 * Returns null if refresh fails.
 */
async function tryRefreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Read error body from an HTTP error response.
 */
async function extractErrorBody(response: Response): Promise<string> {
  try {
    const data = await response.clone().json();
    return (data as { detail?: string })?.detail || `HTTP ${response.status}`;
  } catch {
    try {
      return (await response.text()) || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}

/**
 * Make a streaming fetch request with auth + optional token refresh.
 */
async function streamingFetch(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  // 401 — try refresh once, then retry
  if (response.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      // Set a one-off token getter override (we can't use setTokenGetter
      // because that would affect all concurrent requests).
      // Instead, just pass the token directly in the retry.
      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
      };
      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: retryHeaders,
        body: JSON.stringify(body),
        signal,
      });
      if (retryResponse.ok) {
        // Update the global token getter so future calls use the new token
        // (import side-effect — works because client.ts manages the getter)
        const { setTokenGetter } = await import('@/lib/api/client');
        setTokenGetter(() => newToken);
        return retryResponse;
      }
      // Retry also failed — fall through to error handling
    }
  }

  if (!response.ok) {
    const detail = await extractErrorBody(response);
    throw new Error(detail);
  }

  return response;
}

/**
 * GET streaming fetch with auth + optional token refresh (for endpoints that
 * tail a server-side stream by id, e.g. deep research).
 */
async function streamingFetchGet(
  url: string,
  signal?: AbortSignal,
  cursor?: string,
): Promise<Response> {
  let response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(cursor ? { 'Last-Event-ID': cursor } : {}),
      ...getAuthHeaders(),
    },
    signal,
  });

  if (response.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(cursor ? { 'Last-Event-ID': cursor } : {}),
          Authorization: `Bearer ${newToken}`,
        },
        signal,
      });
      if (response.ok) {
        const { setTokenGetter } = await import('@/lib/api/client');
        setTokenGetter(() => newToken);
        return response;
      }
    }
  }

  if (!response.ok) {
    const detail = await extractErrorBody(response);
    throw new StreamingHttpError(response.status, detail);
  }
  return response;
}


/**
 * Client for all SSE streaming endpoints.
 * Handles auth, token refresh, and unified event parsing.
 */
export const chatStreamClient = {
  /**
   * Follow a deep-research run's event stream (reconnect-safe — the server
   * replays from the start of the run each time this connects).
   */
  async *streamDeepResearch(
    sessionId: number,
    options: ChatStreamOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const url = `${API_BASE_URL}/deep-research/${sessionId}/stream`;
    const response = await streamingFetchGet(url, options.signal, options.cursor);
    const gen = parseSSE(response, { ...options });
    for await (const event of gen) {
      yield event as StreamEvent;
    }
  },

  /**
   * Stream a paper chat message.
   */
  async *streamMessage(
    paperId: number,
    message: string,
    references?: ChatReferences,
    sessionId?: number,
    options: ChatStreamOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const url = `${API_BASE_URL}/papers/${paperId}/chat/stream`;
    const body = {
      message,
      references: references ?? { notes: [], annotations: [], papers: [] },
      session_id: sessionId,
      provider_id: options.providerId,
    };

    const response = await streamingFetch(url, body, options.signal);
    const gen = parseSSE(response, { ...options });
    for await (const event of gen) {
      yield event as StreamEvent;
    }
  },

  /**
   * Stream a thread (reply) message.
   */
  async *streamThreadMessage(
    messageId: number,
    message: string,
    references?: ChatReferences,
    options: ChatStreamOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const url = `${API_BASE_URL}/messages/${messageId}/thread/stream`;
    const body = {
      message,
      references: references ?? { notes: [], annotations: [], papers: [] },
    };

    const response = await streamingFetch(url, body, options.signal);
    const gen = parseSSE(response, { ...options });
    for await (const event of gen) {
      yield event as StreamEvent;
    }
  },

  /**
   * Stream a group chat message.
   */
  async *streamGroupMessage(
    groupId: number,
    message: string,
    references?: ChatReferences,
    sessionId?: number,
    options: ChatStreamOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const url = `${API_BASE_URL}/groups/${groupId}/chat/stream`;
    const body = {
      message,
      references: references ?? { notes: [], annotations: [], papers: [] },
      group_id: groupId,
      session_id: sessionId,
      provider_id: options.providerId,
    };

    const response = await streamingFetch(url, body, options.signal);
    const gen = parseSSE(response, { ...options });
    for await (const event of gen) {
      yield event as StreamEvent;
    }
  },

  /**
   * Stream an ad-hoc multi-paper chat message.
   */
  async *streamMultiMessage(
    paperIds: number[],
    message: string,
    references?: ChatReferences,
    sessionId?: number,
    options: ChatStreamOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const url = `${API_BASE_URL}/multi-chat/stream`;
    const body = {
      message,
      references: references ?? { notes: [], annotations: [], papers: [] },
      session_id: sessionId,
      paper_ids: paperIds,
      provider_id: options.providerId,
    };

    const response = await streamingFetch(url, body, options.signal);
    const gen = parseSSE(response, { ...options });
    for await (const event of gen) {
      yield event as StreamEvent;
    }
  },
};

export default chatStreamClient;
