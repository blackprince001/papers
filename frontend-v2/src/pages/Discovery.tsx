import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { SparklesIcon, ChevronDownIcon, SaveIcon, FilterIcon, ViewListIcon, FileTextIcon, ChartBarsIcon, WarningIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SourceSelector, type SourceId } from '@/components/discovery/SourceSelector';
import { ResearchOverview } from '@/components/discovery/ResearchOverview';
import { DiscoveredPaperCard } from '@/components/discovery/DiscoveredPaperCard';
import { ClusteredResults } from '@/components/discovery/ClusteredResults';
import { SavedDiscoveriesPanel, type LoadedSession } from '@/components/discovery/SavedDiscoveriesPanel';
import { CitationExplorer } from '@/components/discovery/CitationExplorer';
import { useAISearchStream } from '@/hooks/use-ai-search-stream';
import { AnimatePresence } from 'motion/react';
import { DiscoveryStatus } from '@/components/discovery/DiscoveryStatus';
import { ExpandedInput } from '@/components/ExpandedInput';
import { discoveryApi, type DiscoverySessionCreate, type DiscoveredPaperPreview, type DiscoverySearchFilters } from '@/lib/api/discovery';
import { toastSuccess, toastError } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

const DISCOVERY_PROMPTS = [
  {
    icon: FileTextIcon,
    text: 'Latest Breakthroughs',
    prompt: 'Find the latest breakthroughs and recent advances in',
  },
  {
    icon: ChartBarsIcon,
    text: 'Survey Papers',
    prompt: 'Find comprehensive survey and review papers covering the state of the art in',
  },
  {
    icon: WarningIcon,
    text: 'Open Challenges',
    prompt: 'Identify open challenges, research gaps, and underexplored areas in',
  },
];

export default function Discovery() {
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState<SourceId[]>(['arxiv', 'semantic_scholar', 'google_scholar']);
  const [showFilters, setShowFilters] = useState(false);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [minCitations, setMinCitations] = useState('');
  const [limit, setLimit] = useState(20);
  const [activeTab, setActiveTab] = useState<'list' | 'clustered'>('clustered');
  const [citationPaper, setCitationPaper] = useState<DiscoveredPaperPreview | null>(null);
  const [loadedSession, setLoadedSession] = useState<LoadedSession | null>(null);

  const location = useLocation();
  const queryClient = useQueryClient();
  const { isSearching, isComplete, status, timeline, allPapers, queryUnderstanding, overview, clustering, relevanceExplanations, error, search } = useAISearchStream();

  // Restore session from archive navigation
  useEffect(() => {
    const state = location.state as { restoreSessionId?: number } | null;
    if (!state?.restoreSessionId) return;
    discoveryApi.getSession(state.restoreSessionId).then((session) => {
      const filters: DiscoverySearchFilters = {};
      if (session.filters_json?.year_from) filters.year_from = session.filters_json.year_from as number;
      if (session.filters_json?.year_to) filters.year_to = session.filters_json.year_to as number;
      if (session.filters_json?.min_citations) filters.min_citations = session.filters_json.min_citations as number;
      setQuery(session.query);
      setSelectedSources(session.sources as SourceId[]);
      if (filters.year_from) setYearFrom(String(filters.year_from));
      if (filters.year_to) setYearTo(String(filters.year_to));
      if (filters.min_citations) setMinCitations(String(filters.min_citations));
      setLoadedSession({
        query: session.query,
        sources: session.sources,
        filters,
        papers: session.papers || [],
        queryUnderstanding: session.query_understanding,
        overview: session.overview,
        clustering: session.clustering,
        relevanceExplanations: session.relevance_explanations,
      });
    }).catch(console.error);
    // Clear state so back-navigation doesn't re-restore
    window.history.replaceState({}, '');
  }, [location.state]);

  const saveSessionMutation = useMutation({
    mutationFn: (data: DiscoverySessionCreate) => discoveryApi.createSession(data),
    onSuccess: () => {
      toastSuccess('Search session saved');
      queryClient.invalidateQueries({ queryKey: ['discovery-sessions'] });
    },
    onError: () => toastError('Failed to save session'),
  });

  const buildFilters = (): DiscoverySearchFilters => ({
    year_from: yearFrom ? parseInt(yearFrom) : undefined,
    year_to: yearTo ? parseInt(yearTo) : undefined,
    min_citations: minCitations ? parseInt(minCitations) : undefined,
  });

  const handleSearch = () => {
    if (!query.trim() || selectedSources.length === 0) return;
    setLoadedSession(null);
    search({ query: query.trim(), sources: selectedSources, filters: buildFilters(), limit, include_overview: true, include_clustering: true, include_relevance: true });
  };

  const handlePromptClick = (prompt: string) => {
    setQuery(prompt);
  };

  const handleSuggestedSearch = (suggestedQuery: string) => {
    setQuery(suggestedQuery);
    setLoadedSession(null);
    search({ query: suggestedQuery, sources: selectedSources, filters: buildFilters(), limit, include_overview: true, include_clustering: true, include_relevance: true });
  };

  const handleLoadSession = (session: LoadedSession) => {
    setQuery(session.query);
    setSelectedSources(session.sources as SourceId[]);
    if (session.filters.year_from) setYearFrom(String(session.filters.year_from));
    if (session.filters.year_to) setYearTo(String(session.filters.year_to));
    if (session.filters.min_citations) setMinCitations(String(session.filters.min_citations));
    setLoadedSession(session);
  };

  const handleSaveSession = () => {
    const papers = loadedSession ? loadedSession.papers : allPapers;
    if (papers.length === 0) return;
    saveSessionMutation.mutate({
      name: `${query} - ${new Date().toLocaleDateString()}`,
      query,
      sources: selectedSources,
      filters_json: buildFilters() as Record<string, unknown>,
      query_understanding: loadedSession ? loadedSession.queryUnderstanding : queryUnderstanding,
      overview: loadedSession ? loadedSession.overview : overview,
      clustering: loadedSession ? loadedSession.clustering : clustering,
      relevance_explanations: loadedSession ? loadedSession.relevanceExplanations : relevanceExplanations,
      papers,
    });
  };

  // Merge live search data with loaded session data
  const displayPapers = loadedSession ? loadedSession.papers : allPapers;
  const displayOverview = loadedSession ? loadedSession.overview : overview;
  const displayClustering = loadedSession ? loadedSession.clustering : clustering;
  const displayRelevance = loadedSession ? (loadedSession.relevanceExplanations ?? []) : relevanceExplanations;
  const displayQueryUnderstanding = loadedSession ? loadedSession.queryUnderstanding : queryUnderstanding;

  const hasResults = displayPapers.length > 0;
  const hasSearched = isSearching || hasResults || isComplete || !!error;

  const researchOverview = displayOverview ? {
    overview: displayOverview.overview || '',
    key_themes: displayOverview.key_themes || [],
    notable_trends: displayOverview.notable_trends || [],
    research_gaps: displayOverview.research_gaps || [],
    suggested_followups: displayOverview.suggested_followups || (displayOverview as any).suggested_searches || [],
  } : null;

  const queryUnderstandingData = displayQueryUnderstanding ? {
    interpreted_query: displayQueryUnderstanding.interpreted_query || (displayQueryUnderstanding as any).intent || '',
    boolean_query: displayQueryUnderstanding.boolean_query,
    key_concepts: displayQueryUnderstanding.key_concepts || [],
  } : undefined;

  return (
    <div className="max-w-240 mx-auto px-6 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-page-title mb-1">Research Discovery</h1>
        <p className="text-body text-(--muted-foreground) max-w-2xl mx-auto">
          Search across arXiv, Semantic Scholar, and Google Scholar to discover relevant papers with AI-powered insights and intelligent clustering
        </p>
      </div>

      {/* Search input with integrated filters */}
      <div className="mb-6">
        <ExpandedInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSearch}
          placeholder="Search for papers by topic, title, or keywords..."
          submitLabel="Discover"
          loading={isSearching}
          suggestions={DISCOVERY_PROMPTS}
          onSuggestionClick={handlePromptClick}
        >
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-caption text-(--muted-foreground)">Sources:</span>
              <SourceSelector selectedSources={selectedSources} onChange={setSelectedSources} />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-code text-(--muted-foreground) hover:text-(--foreground) transition-colors"
            >
              <FilterIcon size="sm" />
              <span>Advanced Filters</span>
              <ChevronDownIcon size="sm" className={cn('transition-transform', showFilters && 'rotate-180')} />
            </button>
            {showFilters && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-(--border)">
                {([
                  { label: 'Year From', value: yearFrom, set: setYearFrom },
                  { label: 'Year To', value: yearTo, set: setYearTo },
                ] as const).map(({ label, value, set }) => (
                  <div key={label}>
                    <label className="block text-caption font-medium text-(--muted-foreground) uppercase tracking-wider mb-1">{label}</label>
                    <Select
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="h-8!"
                    >
                      <option value="">Any</option>
                      {Array.from({ length: new Date().getFullYear() - 1989 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </Select>
                  </div>
                ))}
                <div>
                  <label className="block text-caption font-medium text-(--muted-foreground) uppercase tracking-wider mb-1">Min Citations</label>
                  <Input type="number" value={minCitations} onChange={(e) => setMinCitations(e.target.value)} placeholder="0" className="h-8 text-code" />
                </div>
                <div>
                  <label className="block text-caption font-medium text-(--muted-foreground) uppercase tracking-wider mb-1">
                    Papers / Source
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={limit}
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      if (!isNaN(n)) setLimit(Math.min(100, Math.max(1, n)));
                    }}
                    placeholder="20"
                    className="h-8 text-code"
                  />
                </div>
              </div>
            )}
          </div>
        </ExpandedInput>
      </div>

      {/* Saved Discoveries */}
      <SavedDiscoveriesPanel onLoadSession={handleLoadSession} />

      {/* Discovery Status */}
      <AnimatePresence>
        {isSearching && <DiscoveryStatus status={status} timeline={timeline} isSearching={isSearching} />}
      </AnimatePresence>

      {/* Skeleton cards while searching */}
      {isSearching && !hasResults && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-(--border) overflow-hidden">
              {/* Header skeleton */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-4 w-12" />
              </div>
              {/* Inset content skeleton */}
              <div className="rounded-t-xl border-t border-(--border) bg-(--card) px-4 pt-3.5 pb-4 space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-48" />
                <div className="space-y-1.5 pt-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorState
          size="panel"
          title="Search failed"
          description={error}
          onRetry={handleSearch}
          retrying={isSearching}
          className="mb-6"
        />
      )}

      {/* Research Overview */}
      {researchOverview && (
        <ResearchOverview
          overview={researchOverview}
          queryUnderstanding={queryUnderstandingData}
          onSuggestedSearch={handleSuggestedSearch}
        />
      )}

      {/* Results */}
      {hasResults && (
        <div>
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className="text-body font-bold">
                {displayPapers.length} Papers Found
                {loadedSession && <span className="text-caption font-normal text-(--muted-foreground) ml-2">(loaded from saved)</span>}
              </h3>
              {displayClustering && (
                <div className="flex items-center gap-1 border border-(--border) rounded-lg overflow-hidden">
                  {(['list', 'clustered'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'px-3 py-1 text-caption font-medium transition-colors flex items-center gap-1',
                        activeTab === tab
                          ? 'bg-(--foreground) text-(--white)'
                          : 'text-(--muted-foreground) hover:text-(--foreground)'
                      )}
                    >
                      {tab === 'list' ? <><ViewListIcon size="xs" /> All</> : <><SparklesIcon size="xs" /> By Topic</>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="primary"
              icon={<SaveIcon size="sm" />}
              onClick={handleSaveSession}
              loading={saveSessionMutation.isPending}
              disabled={!!loadedSession}
              className="self-start shrink-0 sm:self-auto"
            >
              {saveSessionMutation.isSuccess ? 'Saved!' : 'Save Session'}
            </Button>
          </div>

          {activeTab === 'clustered' && displayClustering ? (
            <ClusteredResults
              clustering={displayClustering}
              papers={displayPapers}
              relevanceExplanations={displayRelevance}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayPapers.map((paper, i) => (
                <DiscoveredPaperCard
                  key={`${paper.source}-${paper.external_id}-${i}`}
                  paper={paper}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!hasSearched && (
        <div className="text-center py-16">
          <SparklesIcon size={48} className="text-(--muted-foreground) mx-auto mb-4 opacity-50" />
          <p className="text-body text-(--muted-foreground) max-w-md mx-auto">
            Enter a search query above to discover research papers with AI-powered insights
          </p>
        </div>
      )}

      {/* Citation Explorer Modal */}
      {citationPaper && (
        <CitationExplorer
          paper={citationPaper}
          isOpen={!!citationPaper}
          onClose={() => setCitationPaper(null)}
          onSelectPaper={(paper) => setCitationPaper(paper)}
        />
      )}
    </div>
  );
}
