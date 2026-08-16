import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { chatStreamClient, StreamingHttpError, type StreamEvent } from '@/lib/ai/chatStream';
import {
  deepResearchApi,
  type CitedSource,
  type DeepResearchSessionDetail,
  type DeepResearchStatus,
} from '@/lib/api/deepResearch';
import { logger } from '@/lib/logger';
import {
  summarizeArgs,
  type Activity,
  type ActivityThought,
  type ActivityTool,
} from '@/lib/ai/reasoning';

export interface DeepResearchStreamState {
  sessionId: number | null;
  question: string;
  status: DeepResearchStatus | 'idle';
  /** Ordered feed of reasoning + tool steps, exactly as they streamed. */
  activity: Activity[];
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

const TERMINAL_EVENTS = new Set(['done', 'end', 'paused', 'error', 'cancelled']);
const TOOL_ERROR = /^error\b/i;

let counter = 0;

function reduce(evt: StreamEvent, prev: DeepResearchStreamState): DeepResearchStreamState {
  switch (evt.type) {
    case 'retrying':
      return { ...prev, status: 'running', reconnecting: true, error: (evt.error as string) ?? null, errorCode: (evt.error_code as string) ?? 'retrying' };

    case 'chunk':
      return { ...prev, report: prev.report + (evt.content ?? '') };

    case 'thought': {
      const delta = (evt.content as string) ?? '';
      if (!delta) return prev;
      const last = prev.activity[prev.activity.length - 1];
      if (last && last.kind === 'thought') {
        const updated: ActivityThought = { ...last, content: last.content + delta };
        return { ...prev, activity: [...prev.activity.slice(0, -1), updated] };
      }
      const block: ActivityThought = {
        id: ++counter, kind: 'thought', content: delta, timestamp: Date.now(),
      };
      return { ...prev, activity: [...prev.activity, block] };
    }

    case 'tool_call': {
      const step: ActivityTool = {
        id: ++counter,
        kind: 'tool',
        tool: (evt.tool as string) ?? 'tool',
        argSummary: summarizeArgs(evt.arguments as Record<string, unknown> | undefined),
        status: 'running',
        timestamp: Date.now(),
      };
      return { ...prev, activity: [...prev.activity, step] };
    }

    case 'tool_result': {
      const tool = (evt.tool as string) ?? '';
      const result = (evt.result as string) ?? '';
      // Complete the most recent still-running call for this tool.
      const idx = [...prev.activity]
        .map((a, i) => [a, i] as const)
        .reverse()
        .find(([a]) => a.kind === 'tool' && a.tool === tool && a.status === 'running')?.[1];
      if (idx === undefined) return prev;
      const item = prev.activity[idx] as ActivityTool;
      const updated: ActivityTool = {
        ...item,
        result,
        status: TOOL_ERROR.test(result.trim()) ? 'error' : 'complete',
      };
      const activity = [...prev.activity];
      activity[idx] = updated;
      return { ...prev, activity };
    }

    case 'paused':
      return {
        ...prev,
        status: 'paused',
        error: (evt.error as string) ?? null,
        errorCode: (evt.error_code as string) ?? null,
      };
    case 'error':
      return {
        ...prev,
        status: 'failed',
        error: (evt.error as string) ?? 'Run failed',
        errorCode: (evt.error_code as string) ?? null,
      };
    case 'done':
      return { ...prev, status: 'completed', report: (evt.content as string) || prev.report };
    case 'cancelled':
      return { ...prev, status: 'cancelled', error: (evt.error as string) ?? null };
    case 'end':
      return { ...prev, status: (evt.status as DeepResearchStatus) ?? prev.status };
    default:
      return prev;
  }
}

/**
 * Drives a deep-research run's SSE stream. Fetches the authoritative snapshot
 * first, follows the live stream (reconnecting on drops while the run is still
 * active), then reconciles with the persisted result when it ends.
 */
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
    counter = 0;
    setState({ ...INITIAL, sessionId, status: 'running' });

    // Authoritative snapshot first (also short-circuits terminal runs).
    let detail: DeepResearchSessionDetail | null = null;
    try {
      detail = await deepResearchApi.get(sessionId);
    } catch (e) {
      logger.warn('deep research: failed to load detail', e);
    }
    if (genRef.current !== myGen) return;
    if (detail) {
      setState((prev) => ({
        ...prev,
        question: detail!.question,
        status: detail!.status,
        report: detail!.report ?? '',
        sources: detail!.cited_sources ?? [],
        errorCode: detail!.last_error_code ?? null,
      }));
      if (detail.status === 'completed' || detail.status === 'failed') return;
    }

    // Live: resume from the last durable cursor after a dropped connection.
    let terminal = false;
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    let reconnectAttempt = 0;
    const maxReconnects = 6;
    setState((prev) => ({ ...prev, activity: [], report: '', reconnecting: false }));

    while (!controller.signal.aborted && genRef.current === myGen && !terminal) {
      const startedAt = Date.now();
      let answerMarked = false;
      try {
        for await (const evt of chatStreamClient.streamDeepResearch(sessionId, {
          signal: controller.signal,
          timeoutMs: 45_000,
          cursor,
        })) {
          if (evt.id) {
            if (seenCursors.has(evt.id)) continue;
            if (seenCursors.size >= 2048) seenCursors.clear();
            seenCursors.add(evt.id);
            cursor = evt.id;
          }
          if (evt.type === 'keepalive') continue;
          flushSync(() => setState((prev) => reduce(evt, prev)));
          if (evt.type === 'chunk' && !answerMarked) {
            answerMarked = true;
            const ms = Date.now() - startedAt;
            setState((prev) => ({ ...prev, thinkingMs: prev.thinkingMs ?? ms }));
          }
          if (TERMINAL_EVENTS.has(evt.type)) terminal = true;
        }
        if (!terminal) throw new Error('Research stream ended before a terminal event');
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof StreamingHttpError && (err.status === 403 || err.status === 404 || err.status === 409)) {
          setState((prev) => ({
            ...prev,
            status: err.status === 409 ? 'paused' : 'failed',
            error: err.message,
            errorCode: `http_${err.status}`,
            reconnecting: false,
          }));
          return;
        }
        reconnectAttempt += 1;
        if (reconnectAttempt > maxReconnects) {
          setState((prev) => ({
            ...prev,
            status: 'failed',
            error: 'Research stream could not reconnect',
            errorCode: 'network',
            reconnecting: false,
          }));
          return;
        }
        const delay = Math.min(30_000, 500 * 2 ** (reconnectAttempt - 1));
        setState((prev) => ({ ...prev, reconnecting: true, errorCode: 'network' }));
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (controller.signal.aborted || genRef.current !== myGen) return;
      }
    }
    // Reconcile with the persisted result.
    if (genRef.current === myGen && !controller.signal.aborted) {
      try {
        const d = await deepResearchApi.get(sessionId);
        setState((prev) => ({
          ...prev,
          status: d.status,
          report: d.report ?? prev.report,
          sources: d.cited_sources ?? prev.sources,
          errorCode: d.last_error_code ?? prev.errorCode,
          reconnecting: false,
        }));
      } catch (e) {
        logger.warn('deep research: failed to finalize', e);
      }
    }
  }, []);

  const attach = useCallback(
    (sessionId: number) => {
      void drive(sessionId);
    },
    [drive],
  );

  const resume = useCallback(async () => {
    const id = sessionIdRef.current;
    if (id == null) return;
    await deepResearchApi.resume(id);
    void drive(id);
  }, [drive]);

  const detach = useCallback(() => {
    genRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    genRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    setState(INITIAL);
  }, []);

  return { ...state, attach, resume, detach, reset };
}

export default useDeepResearchStream;
