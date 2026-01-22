import { useQuery } from '@tanstack/react-query';
import { Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { discoveryApi, type DiscoveredPaperPreview } from '@/lib/api/discovery';
import { DiscoveredPaperCard } from './DiscoveredPaperCard';

interface RecommendationsPanelProps {
  onExploreCitations?: (paper: DiscoveredPaperPreview) => void;
}

export function RecommendationsPanel({ onExploreCitations }: RecommendationsPanelProps) {
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['discovery-recommendations'],
    queryFn: () =>
      discoveryApi.getRecommendations({
        based_on: 'library',
        sources: ['semantic_scholar'],
        limit: 10,
      }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  const recommendations = data?.recommendations || [];

  return (
    <div className="bg-grayscale-8 border border-green-6 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-green-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-green-28" />
          <h3 className="font-medium text-anara-light-text">Recommended Papers</h3>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 text-green-28 hover:text-green-38 hover:bg-green-4 rounded transition-colors disabled:opacity-50"
          title="Refresh recommendations"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-green-28">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Finding recommendations...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-green-34 mb-2">Couldn't load recommendations</p>
            <p className="text-xs text-green-28 mb-4">
              Add more papers to your library to get personalized recommendations
            </p>
            <button
              onClick={() => refetch()}
              className="text-xs text-green-28 hover:text-green-38 underline"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && recommendations.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="w-8 h-8 text-green-28 mx-auto mb-2" />
            <p className="text-sm text-green-34 mb-2">No recommendations yet</p>
            <p className="text-xs text-green-28">
              Add papers with DOIs to your library to get personalized recommendations
            </p>
          </div>
        )}

        {!isLoading && !error && recommendations.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-green-28 mb-3">
              Based on {data?.total || 0} papers in your library
            </p>
            {recommendations.map((paper) => (
              <DiscoveredPaperCard
                key={`${paper.source}-${paper.external_id}`}
                paper={paper}
                onExploreCitations={onExploreCitations}
                showCitationButton={paper.source === 'semantic_scholar'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
