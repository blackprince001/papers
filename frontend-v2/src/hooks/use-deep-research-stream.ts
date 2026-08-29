import { useCallback, useRef, useState } from 'react';
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
  /** Wall-clock ms spent reasoning before the answer began (null until known). */
  thinkingMs: number | null;
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
  thinkingMs: null,
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

/** Drives a deep-research stream, reconnecting and reconciling to its snapshot. */
export function useDeepResearchStream() {
  const [state, setState] = useState<DeepResearchStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const sessionIdRef = useRef<number | null>(null);

  const drive = useCallback(async (sessionId: number) => {
    const myGen = ++genRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = sessionId;
    setState({ ...INITIAL, sessionId, status: 'running' });

    let detail: DeepResearchSessionDetail | null = null;
    try {
      detail = await deepResearchApi.get(sessionId);
    } catch (error) {
      logger.warn('deep research: failed to load detail', error);
    }
    if (genRef.current !== myGen) return;

    let baseStatus: DeepResearchStatus | 'idle' = 'running';
    if (detail) {
      baseStatus = detail.status;
      setState((previous) => ({
        ...previous,
        question: detail!.question,
        status: detail!.status,
        report: detail!.report ?? '',
        sources: detail!.cited_sources ?? [],
        error: detail!.last_error_code ? errorForCode(detail!.last_error_code) : null,
        errorCode: detail!.last_error_code ?? null,
      }));
      if (detail.status === 'completed' || detail.status === 'failed') return;
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
      error: null,
      errorCode: null,
      reconnecting: false,
    }));

    const publish = (next: AIStreamState, reconnecting = false) => {
      setState((previous) => ({
        ...previous,
        status: statusForLive(next, baseStatus),
        activity: next.activities,
        report: next.content,
        error: next.error?.message ?? null,
        errorCode: next.error?.code ?? null,
        reconnecting,
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
      const finalDetail = await deepResearchApi.get(sessionId);
      setState((previous) => ({
        ...previous,
        status: finalDetail.status,
        report: finalDetail.report ?? previous.report,
        sources: finalDetail.cited_sources ?? previous.sources,
        error: finalDetail.status === 'failed'
          ? previous.error ?? errorForCode(finalDetail.last_error_code)
          : null,
        errorCode: finalDetail.last_error_code ?? previous.errorCode,
        reconnecting: false,
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
    if (id == null) return;
    await deepResearchApi.resume(id);
    void drive(id);
  }, [drive]);

  const detach = useCallback(() => {
    genRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    genRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    setState(INITIAL);
  }, []);

  return { ...state, attach, resume, detach, reset };
}

export default useDeepResearchStream;
