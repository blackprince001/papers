import { useState, useRef, useCallback, useEffect } from 'react';
import { chatStreamClient } from '@/lib/ai/chatStream';
import type { ChatReferences } from '@/lib/api/chat';
import type { ReferenceManifestEntry } from '@/lib/api/references';
import { logger } from '@/lib/logger';
import { useTypewriter } from '@/hooks/use-typewriter';

export type ChatStreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'thinking'
  | 'using_tool'
  | 'done'
  | 'error';

export interface ToolCallEvent {
  tool: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

export interface ToolResultEvent {
  tool: string;
  result: string;
  timestamp: number;
}

export interface ThoughtEvent {
  content: string;
  timestamp: number;
}

export interface ChatStreamError {
  message: string;
  code: string;
  recoverable: boolean;
}

export interface ChatStreamState {
  status: ChatStreamStatus;
  content: string;
  thoughts: ThoughtEvent[];
  toolCalls: ToolCallEvent[];
  toolResults: ToolResultEvent[];
  currentTool: string | null;
  error: ChatStreamError | null;
  messageId: number | null;
  sessionId: number | null;
  referenceManifest: ReferenceManifestEntry[] | null;
}

const INITIAL_STATE: ChatStreamState = {
  status: 'idle',
  content: '',
  thoughts: [],
  toolCalls: [],
  toolResults: [],
  currentTool: null,
  error: null,
  messageId: null,
  sessionId: null,
  referenceManifest: null,
};

export interface UseChatStreamReturn extends ChatStreamState {
  /** Smoothly-revealed view of `content` for typewriter rendering. */
  displayedContent: string;
  /** Send a message and start streaming. */
  send: (
    paperId: number,
    message: string,
    references?: ChatReferences,
    sessionId?: number,
    providerId?: number,
  ) => void;
  /** Cancel the current stream (abort). */
  cancel: () => void;
  /** Retry the last send after an error. */
  retry: () => void;
  /** Reset state to idle. */
  reset: () => void;
  /** Whether a send is currently in progress. */
  isActive: boolean;
  /** The user message that was sent (preserved for retry). */
  pendingUserMessage: string | null;
  /** Epoch ms of the scheduled automatic retry after a rate-limit error, or null. */
  autoRetryAt: number | null;
}

// Transient rate limits are retried automatically with backoff before asking
// the user to click Retry.
const RATE_LIMIT_AUTO_RETRIES = 2;
const RATE_LIMIT_BACKOFF_MS = [5_000, 15_000];

export function useChatStream(): UseChatStreamReturn {
  const [state, setState] = useState<ChatStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const lastSendRef = useRef<{
    paperId: number;
    message: string;
    references?: ChatReferences;
    sessionId?: number;
    providerId?: number;
  } | null>(null);
  const pendingUserMessageRef = useRef<string | null>(null);
  const [autoRetryAt, setAutoRetryAt] = useState<number | null>(null);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitAttemptsRef = useRef(0);

  const clearAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
    autoRetryTimerRef.current = null;
    setAutoRetryAt(null);
  }, []);

  const streamSettled = state.status === 'done' || state.status === 'error';
  const displayedContent = useTypewriter(state.content, streamSettled);

  const runStream = useCallback(
    async (
      paperId: number,
      message: string,
      references?: ChatReferences,
      sessionId?: number,
      providerId?: number,
      isAutoRetry = false,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      clearAutoRetry();
      if (!isAutoRetry) rateLimitAttemptsRef.current = 0;

      lastSendRef.current = { paperId, message, references, sessionId, providerId };
      pendingUserMessageRef.current = message;

      setState({
        ...INITIAL_STATE,
        status: 'connecting',
        content: '',
      });

      // Object wrapper so TS doesn't narrow the closure-assigned value to never.
      const streamErrorRef: { current: { code: string; recoverable: boolean } | null } = {
        current: null,
      };

      try {
        const gen = chatStreamClient.streamMessage(
          paperId,
          message,
          references,
          sessionId,
          { signal: controller.signal, timeoutMs: 60_000, maxRetries: 2, providerId },
        );

        for await (const event of gen) {
          if (controller.signal.aborted) break;

          setState((prev) => {
            const next = { ...prev };

            switch (event.type) {
              case 'chunk': {
                const text = event.content || '';
                next.content = prev.content + text;
                next.status = 'streaming';
                break;
              }

              case 'tool_call':
                next.toolCalls = [
                  ...prev.toolCalls,
                  {
                    tool: event.tool || 'unknown',
                    arguments: (event.arguments as Record<string, unknown>) || {},
                    timestamp: Date.now(),
                  },
                ];
                next.currentTool = event.tool || 'unknown';
                next.status = 'using_tool';
                break;

              case 'tool_result':
                next.toolResults = [
                  ...prev.toolResults,
                  {
                    tool: event.tool || 'unknown',
                    result: event.result || '',
                    timestamp: Date.now(),
                  },
                ];
                next.currentTool = null;
                if (prev.toolCalls.length > prev.toolResults.length) {
                } else {
                  next.status = 'streaming';
                }
                break;

              case 'thought': {
                const delta = event.content || '';
                const last = prev.thoughts[prev.thoughts.length - 1];
                if (last) {
                  next.thoughts = [
                    ...prev.thoughts.slice(0, -1),
                    { content: last.content + delta, timestamp: last.timestamp },
                  ];
                } else {
                  next.thoughts = [{ content: delta, timestamp: Date.now() }];
                }
                next.status = 'thinking';
                break;
              }

              case 'error':
                next.status = 'error';
                next.error = {
                  message: event.error || 'An error occurred',
                  code: (event.error_code as string) || 'internal',
                  recoverable: event.recoverable !== false,
                };
                streamErrorRef.current = {
                  code: next.error.code,
                  recoverable: next.error.recoverable,
                };
                break;

              case 'keepalive':
                break;

              case 'done':
                next.messageId = (event.message_id as number) ?? null;
                next.sessionId = (event.session_id as number) ?? null;
                next.referenceManifest = (event.reference_manifest as ReferenceManifestEntry[]) ?? null;
                next.status = 'done';
                break;
            }

            return next;
          });
        }

        setState((prev) => {
          if (prev.status !== 'done' && prev.status !== 'error') {
            return { ...prev, status: 'done' };
          }
          return prev;
        });

        // Rate limits are transient — retry automatically with backoff before
        // falling back to the manual Retry button.
        const streamError = streamErrorRef.current;
        if (
          streamError?.code === 'rate_limit' &&
          streamError.recoverable &&
          !controller.signal.aborted &&
          rateLimitAttemptsRef.current < RATE_LIMIT_AUTO_RETRIES
        ) {
          const attempt = rateLimitAttemptsRef.current;
          rateLimitAttemptsRef.current = attempt + 1;
          const delay =
            RATE_LIMIT_BACKOFF_MS[Math.min(attempt, RATE_LIMIT_BACKOFF_MS.length - 1)];
          setAutoRetryAt(Date.now() + delay);
          autoRetryTimerRef.current = setTimeout(() => {
            const last = lastSendRef.current;
            if (!last) return;
            void runStream(
              last.paperId,
              last.message,
              last.references,
              last.sessionId,
              last.providerId,
              true,
            );
          }, delay);
        } else if (streamError == null) {
          rateLimitAttemptsRef.current = 0;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setState((prev) => ({
            ...prev,
            status: 'idle',
            error: null,
          }));
          return;
        }

        const message = (err as Error).message || 'Failed to send message';
        logger.error('Chat stream error:', err);

        setState((prev) => ({
          ...prev,
          status: 'error',
          error: {
            message,
            code: 'internal',
            recoverable: true,
          },
        }));
      } finally {
        pendingUserMessageRef.current = null;
      }
    },
    [clearAutoRetry],
  );

  const send = useCallback(
    (
      paperId: number,
      message: string,
      references?: ChatReferences,
      sessionId?: number,
      providerId?: number,
    ) => {
      void runStream(paperId, message, references, sessionId, providerId);
    },
    [runStream],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearAutoRetry();
    rateLimitAttemptsRef.current = 0;
    setState((prev) => ({
      ...prev,
      status: 'idle',
      error: null,
    }));
    pendingUserMessageRef.current = null;
  }, [clearAutoRetry]);

  const retry = useCallback(() => {
    const last = lastSendRef.current;
    if (!last) return;
    void runStream(
      last.paperId,
      last.message,
      last.references,
      last.sessionId,
      last.providerId,
    );
  }, [runStream]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearAutoRetry();
    rateLimitAttemptsRef.current = 0;
    setState(INITIAL_STATE);
    pendingUserMessageRef.current = null;
    lastSendRef.current = null;
  }, [clearAutoRetry]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
    };
  }, []);

  return {
    ...state,
    displayedContent,
    send,
    cancel,
    retry,
    reset,
    isActive:
      state.status === 'connecting' ||
      state.status === 'streaming' ||
      state.status === 'thinking' ||
      state.status === 'using_tool',
    pendingUserMessage: pendingUserMessageRef.current,
    autoRetryAt,
  };
}

export default useChatStream;
