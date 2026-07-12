import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { paperAuthors, paperYear } from '@/lib/paper-display';
import { toastError } from '@/lib/utils/toast';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SparklesIcon } from '@/components/icons';
import type { Paper } from '@/lib/api/papers';

/**
 * Extra details for the Finder preview panes (columns + gallery): authors,
 * year, tags, and the paper's AI summary, fetched lazily when the pane shows.
 */
export function PaperInfoPanel({ paper }: { paper: Paper }) {
  const queryClient = useQueryClient();
  const [polling, setPolling] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['paper-summary', paper.id],
    queryFn: () => aiFeaturesApi.getSummary(paper.id),
    staleTime: Infinity,
    retry: false,
    refetchInterval: polling ? 4000 : false,
  });

  const summary = data?.summary?.trim() || null;
  if (summary && polling) setPolling(false);

  const authors = paperAuthors(paper);
  const year = paperYear(paper);

  const generate = async () => {
    try {
      await aiFeaturesApi.generateSummary(paper.id);
      setPolling(true);
      void queryClient.invalidateQueries({ queryKey: ['paper-summary', paper.id] });
    } catch {
      toastError('Failed to start summary generation');
    }
  };

  return (
    <div className="border-t pt-3 text-xs">
      {(authors || year) && (
        <dl className="mb-3 space-y-1">
          {authors && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Authors</dt>
              <dd className="line-clamp-2 text-right">{authors}</dd>
            </div>
          )}
          {year && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Year</dt>
              <dd className="text-right">{year}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="mb-1.5 font-semibold">Summary</div>
      {summary ? (
        <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {summary}
        </p>
      ) : polling ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Spinner size="xs" aria-hidden />
          <span>Generating summary…</span>
        </div>
      ) : isLoading ? (
        <SkeletonText lines={3} />
      ) : (
        <EmptyState
          size="panel"
          icon={SparklesIcon}
          title="No summary yet"
          actions={
            <button
              type="button"
              onClick={generate}
              className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-accent"
            >
              Generate summary
            </button>
          }
        />
      )}
    </div>
  );
}
