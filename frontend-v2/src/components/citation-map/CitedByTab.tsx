import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLinkIcon,
  InfoCircleIcon,
  QuoteIcon,
  SearchIcon,
} from '@/components/icons';
import { papersApi, type Paper } from '@/lib/api/papers';
import { citationMapApi, type CitedByPaper } from '@/lib/api/citationMap';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CitationIllustration } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

function CitedByRow({ c }: { c: CitedByPaper }) {
  const meta = [
    c.authors.length ? c.authors.slice(0, 3).join(', ') + (c.authors.length > 3 ? ' et al.' : '') : null,
    c.year,
    c.citation_count != null ? `${c.citation_count} citations` : null,
  ].filter(Boolean).join(' · ');

  const url = c.url ?? (c.doi ? `https://doi.org/${c.doi}` : c.s2_id ? `https://www.semanticscholar.org/paper/${c.s2_id}` : null);

  return (
    <li className="px-4 py-3 hover:bg-(--muted) transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-code font-medium text-(--foreground) line-clamp-2 leading-snug">
            {c.title || 'Untitled'}
          </p>
          {meta && <p className="text-caption text-(--muted-foreground) mt-0.5">{meta}</p>}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 mt-0.5 text-(--muted-foreground) hover:text-(--foreground) transition-colors"
            aria-label="Open"
          >
            <ExternalLinkIcon size="sm" />
          </a>
        )}
      </div>
    </li>
  );
}

export function CitedByTab() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Paper | null>(null);

  const { data: papersData } = useQuery({
    queryKey: ['papers', 1, 100, query],
    queryFn: () => papersApi.list(1, 100, query || undefined),
    enabled: !selected,
  });

  const results = useMemo(() => (papersData?.papers ?? []).slice(0, 20), [papersData]);

  const PAGE_SIZE = 25;
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['cited-by', selected?.id],
    queryFn: ({ pageParam }) => citationMapApi.citedBy(selected!.id, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.offset + last.limit : undefined),
    enabled: !!selected,
  });

  const resolved = data?.pages[0]?.resolved ?? true;
  const citations = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.citations),
    [data]
  );

  if (!selected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="relative mb-4">
          <SearchIcon size="md" className="absolute left-3 top-1/2 -translate-y-1/2 text-(--muted-foreground)" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library for a paper…"
            className="w-full pl-9 pr-4 h-10 bg-(--card) border border-(--border) rounded-xl text-code text-(--foreground) placeholder:text-(--muted-foreground) focus:outline-none focus:border-(--foreground) transition-colors"
          />
        </div>
        <ul className="rounded-xl border border-(--border) divide-y divide-(--border) overflow-hidden bg-(--card)">
          {results.length === 0 ? (
            <li><EmptyState size="row" title="No papers found" /></li>
          ) : (
            results.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelected(p)}
                  className="w-full text-left px-4 py-3 hover:bg-(--muted) transition-colors"
                >
                  <p className="text-code font-medium text-(--foreground) line-clamp-1">{p.title}</p>
                  {!!p.metadata_json?.author && (
                    <p className="text-caption text-(--muted-foreground) mt-0.5 line-clamp-1">
                      {p.metadata_json.author as string}
                    </p>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-body font-semibold text-(--foreground) line-clamp-1">{selected.title}</p>
          <button
            onClick={() => navigate(`/papers/${selected.id}`)}
            className="text-caption text-(--muted-foreground) hover:text-(--foreground) transition-colors"
          >
            Open paper
          </button>
        </div>
        <button
          onClick={() => setSelected(null)}
          className="shrink-0 px-2.5 h-8 text-caption font-medium bg-(--muted) text-(--foreground) border border-(--border) rounded-lg hover:bg-(--border) transition-colors"
        >
          Change
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-(--border) bg-(--card) divide-y divide-(--border)">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="px-4 py-3 space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : !resolved ? (
        <div className="flex items-start gap-2 rounded-xl border border-(--border) bg-(--muted) px-4 py-3 text-caption text-(--muted-foreground)">
          <InfoCircleIcon size="sm" className="shrink-0 mt-0.5" />
          <span>Couldn’t find this paper on Semantic Scholar, so citing works are unavailable.</span>
        </div>
      ) : citations.length === 0 ? (
        <div className="rounded-xl border border-(--border) bg-(--card)">
          <EmptyState size="panel" illustration={CitationIllustration} title="No citing works found yet" />
        </div>
      ) : (
        <>
          <p className={cn('flex items-center gap-1.5 text-caption text-(--muted-foreground) mb-2')}>
            <QuoteIcon size="sm" /> Showing {citations.length} paper{citations.length !== 1 ? 's' : ''} that cite this work
          </p>
          <ul className="rounded-xl border border-(--border) divide-y divide-(--border) overflow-hidden bg-(--card)">
            {citations.map((c, i) => (
              <CitedByRow key={c.s2_id ?? i} c={c} />
            ))}
          </ul>
          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-3 flex w-full items-center justify-center h-9 text-code font-semibold bg-(--muted) text-(--foreground) border border-(--border) rounded-lg hover:bg-(--border) transition-colors disabled:opacity-60"
            >
              {isFetchingNextPage ? <Spinner size="xs" /> : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
