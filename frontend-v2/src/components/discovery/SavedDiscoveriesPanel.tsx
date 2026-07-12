import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookmarkIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon,
} from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
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
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';

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

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function SavedDiscoveriesPanel({ onLoadSession }: SavedDiscoveriesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['discovery-sessions'],
    queryFn: () => discoveryApi.getSessions(20, 0),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => discoveryApi.deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discovery-sessions'] }),
  });

  const handleLoad = async (summary: DiscoverySession) => {
    setLoadingId(summary.id);
    try {
      const session = await discoveryApi.getSession(summary.id);
      const filters: DiscoverySearchFilters = {};
      if (session.filters_json) {
        if (session.filters_json.year_from) filters.year_from = session.filters_json.year_from as number;
        if (session.filters_json.year_to) filters.year_to = session.filters_json.year_to as number;
        if (session.filters_json.min_citations) filters.min_citations = session.filters_json.min_citations as number;
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
    } catch (e) {
      console.error('Failed to load session:', e);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (session: DiscoverySession) => {
    const ok = await confirm({
      title: 'Delete saved discovery?',
      description: `"${session.name || session.query}" will be permanently removed. This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) deleteMutation.mutate(session.id);
  };

  return (
    <div className="bg-(--card) border border-(--border) rounded-xl mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-(--muted) transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <BookmarkIcon className="w-4 h-4 text-(--muted-foreground)" />
          <span className="text-code font-medium text-(--foreground)">Saved Discoveries</span>
          {sessions && sessions.length > 0 && (
            <span className="text-caption px-1.5 py-0.5 bg-(--muted) text-(--muted-foreground) rounded border border-(--border)">
              {sessions.length}
            </span>
          )}
        </div>
        <ChevronRightIcon className={`w-4 h-4 text-(--muted-foreground) transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {isExpanded && (
        <div className="border-t border-(--border) px-4 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner size="md" className="text-(--muted-foreground)" />
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sessions.map((session: DiscoverySession) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-(--border) hover:bg-(--muted) group transition-colors"
                >
                  <button
                    onClick={() => handleLoad(session)}
                    disabled={loadingId === session.id}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      {loadingId === session.id
                        ? <Spinner size={14} className="text-(--muted-foreground)" />
                        : <SearchIcon className="w-3.5 h-3.5 text-(--muted-foreground)" />}
                      <span className="text-code font-medium text-(--foreground) line-clamp-1">
                        {session.name || session.query}
                      </span>
                    </div>
                    {session.name && (
                      <p className="text-caption text-(--muted-foreground) mt-0.5 line-clamp-1 pl-5">"{session.query}"</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-caption text-(--muted-foreground) pl-5">
                      <span className="flex items-center gap-1"><ClockIcon className="w-3 h-3" />{formatDate(session.updated_at)}</span>
                      <span className="flex items-center gap-1"><FileTextIcon className="w-3 h-3" />{session.paper_count} papers</span>
                      {session.sources.length > 0 && (
                        <span className="flex items-center gap-1"><SparklesIcon className="w-3 h-3" />{session.sources.join(', ')}</span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(session);
                    }}
                    className="p-1.5 text-(--muted-foreground) hover:text-(--destructive) opacity-0 group-hover:opacity-100 transition-all ml-2"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-caption text-(--muted-foreground) text-center py-6">
              No saved discoveries yet. Search and click "Save Session" to store results.
            </p>
          )}
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
