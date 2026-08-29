import type { ReferenceManifestEntry } from '@/lib/api/references';

/**
 * Limits applied at the model/network boundary before data reaches a renderer.
 * These are deliberately small enough to keep streamed UI work bounded.
 */
export const AI_STREAM_LIMITS = {
  maxContentChars: 1_000_000,
  maxDeltaChars: 16_000,
  maxActivityItems: 100,
  maxActivityDetailChars: 1_200,
  maxReferenceItems: 100,
  maxFieldChars: 1_024,
} as const;

export type AIErrorCode =
  | 'rate_limit'
  | 'auth'
  | 'provider_unavailable'
  | 'timeout'
  | 'tool_error'
  | 'internal'
  | 'max_turns'
  | 'network'
  | 'no_provider'
  | 'cancelled'
  | 'paused'
  | 'unknown';

export interface AIError {
  code: AIErrorCode;
  message: string;
  recoverable: boolean;
}

export type AIActivityKind = 'phase' | 'tool';
export type AIActivityState = 'running' | 'complete' | 'error';

/** Safe, user-facing activity. It never contains raw tool arguments/results. */
export interface AIActivity {
  id: string;
  kind: AIActivityKind;
  state: AIActivityState;
  label: string;
  detail?: string;
}

export interface AISource {
  id: string;
  kind: string;
  label: string;
  title?: string;
  url?: string;
  externalId?: string;
}

export interface AIWarning {
  code: string;
  message: string;
}

export interface AIRetry {
  attempt: number;
  maxAttempts?: number;
  retryAfterMs?: number;
}

interface AIStreamEventBase {
  /** Opaque cursor copied from the SSE id field when one exists. */
  cursor?: string;
}

export type AIStreamEvent =
  | (AIStreamEventBase & {
      type: 'content_delta';
      delta: string;
    })
  | (AIStreamEventBase & {
      type: 'activity';
      activity: AIActivity;
    })
  | (AIStreamEventBase & {
      type: 'source';
      source: AISource;
    })
  | (AIStreamEventBase & {
      type: 'warning';
      warning: AIWarning;
    })
  | (AIStreamEventBase & {
      type: 'retrying';
      retry: AIRetry;
    })
  | (AIStreamEventBase & {
      type: 'complete';
      content?: string;
      messageId?: number;
      sessionId?: number;
      parentMessageId?: number;
      referenceManifest: ReferenceManifestEntry[] | null;
    })
  | (AIStreamEventBase & {
      type: 'error';
      error: AIError;
    })
  | (AIStreamEventBase & {
      type: 'paused';
      error: AIError;
    })
  | (AIStreamEventBase & {
      type: 'cancelled';
      error?: AIError;
    })
  | (AIStreamEventBase & {
      type: 'stream_end';
      status?: 'completed' | 'failed' | 'paused' | 'cancelled';
    })
  | (AIStreamEventBase & {
      type: 'keepalive';
    });
