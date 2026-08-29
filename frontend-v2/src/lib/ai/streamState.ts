import type { ReferenceManifestEntry } from '@/lib/api/references';
import {
  AI_STREAM_LIMITS,
  type AIActivity,
  type AIError,
  type AIStreamEvent,
  type AISource,
  type AIRetry,
  type AIWarning,
} from '@/lib/ai/events';

export type AIStreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'retrying'
  | 'reconciling'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface AIStreamState {
  status: AIStreamStatus;
  content: string;
  activities: AIActivity[];
  sources: AISource[];
  warning: AIWarning | null;
  retry: AIRetry | null;
  error: AIError | null;
  messageId: number | null;
  sessionId: number | null;
  parentMessageId: number | null;
  referenceManifest: ReferenceManifestEntry[] | null;
  lastEventCursor: string | null;
  terminal: boolean;
}

export const INITIAL_AI_STREAM_STATE: AIStreamState = {
  status: 'idle',
  content: '',
  activities: [],
  sources: [],
  warning: null,
  retry: null,
  error: null,
  messageId: null,
  sessionId: null,
  parentMessageId: null,
  referenceManifest: null,
  lastEventCursor: null,
  terminal: false,
};

/** Whether a stream is still producing or reconciling a response. */
export function isAIStreamActive(status: AIStreamStatus): boolean {
  return (
    status === 'connecting' ||
    status === 'streaming' ||
    status === 'retrying' ||
    status === 'reconciling'
  );
}

function withCursor(state: AIStreamState, event: AIStreamEvent): AIStreamState {
  return event.cursor ? { ...state, lastEventCursor: event.cursor } : state;
}

function appendContent(current: string, delta: string): string {
  const remaining = AI_STREAM_LIMITS.maxContentChars - current.length;
  return remaining > 0 ? current + delta.slice(0, remaining) : current;
}

function applyActivity(current: AIActivity[], next: AIActivity): AIActivity[] {
  const index = current.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = { ...updated[index], ...next };
    return updated;
  }
  const appended = [...current, next];
  return appended.length > AI_STREAM_LIMITS.maxActivityItems
    ? appended.slice(-AI_STREAM_LIMITS.maxActivityItems)
    : appended;
}

function applySource(current: AISource[], next: AISource): AISource[] {
  const index = current.findIndex((item) => item.id === next.id && item.kind === next.kind);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = { ...updated[index], ...next };
    return updated;
  }
  const appended = [...current, next];
  return appended.length > AI_STREAM_LIMITS.maxReferenceItems
    ? appended.slice(-AI_STREAM_LIMITS.maxReferenceItems)
    : appended;
}

/**
 * Pure transition function for all AI stream consumers. It does not infer
 * success from a closed response body and ignores events after a terminal one.
 */
export function reduceAIStream(
  previous: AIStreamState,
  event: AIStreamEvent,
): AIStreamState {
  if (previous.terminal && event.type !== 'retrying') return previous;

  const state = withCursor(previous, event);

  switch (event.type) {
    case 'content_delta':
      return {
        ...state,
        status: 'streaming',
        content: appendContent(state.content, event.delta),
        warning: null,
        retry: null,
      };
    case 'activity':
      return {
        ...state,
        status: event.activity.state === 'running' ? 'streaming' : state.status,
        activities: applyActivity(state.activities, event.activity),
      };
    case 'source':
      return { ...state, sources: applySource(state.sources, event.source) };
    case 'warning':
      return { ...state, warning: event.warning };
    case 'retrying':
      return {
        ...state,
        status: 'retrying',
        retry: event.retry,
        error: null,
        terminal: false,
      };
    case 'complete':
      return {
        ...state,
        status: 'completed',
        content: event.content !== undefined
          ? event.content.slice(0, AI_STREAM_LIMITS.maxContentChars)
          : state.content,
        messageId: event.messageId ?? state.messageId,
        sessionId: event.sessionId ?? state.sessionId,
        parentMessageId: event.parentMessageId ?? state.parentMessageId,
        referenceManifest: event.referenceManifest,
        error: null,
        retry: null,
        terminal: true,
      };
    case 'error':
      return {
        ...state,
        status: 'failed',
        error: event.error,
        retry: null,
        terminal: true,
      };
    case 'paused':
      return {
        ...state,
        status: 'paused',
        error: event.error,
        retry: null,
        terminal: true,
      };
    case 'cancelled':
      return {
        ...state,
        status: 'cancelled',
        error: event.error ?? null,
        retry: null,
        terminal: true,
      };
    case 'stream_end':
      // The caller must reconcile with an authoritative snapshot. This is not
      // a successful completion event.
      return { ...state, status: 'reconciling' };
    case 'keepalive':
      return state;
  }
}
