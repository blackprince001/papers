import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SearchIcon, PlusIcon } from '@/components/icons';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaperCard } from '@/components/PaperCard';
import { ExpandedInput } from '@/components/ExpandedInput';
import { papersApi } from '@/lib/api/papers';

export default function Home() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (q?: string) => {
    const term = (q ?? query).trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['papers', 1, 6, undefined, { sort_by: 'date_added', sort_order: 'desc' }],
    queryFn: () => papersApi.list(1, 6, undefined, { sort_by: 'date_added', sort_order: 'desc' }),
    staleTime: 2 * 60 * 1000,
  });

  const papers = data?.papers ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="min-h-full flex flex-col">
      {/* ── Hero ── */}
      <div className="flex flex-col items-center px-4 sm:px-6 pt-12 sm:pt-20 pb-10 sm:pb-16">
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-section-title sm:text-display font-bold tracking-tight text-(--foreground) leading-none mb-2">
            Lumen
          </h1>
          <p className="text-body sm:text-btn text-(--muted-foreground) max-w-sm mx-auto leading-relaxed">
            Your personal research library
          </p>
        </div>

        {/* Hero search */}
        <div className="w-full max-w-2xl">
          <ExpandedInput
            value={query}
            onChange={setQuery}
            onSubmit={() => handleSearch()}
            placeholder="Search your library..."
            submitLabel="Search"
            submitIcon={<SearchIcon size="sm" />}
            autoFocus
          />
        </div>
      </div>

      {/* ── Papers grid ── */}
      <div className="flex-1 px-4 sm:px-6 py-6 sm:py-10">
        <div className="max-w-content mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h4 className="text-btn font-semibold text-(--foreground)">
              Recent Papers: {total > 0 && ` · ${total} papers`}
            </h4>
            <Link to="/ingest" aria-label="Add paper">
              <Button variant="primary" icon={<PlusIcon size="sm" />} className="px-2.5 sm:px-4">
                <span className="hidden sm:inline">Add Paper</span>
              </Button>
            </Link>
          </div>

          {/* Grid — matches PapersList exactly */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-(--border) p-5 h-44 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded" />
                    <Skeleton className="h-5 w-12 rounded" />
                  </div>
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              ))}
            </div>
          ) : papers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {papers.map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-(--muted-foreground) mb-4">Your groups are empty</p>
              <Link to="/ingest">
                <Button variant="outlined">Add your first paper</Button>
              </Link>
            </div>
          )}

          {/* See all link */}
          {total > 6 && (
            <div className="mt-6 text-center">
              <Link
                to="/papers"
                className="text-code font-medium text-(--muted-foreground) hover:text-(--foreground) transition-colors"
              >
                View all {total} papers →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
