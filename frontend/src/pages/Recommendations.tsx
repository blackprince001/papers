import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, RefreshCw, Library } from 'lucide-react';
import { Link } from 'react-router-dom';
import { discoveryApi, type DiscoveredPaperPreview } from '@/lib/api/discovery';
import { DiscoveredPaperCard } from '@/components/discovery/DiscoveredPaperCard';
import { CitationExplorer } from '@/components/discovery/CitationExplorer';

export default function Recommendations() {
  const [citationPaper, setCitationPaper] = useState<DiscoveredPaperPreview | null>(null);

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
        limit: 20,
      }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const recommendations = data?.recommendations || [];

  const handleExploreCitations = (paper: DiscoveredPaperPreview) => {
    setCitationPaper(paper);
  };

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-corca-blue-light rounded-full mb-4">
              <Sparkles className="w-8 h-8 text-green-28" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-medium text-anara-light-text mb-2">
              Recommended Papers
            </h1>
            <p className="text-green-34 max-w-lg mx-auto">
              Personalized paper recommendations based on your library
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm text-green-28">
              {data?.total !== undefined && data.total > 0 && (
                <span>Found {data.total} recommendations</span>
              )}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 px-4 py-2 text-sm text-green-28 hover:text-green-38 border border-green-6 rounded-sm hover:bg-green-4 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-green-28">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span>Finding papers you might like...</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-16">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-anara-light-text mb-2">
                Couldn't load recommendations
              </h2>
              <p className="text-sm text-green-34 mb-6 max-w-md mx-auto">
                Make sure you have papers with DOIs in your library. Recommendations are generated based on your existing papers.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 text-sm text-green-28 hover:text-green-38 border border-green-6 rounded-sm hover:bg-green-4 transition-colors"
                >
                  Try again
                </button>
                <Link
                  to="/"
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-green-28 text-white rounded-sm hover:bg-green-38 transition-colors"
                >
                  <Library className="w-4 h-4" />
                  Go to Library
                </Link>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && recommendations.length === 0 && (
            <div className="text-center py-16">
              <Sparkles className="w-12 h-12 text-green-28 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-anara-light-text mb-2">
                No recommendations yet
              </h2>
              <p className="text-sm text-green-34 mb-6 max-w-md mx-auto">
                Add more papers with DOIs to your library to get personalized recommendations based on your research interests.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Link
                  to="/discovery"
                  className="px-4 py-2 text-sm text-green-28 hover:text-green-38 border border-green-6 rounded-sm hover:bg-green-4 transition-colors"
                >
                  Discover Papers
                </Link>
                <Link
                  to="/ingest"
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-green-28 text-white rounded-sm hover:bg-green-38 transition-colors"
                >
                  Add Papers
                </Link>
              </div>
            </div>
          )}

          {/* Results */}
          {!isLoading && !error && recommendations.length > 0 && (
            <div className="space-y-4">
              {recommendations.map((paper) => (
                <DiscoveredPaperCard
                  key={`${paper.source}-${paper.external_id}`}
                  paper={paper}
                  onExploreCitations={handleExploreCitations}
                  showCitationButton={paper.source === 'semantic_scholar'}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Citation Explorer Modal */}
      {citationPaper && (
        <CitationExplorer
          paper={citationPaper}
          isOpen={!!citationPaper}
          onClose={() => setCitationPaper(null)}
          onSelectPaper={(paper) => {
            setCitationPaper(paper);
          }}
        />
      )}
    </div>
  );
}
