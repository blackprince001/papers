import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  papersApi,
  type ProcessingProgressEvent,
  type ProcessingStepName,
  type ProcessingStepStatus,
} from '@/lib/api/papers';
import { toastInsufficientBalance, toastProcessingFailed } from '@/lib/utils/toast';

/** Tracks which paper+status combos have already been toasted, module-level so
 *  it survives mount/unmount cycles (Strict Mode, navigation). */
const toasted = new Set<string>();

export const PIPELINE_STEPS: { name: ProcessingStepName; label: string }[] = [
  { name: 'citations', label: 'Citations' },
  { name: 'summary', label: 'Summary' },
  { name: 'findings', label: 'Key findings' },
  { name: 'reading_guide', label: 'Reading guide' },
  { name: 'highlights', label: 'Highlights' },
  { name: 'embedding', label: 'Search indexing' },
];

const RUNNING_LABELS: Record<ProcessingStepName, string> = {
  citations: 'Extracting citations…',
  summary: 'Generating summary…',
  findings: 'Extracting key findings…',
  reading_guide: 'Building reading guide…',
  highlights: 'Generating highlights…',
  embedding: 'Indexing for search…',
  finalize: 'Finishing up…',
};

/** Query keys to refresh when a pipeline step completes. */
const INVALIDATE_BY_STEP: Record<string, (paperId: number) => unknown[][]> = {
  citations: (id) => [['citations-list', id]],
  summary: (id) => [['ai-summary', id], ['paper-summary', id]],
  findings: (id) => [['ai-findings', id]],
  reading_guide: (id) => [['ai-reading-guide', id]],
  highlights: (id) => [['annotations', id]],
  finalize: (id) => [['paper', id], ['papers']],
};

export interface StepState {
  name: ProcessingStepName;
  label: string;
  status: ProcessingStepStatus | 'pending';
  reason?: string;
  error?: string;
  count?: number;
}

export interface ProcessingProgressState {
  steps: StepState[];
  completedCount: number;
  totalSteps: number;
  currentStepLabel: string | null;
  hasFailures: boolean;
  failureErrors: string[];
  hasBalanceError: boolean;
  skippedForNoProvider: boolean;
  done: boolean;
  isActive: boolean;
}

export function useProcessingProgress(
  paperId: number | undefined,
  enabled: boolean,
): ProcessingProgressState {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['paper-progress', paperId],
    queryFn: () => papersApi.getProgress(paperId!),
    enabled: !!paperId && enabled,
    refetchInterval: (query) => (query.state.data?.done ? false : 2500),
  });

  const events = useMemo(() => data?.events ?? [], [data]);

  // Latest marker wins per step.
  const latestByStep = useMemo(() => {
    const map = new Map<string, ProcessingProgressEvent>();
    for (const e of events) map.set(e.step, e);
    return map;
  }, [events]);

  // Refresh each step's content query the moment it lands.
  const invalidatedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!paperId) return;
    for (const [step, e] of latestByStep) {
      const key = `${step}:${e.status}`;
      if (e.status === 'running' || invalidatedRef.current.has(key)) continue;
      invalidatedRef.current.add(key);
      for (const qk of INVALIDATE_BY_STEP[step]?.(paperId) ?? []) {
        void queryClient.invalidateQueries({ queryKey: qk });
      }
    }
  }, [latestByStep, paperId, queryClient]);

  // Fire a toast when the pipeline finishes with errors.
  const done = data?.done ?? false;
  useEffect(() => {
    if (!paperId || !done) return;
    const key = `toast:${paperId}`;
    if (toasted.has(key)) return;
    toasted.add(key);

    const failures = [...latestByStep.values()].some((e) => e.status === 'failed');
    if (!failures) return;

    const balanceError = [...latestByStep.values()].some(
      (e) =>
        e.status === 'failed' &&
        /402|insufficient.*(balance|quota)|quota|billing/i.test(e.error ?? ''),
    );

    if (balanceError) {
      toastInsufficientBalance();
    } else {
      toastProcessingFailed();
    }
  }, [paperId, done, latestByStep]);

  return useMemo(() => {
    const steps: StepState[] = PIPELINE_STEPS.map((s) => {
      const e = latestByStep.get(s.name);
      return {
        name: s.name,
        label: s.label,
        status: e?.status ?? 'pending',
        reason: e?.reason,
        error: e?.error,
        count: e?.count ?? e?.citations_count,
      };
    });

    const completedCount = steps.filter(
      (s) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed',
    ).length;
    const running = steps.find((s) => s.status === 'running');
    const hasFailures = steps.some((s) => s.status === 'failed');
    const skippedForNoProvider = steps.some(
      (s) => s.status === 'skipped' && (s.reason ?? '').includes('no provider'),
    );
    const failureErrors = steps
      .filter((s): s is StepState & { error: string } => !!s.error)
      .map((s) => s.error);
    const hasBalanceError = failureErrors.some((err) =>
      /402|insufficient.*(balance|quota)|quota|billing/i.test(err),
    );

    return {
      steps,
      completedCount,
      totalSteps: PIPELINE_STEPS.length,
      currentStepLabel: running ? RUNNING_LABELS[running.name] : null,
      hasFailures,
      failureErrors,
      hasBalanceError,
      skippedForNoProvider,
      done: data?.done ?? false,
      isActive: !!data && !data.done,
    };
  }, [latestByStep, data]);
}
