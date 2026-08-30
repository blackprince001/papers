import { useQuery } from '@tanstack/react-query';
import { RefreshIcon } from '@/components/icons';
import { Link } from 'react-router-dom';
import { discoveryApi } from '@/lib/api/discovery';
import { DiscoveredPaperCard } from '@/components/discovery/DiscoveredPaperCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ActivityIllustration } from '@/components/illustrations';

export default function Recommendations() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['discovery-recommendations'],
    queryFn: () =>
      discoveryApi.getRecommendations({
        based_on: 'library',
        sources: ['semantic_scholar'],
        limit: 20,
      }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const recommendations = data?.recommendations || [];

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-page-title mb-1">Recommended Papers</h1>
        <p className="text-body text-(--muted-foreground)">
          Personalized recommendations based on your library
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="text-code text-(--muted-foreground) min-w-0 truncate">
          {data?.total !== undefined && data.total > 0 && (
            <span>Found {data.total} recommendations</span>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={() => refetch()}
          loading={isFetching}
          icon={<RefreshIcon size="sm" />}
          className="px-2.5 sm:px-3 shrink-0"
          aria-label="Refresh recommendations"
        >
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-(--border) overflow-hidden">
              {/* Header skeleton */}
              <div className="flex items-center justify-between px-4 py-3">
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-4 w-12" />
              </div>
              {/* Inset content skeleton */}
              <div className="rounded-t-xl border-t border-(--border) bg-(--card) px-4 pt-3 pb-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorState
          size="page"
          title="Couldn't load recommendations"
          description="Make sure you have papers with DOIs in your library. Recommendations are generated based on your existing papers."
          onRetry={() => refetch()}
          retrying={isFetching}
          actions={
            <Link to="/papers">
              <Button variant="primary">Go to Library</Button>
            </Link>
          }
        />
      )}

      {/* Empty State */}
      {!isLoading && !error && recommendations.length === 0 && (
        <EmptyState
          size="page"
          illustration={ActivityIllustration}
          titleAs="h2"
          title="No recommendations yet"
          description="Add more papers with DOIs to your library to get personalized recommendations based on your research interests."
          actions={
            <>
              <Link to="/discovery">
                <Button variant="ghost">Discover Papers</Button>
              </Link>
              <Link to="/ingest">
                <Button variant="primary">Add Papers</Button>
              </Link>
            </>
          }
        />
      )}

      {/* Results */}
      {!isLoading && !error && recommendations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recommendations.map((paper) => (
            <DiscoveredPaperCard key={`${paper.source}-${paper.external_id}`} paper={paper} />
          ))}
        </div>
      )}
    </div>
  );
}
