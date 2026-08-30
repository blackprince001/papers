import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  chatStreamClient,
  normalizedStream,
  StreamingHttpError,
} from '@/lib/ai/chatStream';
import { createNormalizationContext } from '@/lib/ai/normalize';
import type { AIActivity, AIError } from '@/lib/ai/events';
import {
  INITIAL_AI_STREAM_STATE,
  reduceAIStream,
  type AIStreamState,
} from '@/lib/ai/streamState';
import {
  deepResearchApi,
  type CitedSource,
  type DeepResearchFollowUpMode,
  type DeepResearchMessage,
  type DeepResearchVerificationStatus,
  type DeepResearchSessionDetail,
  type DeepResearchStatus,
} from '@/lib/api/deepResearch';
import { logger } from '@/lib/logger';

export interface DeepResearchStreamState {
  sessionId: number | null;
  question: string;
  status: DeepResearchStatus | 'idle';
  /** Ordered, normalized activity feed; raw reasoning never reaches the page. */
  activity: AIActivity[];
  report: string;
  sources: CitedSource[];
  messages: DeepResearchMessage[];
  /** Wall-clock ms spent reasoning before the answer began (null until known). */
  thinkingMs: number | null;
  phase: string | null;
  progress: number;
  sourceCount: number;
  verificationStatus: DeepResearchVerificationStatus;
  providerType: string | null;
  model: string | null;
  scope: string | null;
  effort: string | null;
  elapsedMs: number;
  isOnline: boolean;
  cancelling: boolean;
  resuming: boolean;
  followUpPending: DeepResearchFollowUpMode | null;
  error: string | null;
  errorCode: string | null;
  reconnecting: boolean;
}

const INITIAL: DeepResearchStreamState = {
  sessionId: null,
  question: '',
  status: 'idle',
  activity: [],
  report: '',
  sources: [],
  messages: [],
  thinkingMs: null,
  phase: null,
  progress: 0,
  sourceCount: 0,
  verificationStatus: 'pending',
  providerType: null,
  model: null,
  scope: null,
  effort: null,
  elapsedMs: 0,
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  cancelling: false,
  resuming: false,
  followUpPending: null,
  error: null,
  errorCode: null,
  reconnecting: false,
};

const INCOMPLETE_STREAM_ERROR: AIError = {
  code: 'network',
  message: 'The research connection ended before the result was complete.',
  recoverable: true,
};

const SAFE_HTTP_ERRORS: Record<number, { status: DeepResearchStatus; message: string; code: string }> = {
  403: { status: 'failed', message: 'Research access is unavailable.', code: 'http_403' },
  404: { status: 'failed', message: 'This research run was not found.', code: 'http_404' },
  409: { status: 'paused', message: 'This research run needs attention before it can continue.', code: 'http_409' },
};

function statusForLive(
  live: AIStreamState,
  fallback: DeepResearchStatus | 'idle',
): DeepResearchStatus | 'idle' {
  if (live.status === 'completed') return 'completed';
  if (live.status === 'failed') return 'failed';
  if (live.status === 'paused') return 'paused';
  if (live.status === 'cancelled') return 'cancelled';
  return fallback === 'idle' ? 'running' : fallback;
}

function errorForCode(code: string | null | undefined): string | null {
  switch (code) {
    case 'auth':
      return 'Your AI connection needs attention. Check AI settings.';
    case 'no_provider':
      return 'Add an AI provider in Settings to continue.';
    case 'rate_limit':
      return 'The AI service is busy. Resume in a moment.';
    case 'timeout':
      return 'The research run timed out. Resume to continue.';
    case 'max_turns':
      return 'The research run took too many steps. Resume to continue.';
    default:
      return null;
  }
}

const TERMINAL_STATUSES = new Set<DeepResearchStatus>([
  'completed',
  'failed',
  'paused',
  'cancelled',
]);

const PHASE_LABELS: Record<string, string> = {
  queued: 'Queued',
  planning: 'Planning the research',
  searching: 'Searching academic sources',
  reading: 'Reading relevant papers',
  synthesizing: 'Synthesizing the findings',
  verifying: 'Checking the evidence',
  running: 'Working through sources',
  complete: 'Complete',
  paused: 'Paused',
  failed: 'Unable to finish',
  cancelling: 'Cancelling',
  cancelled: 'Cancelled',
};

function progressForStatus(status: DeepResearchStatus | 'idle'): number {
  const progress: Partial<Record<DeepResearchStatus | 'idle', number>> = {
    idle: 0,
    queued: 0,
    planning: 10,
    searching: 30,
    reading: 55,
    synthesizing: 72,
    verifying: 88,
    running: 30,
    completed: 100,
    failed: 100,
    paused: 0,
    cancel_requested: 95,
    cancelled: 100,
  };
  return progress[status] ?? 0;
}

function phaseLabel(phase: string | null | undefined, status: DeepResearchStatus | 'idle') {
  return PHASE_LABELS[phase ?? status] ?? phase ?? PHASE_LABELS[status] ?? 'Working through sources';
}

function startedAtMs(detail: DeepResearchSessionDetail): number | null {
  const value = detail.generation?.started_at ?? detail.created_at;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function latestUserQuestion(
  messages: DeepResearchMessage[],
  fallback: string,
): string {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? fallback;
}

/** Drives a deep-research stream, reconnecting and reconciling to its snapshot. */
export function useDeepResearchStream() {
  const [state, setState] = useState<DeepResearchStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const sessionIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const onOnline = () => setState((previous) => ({ ...previous, isOnline: true }));
    const onOffline = () =>
      setState((previous) => ({
        ...previous,
        isOnline: false,
        error: previous.status === 'idle' ? previous.error : 'You are offline. Research will reconnect when you are back online.',
        errorCode: previous.status === 'idle' ? previous.errorCode : 'network',
      }));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!startedAtRef.current || !state.sessionId || !['queued', 'planning', 'searching', 'reading', 'synthesizing', 'verifying', 'running', 'cancel_requested'].includes(state.status)) {
      return;
    }
    const update = () => {
      const elapsedMs = Math.max(0, Date.now() - (startedAtRef.current ?? Date.now()));
      setState((previous) => ({ ...previous, elapsedMs }));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [state.sessionId, state.status]);

  const drive = useCallback(async (sessionId: number) => {
    const myGen = ++genRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = sessionId;
    setState((previous) => ({
      ...INITIAL,
      sessionId,
      status: 'running',
      isOnline: previous.isOnline,
    }));

    let detail: DeepResearchSessionDetail | null = null;
    let messages: DeepResearchMessage[] = [];
    try {
      detail = await deepResearchApi.get(sessionId);
    } catch (error) {
      logger.warn('deep research: failed to load detail', error);
    }
    try {
      messages = await deepResearchApi.messages(sessionId);
    } catch (error) {
      logger.warn('deep research: failed to load messages', error);
    }
    if (genRef.current !== myGen) return;

    let baseStatus: DeepResearchStatus | 'idle' = 'running';
    if (detail) {
      baseStatus = detail.status;
      startedAtRef.current = startedAtMs(detail);
      const generation = detail.generation;
      setState((previous) => ({
        ...previous,
        question: latestUserQuestion(messages, detail!.question),
        status: detail!.status,
        report: detail!.report ?? '',
        sources: detail!.cited_sources ?? [],
        phase: generation ? phaseLabel(generation.phase, detail!.status) : phaseLabel(null, detail!.status),
        progress: generation?.progress ?? progressForStatus(detail!.status),
        sourceCount: generation?.source_count ?? detail!.cited_sources?.length ?? 0,
        verificationStatus: generation?.verification_status ?? 'pending',
        providerType: generation?.provider_type ?? null,
        model: generation?.model ?? null,
        scope: generation?.scope ?? null,
        effort: generation?.effort ?? null,
        elapsedMs: generation?.finished_at && startedAtRef.current
          ? Math.max(0, Date.parse(generation.finished_at) - startedAtRef.current)
          : startedAtRef.current ? Math.max(0, Date.now() - startedAtRef.current) : 0,
        messages,
        error: detail!.last_error_code ? errorForCode(detail!.last_error_code) : null,
        errorCode: detail!.last_error_code ?? null,
        cancelling: detail!.status === 'cancel_requested',
      }));
      if (TERMINAL_STATUSES.has(detail.status)) return;
    }

    let live: AIStreamState = { ...INITIAL_AI_STREAM_STATE, status: 'connecting' };
    const normalizationContext = createNormalizationContext();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let terminal = false;
    let reconnectAttempt = 0;
    const maxReconnects = 6;

    setState((previous) => ({
      ...previous,
      status: baseStatus,
      activity: [],
      report: '',
      sources: [],
      messages,
      error: null,
      errorCode: null,
      reconnecting: false,
      phase: phaseLabel(null, baseStatus),
      progress: progressForStatus(baseStatus),
      sourceCount: detail?.generation?.source_count ?? detail?.cited_sources?.length ?? 0,
      verificationStatus: detail?.generation?.verification_status ?? 'pending',
    }));

    const publish = (next: AIStreamState, reconnecting = false) => {
      const phaseActivity = [...next.activities].reverse().find((item) => item.kind === 'phase');
      const nextStatus = statusForLive(next, baseStatus);
      setState((previous) => ({
        ...previous,
        status: nextStatus,
        activity: next.activities,
        report: next.content,
        phase: phaseActivity?.label ?? phaseLabel(null, nextStatus),
        progress: Math.max(previous.progress, progressForStatus(nextStatus)),
        sourceCount: Math.max(previous.sourceCount, next.sources.length),
        verificationStatus: nextStatus === 'completed'
          ? next.sources.length > 0 ? 'verified' : 'insufficient_evidence'
          : nextStatus === 'paused' || nextStatus === 'failed' || nextStatus === 'cancelled'
            ? 'needs_attention'
            : nextStatus === 'verifying' ? 'in_progress' : previous.verificationStatus,
        error: next.error?.message ?? null,
        errorCode: next.error?.code ?? null,
        reconnecting,
        isOnline: true,
      }));
    };

    while (!controller.signal.aborted && genRef.current === myGen && !terminal) {
      const startedAt = Date.now();
      let answerMarked = false;

      try {
        for await (const event of normalizedStream(
          chatStreamClient.streamDeepResearch(sessionId, {
            signal: controller.signal,
            timeoutMs: 45_000,
            cursor,
          }),
          normalizationContext,
        )) {
          if (event.cursor) {
            if (seenCursors.has(event.cursor)) continue;
            if (seenCursors.size >= 2048) seenCursors.clear();
            seenCursors.add(event.cursor);
            cursor = event.cursor;
          }
          if (event.type === 'keepalive') continue;

          live = reduceAIStream(live, event);
          flushSync(() => publish(live, live.status === 'retrying'));

          if (event.type === 'content_delta' && !answerMarked) {
            answerMarked = true;
            const thinkingMs = Date.now() - startedAt;
            setState((previous) => ({
              ...previous,
              thinkingMs: previous.thinkingMs ?? thinkingMs,
            }));
          }
          if (
            event.type === 'complete' ||
            event.type === 'error' ||
            event.type === 'paused' ||
            event.type === 'cancelled' ||
            event.type === 'stream_end'
          ) {
            terminal = true;
            break;
          }
        }
        if (!terminal) throw new Error('research stream ended before a terminal event');
      } catch (error) {
        if (controller.signal.aborted || genRef.current !== myGen) return;

        const online = typeof navigator === 'undefined' ? true : navigator.onLine;
        setState((previous) => ({
          ...previous,
          isOnline: online,
          error: online ? previous.error : 'You are offline. Research will reconnect when you are back online.',
          errorCode: online ? previous.errorCode : 'network',
        }));

        if (error instanceof StreamingHttpError && SAFE_HTTP_ERRORS[error.status]) {
          const safe = SAFE_HTTP_ERRORS[error.status];
          setState((previous) => ({
            ...previous,
            status: safe.status,
            error: safe.message,
            errorCode: safe.code,
            reconnecting: false,
          }));
          return;
        }

        reconnectAttempt += 1;
        if (reconnectAttempt > maxReconnects) {
          live = reduceAIStream(live, { type: 'error', error: INCOMPLETE_STREAM_ERROR });
          publish(live);
          return;
        }

        const delay = Math.min(30_000, 500 * 2 ** (reconnectAttempt - 1));
        live = reduceAIStream(live, {
          type: 'retrying',
          retry: { attempt: reconnectAttempt, maxAttempts: maxReconnects, retryAfterMs: delay },
        });
        publish(live, true);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (controller.signal.aborted || genRef.current !== myGen) return;
      }
    }

    if (genRef.current !== myGen || controller.signal.aborted) return;

    try {
      const [finalDetail, finalMessages] = await Promise.all([
        deepResearchApi.get(sessionId),
        deepResearchApi.messages(sessionId),
      ]);
      setState((previous) => ({
        ...previous,
        question: latestUserQuestion(finalMessages, finalDetail.question),
        status: finalDetail.status,
        report: finalDetail.report ?? previous.report,
        sources: finalDetail.cited_sources ?? previous.sources,
        phase: finalDetail.generation
          ? phaseLabel(finalDetail.generation.phase, finalDetail.status)
          : phaseLabel(null, finalDetail.status),
        progress: finalDetail.generation?.progress ?? progressForStatus(finalDetail.status),
        sourceCount: finalDetail.generation?.source_count ?? finalDetail.cited_sources?.length ?? previous.sourceCount,
        verificationStatus: finalDetail.generation?.verification_status ?? previous.verificationStatus,
        providerType: finalDetail.generation?.provider_type ?? previous.providerType,
        model: finalDetail.generation?.model ?? previous.model,
        scope: finalDetail.generation?.scope ?? previous.scope,
        effort: finalDetail.generation?.effort ?? previous.effort,
        elapsedMs: finalDetail.generation?.started_at && finalDetail.generation.finished_at
          ? Math.max(0, Date.parse(finalDetail.generation.finished_at) - Date.parse(finalDetail.generation.started_at))
          : previous.elapsedMs,
        messages: finalMessages,
        error: finalDetail.status === 'failed'
          ? previous.error ?? errorForCode(finalDetail.last_error_code)
          : null,
        errorCode: finalDetail.last_error_code ?? previous.errorCode,
        reconnecting: false,
        cancelling: finalDetail.status === 'cancel_requested',
        resuming: false,
      }));
    } catch (error) {
      logger.warn('deep research: failed to finalize', error);
      setState((previous) => ({ ...previous, reconnecting: false }));
    }
  }, []);

  const attach = useCallback((sessionId: number) => {
    void drive(sessionId);
  }, [drive]);

  const resume = useCallback(async () => {
    const id = sessionIdRef.current;
    if (id == null || state.resuming) return;
    setState((previous) => ({ ...previous, resuming: true, error: null, errorCode: null }));
    setState((previous) => ({
      ...previous,
      status: 'queued',
      phase: phaseLabel('queued', 'queued'),
      progress: 0,
      error: null,
      errorCode: null,
    }));
    try {
      await deepResearchApi.resume(id);
      void drive(id);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        resuming: false,
        status: 'paused',
        phase: phaseLabel('paused', 'paused'),
        error: error instanceof Error ? error.message : 'Could not resume this research run.',
        errorCode: 'internal',
      }));
    }
  }, [drive, state.resuming]);

  const cancel = useCallback(async () => {
    const id = sessionIdRef.current;
    if (id == null || (state.status !== 'idle' && TERMINAL_STATUSES.has(state.status)) || state.cancelling) return;
    setState((previous) => ({
      ...previous,
      status: 'cancel_requested',
      phase: phaseLabel('cancelling', 'cancel_requested'),
      progress: Math.max(previous.progress, 95),
      cancelling: true,
      error: null,
      errorCode: null,
    }));
    try {
      await deepResearchApi.cancel(id);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        cancelling: false,
        status: previous.status === 'cancel_requested' ? 'running' : previous.status,
        error: error instanceof Error ? error.message : 'Could not cancel this research run.',
        errorCode: 'internal',
      }));
    }
  }, [state.cancelling, state.status]);

  const followUp = useCallback(async (
    mode: DeepResearchFollowUpMode,
    question: string,
  ) => {
    const id = sessionIdRef.current;
    const trimmed = question.trim();
    if (id == null || !trimmed || state.followUpPending) return null;
    setState((previous) => ({ ...previous, followUpPending: mode, error: null, errorCode: null }));
    let response;
    try {
      response = await deepResearchApi.followUp(id, mode, trimmed);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        followUpPending: null,
        error: error instanceof Error ? error.message : 'Could not continue this research.',
        errorCode: 'internal',
      }));
      throw error;
    }
    const nextMessages = (previous: DeepResearchMessage[]) => {
      const incoming = [response.message, response.assistant_message].filter(
        (message): message is DeepResearchMessage => message != null,
      );
      const byId = new Map(previous.map((message) => [message.id, message]));
      incoming.forEach((message) => byId.set(message.id, message));
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    };
    setState((previous) => ({
      ...previous,
      question: response.message.content,
      status: mode === 'ask' ? 'completed' : response.status,
      messages: nextMessages(previous.messages),
      error: null,
      errorCode: null,
      followUpPending: null,
    }));
    if (mode === 'research') void drive(id);
    return response;
  }, [drive, state.followUpPending]);

  const detach = useCallback(() => {
    genRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    startedAtRef.current = null;
  }, []);

  const reset = useCallback(() => {
    genRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    startedAtRef.current = null;
    setState(INITIAL);
  }, []);

  return { ...state, attach, resume, cancel, followUp, detach, reset };
}

export default useDeepResearchStream;
