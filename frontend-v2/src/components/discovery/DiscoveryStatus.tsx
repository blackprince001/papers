import { motion, AnimatePresence } from 'motion/react';
import { CheckCircleIcon } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { SearchStatus, TimelineEntry } from '@/hooks/use-ai-search-stream';

interface DiscoveryStatusProps {
  status: SearchStatus | null;
  timeline: TimelineEntry[];
  isSearching: boolean;
}

const STAGE_LABEL: Record<string, string> = {
  starting: 'Initializing',
  understanding: 'Understanding query',
  searching: 'Searching sources',
  source_results: 'Source complete',
  analyzing: 'Analyzing results',
  enhancing: 'Generating insights',
  overview: 'Building overview',
  clustering: 'Clustering topics',
  relevance: 'Ranking relevance',
  complete: 'Complete',
};

// The AI insight stages all read every paper to produce the overview, topic
// clusters, and per-paper relevance notes — this can take a few minutes on
// slower providers, so set expectations rather than looking stalled.
const AI_INSIGHT_HINT =
  'Reading all results to build the overview, topic clusters, and relevance notes. This can take a few minutes — clustering and relevance run in the background.';

const STAGE_HINT: Record<string, string> = {
  enhancing: AI_INSIGHT_HINT,
  overview: AI_INSIGHT_HINT,
  clustering: AI_INSIGHT_HINT,
  relevance: AI_INSIGHT_HINT,
};

export function DiscoveryStatus({ status, timeline, isSearching }: DiscoveryStatusProps) {
  if (!isSearching && (!status || status.stage === 'complete')) return null;

  const progress = Math.max(0, Math.min(100, status?.progress ?? 0));
  const headline = status?.message || 'Searching…';
  const stageLabel = STAGE_LABEL[status?.stage ?? 'starting'] ?? 'Searching';
  const hint = status?.stage ? STAGE_HINT[status.stage] : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="bg-(--card) border border-(--border) rounded-xl mb-6 overflow-hidden"
    >
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {isSearching ? (
              <Spinner size="xs" className="text-(--muted-foreground) shrink-0" />
            ) : (
              <CheckCircleIcon size="sm" className="text-(--foreground) shrink-0" />
            )}
            <span className="text-caption uppercase tracking-wider text-(--muted-foreground) font-medium shrink-0">
              {stageLabel}
            </span>
            {status?.source && (
              <>
                <span className="text-(--border)">·</span>
                <span className="text-caption text-(--foreground) truncate">
                  {status.source}
                </span>
              </>
            )}
          </div>
          <span className="text-caption text-(--muted-foreground) tabular-nums shrink-0">
            {progress}%
          </span>
        </div>

        <p className="text-code text-(--foreground) leading-snug">
          {headline}
        </p>
        {hint && (
          <p className="text-caption text-(--muted-foreground) leading-snug mt-1.5">
            {hint}
          </p>
        )}
      </div>

      <div className="relative h-px w-full bg-(--border)">
        <motion.div
          className="absolute top-0 left-0 h-full bg-(--foreground)"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
        />
      </div>

      {timeline.length > 0 && (
        <ol className="px-5 py-3 space-y-1.5 max-h-48 overflow-y-auto">
          <AnimatePresence initial={false}>
            {timeline.map((entry, idx) => {
              const isLast = idx === timeline.length - 1;
              return (
                <motion.li
                  key={entry.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-2.5 text-code"
                >
                  <span
                    className={cn(
                      'mt-1.5 w-1 h-1 rounded-full shrink-0',
                      isLast && isSearching
                        ? 'bg-(--foreground)'
                        : 'bg-(--muted-foreground) opacity-50'
                    )}
                  />
                  <span
                    className={cn(
                      'truncate',
                      isLast && isSearching
                        ? 'text-(--foreground)'
                        : 'text-(--muted-foreground)'
                    )}
                  >
                    {entry.message}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </motion.div>
  );
}
