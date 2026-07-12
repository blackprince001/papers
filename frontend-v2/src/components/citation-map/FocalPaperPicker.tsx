import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { papersApi, type Paper } from '@/lib/api/papers';
import { citationMapApi } from '@/lib/api/citationMap';
import { toastError } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';

interface FocalPaperPickerProps {
  focalIds: number[];
  className?: string;
}

export function FocalPaperPicker({ focalIds, className }: FocalPaperPickerProps) {
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: papersData, isLoading } = useQuery({
    queryKey: ['papers', 1, 100, query],
    queryFn: () => papersApi.list(1, 100, query || undefined),
  });

  const addMutation = useMutation({
    mutationFn: (paperId: number) => citationMapApi.addFocal(paperId),
    onSuccess: (res) => queryClient.setQueryData(['citation-map'], res),
    onError: () => toastError('Failed to add paper to the map'),
  });

  const focalSet = useMemo(() => new Set(focalIds), [focalIds]);
  const papers: Paper[] = papersData?.papers ?? [];

  return (
    <div className={cn('flex flex-col md:border-r border-b md:border-b-0 border-(--border) bg-(--card)', className)}>
      <div className="p-3 border-b border-(--border)">
        <div className="relative">
          <SearchIcon size="sm" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--muted-foreground)" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library…"
            className="w-full pl-8 pr-3 h-8 text-caption bg-(--background) border border-(--border) rounded-lg text-(--foreground) placeholder:text-(--muted-foreground) focus:outline-none focus:border-(--foreground) transition-colors"
          />
        </div>
        <p className="text-caption text-(--muted-foreground) mt-2">
          Add papers to chart their citations
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : papers.length === 0 ? (
          <EmptyState
            size="row"
            title={query ? `No papers matching "${query}"` : 'No papers in library'}
          />
        ) : (
          <ul className="divide-y divide-(--border)">
            {papers.map((paper) => {
              const isFocal = focalSet.has(paper.id);
              const author = (paper.metadata_json?.author as string | undefined) ??
                (paper.metadata_json?.authors as string | undefined);
              const pending = addMutation.isPending && addMutation.variables === paper.id;

              return (
                <li key={paper.id} className="px-3 py-2 group hover:bg-(--muted) transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-caption font-medium text-(--foreground) line-clamp-2 leading-snug">
                        {paper.title}
                      </p>
                      {author && (
                        <p className="text-caption text-(--muted-foreground) mt-0.5 line-clamp-1">{author}</p>
                      )}
                    </div>
                    {isFocal ? (
                      <CheckCircleIcon size="md" filled className="shrink-0 mt-0.5 text-(--foreground)" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => addMutation.mutate(paper.id)}
                        disabled={pending}
                        aria-label="Add to map"
                        className="shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded hover:bg-(--border) text-(--muted-foreground) hover:text-(--foreground) transition-colors"
                      >
                        {pending ? <Spinner size="xs" /> : <PlusIcon size="sm" />}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
