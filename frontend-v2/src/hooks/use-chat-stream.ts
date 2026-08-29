import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { chatStreamClient, normalizedStream } from '@/lib/ai/chatStream';
import type { ChatReferences } from '@/lib/api/chat';
import type { ReferenceManifestEntry } from '@/lib/api/references';
import { logger } from '@/lib/logger';
import { useTypewriter } from '@/hooks/use-typewriter';
import {
  INITIAL_AI_STREAM_STATE,
  isAIStreamActive,
  reduceAIStream,
  type AIStreamState,
} from '@/lib/ai/streamState';
import type { AIActivity, AIRetry, AISource, AIWarning } from '@/lib/ai/events';

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
  /** Safe, normalized activity; raw thoughts are intentionally absent. */
  activities: AIActivity[];
  sources: AISource[];
  warning: AIWarning | null;
  retryInfo: AIRetry | null;
  thoughts: ThoughtEvent[];
  toolCalls: ToolCallEvent[];
  toolResults: ToolResultEvent[];
  currentTool: string | null;
  error: ChatStreamError | null;
  messageId: number | null;
  sessionId: number | null;
  referenceManifest: ReferenceManifestEntry[] | null;
}

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
  /** Compatibility field; chat retries remain explicit, so this is always null. */
  autoRetryAt: number | null;
}

const INCOMPLETE_STREAM_ERROR = {
  code: 'network' as const,
  message: 'The connection ended before the response was complete. Try again.',
  recoverable: true,
};

function chatStatusFor(state: AIStreamState): ChatStreamStatus {
  switch (state.status) {
    case 'completed':
      return 'done';
    case 'failed':
    case 'paused':
      return 'error';
    case 'cancelled':
      return 'idle';
    case 'connecting':
    case 'retrying':
    case 'reconciling':
      return 'connecting';
    case 'streaming':
      return 'streaming';
    case 'idle':
      return 'idle';
  }
}

function chatStateFor(state: AIStreamState): ChatStreamState {
  const currentTool = [...state.activities]
    .reverse()
    .find((activity) => activity.kind === 'tool' && activity.state === 'running')?.label ?? null;

  return {
    status: chatStatusFor(state),
    content: state.content,
    activities: state.activities,
    sources: state.sources,
    warning: state.warning,
    retryInfo: state.retry,
    // Kept for the legacy prop shape while paper chat migrates. No renderer
    // should read these fields after the shared activity migration.
    thoughts: [],
    toolCalls: [],
    toolResults: [],
    currentTool,
    error: state.error,
    messageId: state.messageId,
    sessionId: state.sessionId,
    referenceManifest: state.referenceManifest,
  };
}

export function useChatStream(): UseChatStreamReturn {
  const [streamState, setStreamState] = useState<AIStreamState>(INITIAL_AI_STREAM_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const lastSendRef = useRef<{
    paperId: number;
    message: string;
    references?: ChatReferences;
    sessionId?: number;
    providerId?: number;
  } | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);

  const state = useMemo(() => chatStateFor(streamState), [streamState]);

  const streamSettled = state.status === 'done' || state.status === 'error';
  const displayedContent = useTypewriter(state.content, streamSettled);

  const runStream = useCallback(
    async (
      paperId: number,
      message: string,
      references?: ChatReferences,
      sessionId?: number,
      providerId?: number,
    ) => {
      const generation = ++generationRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      lastSendRef.current = { paperId, message, references, sessionId, providerId };
      setPendingUserMessage(message);

      setStreamState({
        ...INITIAL_AI_STREAM_STATE,
        status: 'connecting',
      });

      try {
        const gen = normalizedStream(
          chatStreamClient.streamMessage(
            paperId,
            message,
            references,
            sessionId,
            { signal: controller.signal, timeoutMs: 60_000, maxRetries: 0, providerId },
          ),
        );
        let sawTerminalEvent = false;

        for await (const event of gen) {
          if (controller.signal.aborted) break;
          if (generation !== generationRef.current) return;
          setStreamState((previous) => reduceAIStream(previous, event));
          if (
            event.type === 'complete' ||
            event.type === 'error' ||
            event.type === 'paused' ||
            event.type === 'cancelled'
          ) {
            sawTerminalEvent = true;
          }
        }

        if (
          generation === generationRef.current &&
          !controller.signal.aborted &&
          !sawTerminalEvent
        ) {
          setStreamState((previous) => reduceAIStream(previous, {
            type: 'error',
            error: INCOMPLETE_STREAM_ERROR,
          }));
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError' || controller.signal.aborted) {
          if (generation === generationRef.current) setStreamState(INITIAL_AI_STREAM_STATE);
          return;
        }

        logger.error('Chat stream error:', err);
        if (generation === generationRef.current) {
          setStreamState((previous) => reduceAIStream(previous, {
            type: 'error',
            error: INCOMPLETE_STREAM_ERROR,
          }));
        }
      } finally {
        if (generation === generationRef.current) setPendingUserMessage(null);
      }
    },
    [],
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
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamState(INITIAL_AI_STREAM_STATE);
    setPendingUserMessage(null);
  }, []);

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
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamState(INITIAL_AI_STREAM_STATE);
    setPendingUserMessage(null);
    lastSendRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  return {
    ...state,
    displayedContent,
    send,
    cancel,
    retry,
    reset,
    isActive: isAIStreamActive(streamState.status),
    pendingUserMessage,
    autoRetryAt: null,
  };
}

export default useChatStream;
