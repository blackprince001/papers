import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2, Clock, Search, ChevronRight, Loader2, FileText, Sparkles } from 'lucide-react';
import {
  discoveryApi,
  type DiscoverySession,
  type DiscoverySearchFilters,
  type DiscoveredPaperPreview,
  type QueryUnderstanding,
  type SearchOverview,
  type ClusteringResult,
  type PaperRelevanceExplanation,
} from '@/lib/api/discovery';

export interface LoadedSession {
  query: string;
  sources: string[];
  filters: DiscoverySearchFilters;
  papers: DiscoveredPaperPreview[];
  queryUnderstanding?: QueryUnderstanding | null;
  overview?: SearchOverview | null;
  clustering?: ClusteringResult | null;
  relevanceExplanations?: PaperRelevanceExplanation[] | null;
}

interface SavedDiscoveriesPanelProps {
  onLoadSession: (session: LoadedSession) => void;
}

export function SavedDiscoveriesPanel({ onLoadSession }: SavedDiscoveriesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['discovery-sessions'],
    queryFn: () => discoveryApi.getSessions(20, 0),
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: number) => discoveryApi.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-sessions'] });
    },
  });

  const handleLoad = async (sessionSummary: DiscoverySession) => {
    setLoadingSessionId(sessionSummary.id);
    try {
      const session = await discoveryApi.getSession(sessionSummary.id);

      const filters: DiscoverySearchFilters = {};
      if (session.filters_json) {
        if (session.filters_json.year_from) filters.year_from = session.filters_json.year_from as number;
        if (session.filters_json.year_to) filters.year_to = session.filters_json.year_to as number;
        if (session.filters_json.min_citations) filters.min_citations = session.filters_json.min_citations as number;
        if (session.filters_json.authors) filters.authors = session.filters_json.authors as string[];
      }

      onLoadSession({
        query: session.query,
        sources: session.sources,
        filters,
        papers: session.papers || [],
        queryUnderstanding: session.query_understanding,
        overview: session.overview,
        clustering: session.clustering,
        relevanceExplanations: session.relevance_explanations,
      });
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setLoadingSessionId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="bg-grayscale-8 border border-green-6 rounded-sm mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-green-4/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-green-28" />
          <span className="font-medium text-anara-light-text">Saved Discoveries</span>
          {sessions && sessions.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-green-4 text-green-34 rounded">
              {sessions.length}
            </span>
          )}
        </div>
        <ChevronRight
          className={`w-4 h-4 text-green-28 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-green-6 px-4 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 text-green-28 animate-spin" />
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sessions.map((session: DiscoverySession) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded border border-green-6 hover:bg-green-4/30 group transition-colors"
                >
                  <button
                    onClick={() => handleLoad(session)}
                    disabled={loadingSessionId === session.id}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      {loadingSessionId === session.id ? (
                        <Loader2 className="w-3.5 h-3.5 text-green-28 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5 text-green-28" />
                      )}
                      <span className="text-sm font-medium text-anara-light-text line-clamp-1">
                        {session.name || session.query}
                      </span>
                    </div>
                    {session.name && (
                      <p className="text-xs text-green-28 mt-0.5 line-clamp-1 pl-5">
                        "{session.query}"
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-green-34 pl-5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(session.updated_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {session.paper_count} paper{session.paper_count !== 1 ? 's' : ''}
                      </span>
                      {session.sources.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {session.sources.join(', ')}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this saved discovery?')) {
                        deleteMutation.mutate(session.id);
                      }
                    }}
                    className="p-1.5 text-green-28 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-green-34 text-center py-4">
              No saved discoveries yet. Search for papers and click "Save" to store your results.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
