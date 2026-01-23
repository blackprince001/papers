import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, ChevronDown, ChevronUp, Sparkles, List, CheckCircle2, Bookmark, Loader2 } from 'lucide-react';
import { discoveryApi, type DiscoveredPaperPreview, type DiscoverySessionCreate } from '@/lib/api/discovery';
import { useAISearchStream } from '@/hooks/use-ai-search-stream';
import { SourceSelector } from '@/components/discovery/SourceSelector';
import { DiscoveredPaperCard } from '@/components/discovery/DiscoveredPaperCard';
import { CitationExplorer } from '@/components/discovery/CitationExplorer';
import { SearchOverviewPanel } from '@/components/discovery/SearchOverviewPanel';
import { ClusteredResults } from '@/components/discovery/ClusteredResults';
import { SavedDiscoveriesPanel, type LoadedSession } from '@/components/discovery/SavedDiscoveriesPanel';

export default function Discovery() {
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['arxiv', 'semantic_scholar']);
  const [showFilters, setShowFilters] = useState(false);
  const [yearFrom, setYearFrom] = useState<number | undefined>();
  const [yearTo, setYearTo] = useState<number | undefined>();
  const [minCitations, setMinCitations] = useState<number | undefined>();
  const [resultsLimit, setResultsLimit] = useState<number>(20);
  const [useAI, setUseAI] = useState(true);
  const [viewMode, setViewMode] = useState<'clustered' | 'list'>('clustered');

  // Citation explorer state
  const [citationPaper, setCitationPaper] = useState<DiscoveredPaperPreview | null>(null);

  // Loaded session state (for displaying saved discoveries)
  const [loadedSession, setLoadedSession] = useState<LoadedSession | null>(null);

  // Mobile detection for responsive placeholder
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const searchPlaceholder = isMobile
    ? 'Search papers...'
    : 'Search for papers by topic, title, or keywords...';

  const queryClient = useQueryClient();

  // Streaming search hook
  const {
    isSearching,
    status,
    sourceResults,
    allPapers,
    queryUnderstanding,
    overview,
    clustering,
    relevanceExplanations,
    error,
    isComplete,
    search,
  } = useAISearchStream();

  // Save discovery mutation
  const saveMutation = useMutation({
    mutationFn: (sessionData: DiscoverySessionCreate) => discoveryApi.createSession(sessionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-sessions'] });
    },
  });

  // Determine which data to display (from search or loaded session)
  const displayPapers = loadedSession ? loadedSession.papers : allPapers;
  const displayQueryUnderstanding = loadedSession ? loadedSession.queryUnderstanding : queryUnderstanding;
  const displayOverview = loadedSession ? loadedSession.overview : overview;
  const displayClustering = loadedSession ? loadedSession.clustering : clustering;
  const displayRelevanceExplanations = loadedSession ? loadedSession.relevanceExplanations : relevanceExplanations;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && selectedSources.length > 0)
    {
      // Clear any loaded session when doing a new search
      setLoadedSession(null);
      search({
        query: query.trim(),
        sources: selectedSources,
        filters: {
          year_from: yearFrom,
          year_to: yearTo,
          min_citations: minCitations,
        },
        limit: resultsLimit,
        include_overview: useAI,
        include_clustering: useAI,
        include_relevance: useAI,
      });
    }
  };

  const handleSaveDiscovery = () => {
    const papersToSave = loadedSession ? loadedSession.papers : allPapers;
    const overviewToSave = loadedSession ? loadedSession.overview : overview;
    const clusteringToSave = loadedSession ? loadedSession.clustering : clustering;
    const queryUnderstandingToSave = loadedSession ? loadedSession.queryUnderstanding : queryUnderstanding;
    const relevanceToSave = loadedSession ? loadedSession.relevanceExplanations : relevanceExplanations;

    if (papersToSave.length === 0) return;

    const sessionData: DiscoverySessionCreate = {
      query: query,
      sources: selectedSources,
      filters_json: {
        year_from: yearFrom,
        year_to: yearTo,
        min_citations: minCitations,
      },
      query_understanding: queryUnderstandingToSave,
      overview: overviewToSave,
      clustering: clusteringToSave,
      relevance_explanations: relevanceToSave,
      papers: papersToSave,
    };

    saveMutation.mutate(sessionData);
  };

  const handleLoadSession = (session: LoadedSession) => {
    // Update form state
    setQuery(session.query);
    setSelectedSources(session.sources);
    if (session.filters.year_from) setYearFrom(session.filters.year_from);
    if (session.filters.year_to) setYearTo(session.filters.year_to);
    if (session.filters.min_citations) setMinCitations(session.filters.min_citations);

    // Set the loaded session to display its data
    setLoadedSession(session);
  };

  const handleSuggestedSearch = (suggestedQuery: string) => {
    setQuery(suggestedQuery);
    setLoadedSession(null);
    search({
      query: suggestedQuery,
      sources: selectedSources,
      filters: {
        year_from: yearFrom,
        year_to: yearTo,
        min_citations: minCitations,
      },
      limit: resultsLimit,
      include_overview: useAI,
      include_clustering: useAI,
      include_relevance: useAI,
    });
  };

  const handleExploreCitations = (paper: DiscoveredPaperPreview) => {
    setCitationPaper(paper);
  };

  // Check if we have any results
  const hasResults = displayPapers.length > 0 || isComplete || loadedSession !== null;
  const hasSearched = isSearching || hasResults || error;
  const canSave = displayPapers.length > 0 && !saveMutation.isPending;

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-medium text-anara-light-text mb-2">
              Research Discovery
            </h1>
            <p className="text-green-34 max-w-lg mx-auto">
              Search across arXiv, Semantic Scholar, and more to discover relevant papers from around the world
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full px-4 py-3 pl-12 pr-24 bg-grayscale-8 border border-green-6 rounded-sm text-anara-light-text placeholder:text-green-28 focus:outline-none focus:border-green-28 transition-colors"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-28" />
              <button
                type="submit"
                disabled={!query.trim() || selectedSources.length === 0}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-green-4 text-green-38 border border-green-6 rounded-sm hover:bg-green-6 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Source Selector and Filters */}
          <div className="bg-grayscale-8 border border-green-6 rounded-sm p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <SourceSelector
                selectedSources={selectedSources}
                onChange={setSelectedSources}
              />

              {/* AI Toggle */}
              <button
                onClick={() => setUseAI(!useAI)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${useAI
                  ? 'bg-green-4 border-green-28 text-green-38'
                  : 'bg-grayscale-8 border-green-6 text-green-28 hover:bg-green-4'
                  }`}
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">AI Insights</span>
              </button>
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-sm text-green-28 hover:text-green-38 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Advanced Filters
              {showFilters ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {/* Filters */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-green-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-green-34 mb-1">
                    Year From
                  </label>
                  <input
                    type="number"
                    value={yearFrom || ''}
                    onChange={(e) => setYearFrom(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g., 2020"
                    className="w-full px-3 py-2 bg-grayscale-8 border border-green-6 rounded-sm text-sm text-anara-light-text focus:outline-none focus:border-green-28"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-green-34 mb-1">
                    Year To
                  </label>
                  <input
                    type="number"
                    value={yearTo || ''}
                    onChange={(e) => setYearTo(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g., 2024"
                    className="w-full px-3 py-2 bg-grayscale-8 border border-green-6 rounded-sm text-sm text-anara-light-text focus:outline-none focus:border-green-28"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-green-34 mb-1">
                    Min Citations
                  </label>
                  <input
                    type="number"
                    value={minCitations || ''}
                    onChange={(e) => setMinCitations(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g., 10"
                    className="w-full px-3 py-2 bg-grayscale-8 border border-green-6 rounded-sm text-sm text-anara-light-text focus:outline-none focus:border-green-28"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-green-34 mb-1">
                    Results per Source
                  </label>
                  <select
                    value={resultsLimit}
                    onChange={(e) => setResultsLimit(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-grayscale-8 border border-green-6 rounded-sm text-sm text-anara-light-text focus:outline-none focus:border-green-28"
                  >
                    <option value={10}>10 results</option>
                    <option value={20}>20 results</option>
                    <option value={30}>30 results</option>
                    <option value={50}>50 results</option>
                    <option value={75}>75 results</option>
                    <option value={100}>100 results</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Saved Discoveries Panel */}
          <SavedDiscoveriesPanel onLoadSession={handleLoadSession} />

          {/* Loading State with Real-time Progress */}
          {isSearching && (
            <div className="py-8">
              <div className="max-w-md mx-auto bg-grayscale-8 border border-green-6 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 border-2 border-green-28 border-t-transparent rounded-full animate-spin" />
                  <div className="flex-1">
                    <p className="font-medium text-anara-light-text">
                      {status?.message || 'Starting search...'}
                    </p>
                    {allPapers.length > 0 && (
                      <p className="text-sm text-green-28">
                        Found {allPapers.length} papers so far
                      </p>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-green-4 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-green-28 transition-all duration-300"
                    style={{ width: `${status?.progress || 0}%` }}
                  />
                </div>

                {/* Source Results as they arrive */}
                {Object.keys(sourceResults).length > 0 && (
                  <div className="space-y-2">
                    {Object.values(sourceResults).map((result) => (
                      <div key={result.source} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-38" />
                        <span className="text-green-38">{result.source}</span>
                        <span className="text-green-28">
                          {result.error ? `Error: ${result.error}` : `${result.papers.length} papers`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-12">
              <div className="inline-block px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 font-medium">Search Error</p>
                <p className="text-sm text-red-600 mt-1">
                  {error || 'Failed to search. Please try again.'}
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <>
              {/* AI Overview Panel */}
              {displayOverview && (
                <SearchOverviewPanel
                  overview={displayOverview}
                  queryUnderstanding={displayQueryUnderstanding ?? undefined}
                  onSuggestedSearch={handleSuggestedSearch}
                />
              )}

              {/* Results Summary */}
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm text-anara-light-text-muted">
                  Found <span className="font-semibold text-anara-light-text">{displayPapers.length}</span> paper{displayPapers.length !== 1 ? 's' : ''}
                  {isSearching && <span className="text-green-28 ml-2">(still searching...)</span>}
                  {loadedSession && <span className="text-green-28 ml-2">(loaded from saved)</span>}
                </div>
                <div className="flex items-center gap-3">
                  {/* Save Button */}
                  {canSave && (
                    <button
                      onClick={handleSaveDiscovery}
                      disabled={saveMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-4 text-green-38 border border-green-6 rounded-lg hover:bg-green-6 disabled:opacity-50 transition-colors"
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Bookmark className="w-3.5 h-3.5" />
                      )}
                      {saveMutation.isPending ? 'Saving...' : saveMutation.isSuccess ? 'Saved!' : 'Save'}
                    </button>
                  )}
                  {/* View Mode Toggle */}
                  {displayClustering && (
                    <div className="flex items-center bg-grayscale-8 border border-green-6 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setViewMode('clustered')}
                        className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${viewMode === 'clustered'
                          ? 'bg-green-4 text-green-38'
                          : 'text-green-28 hover:bg-green-4'
                          }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        Grouped
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${viewMode === 'list'
                          ? 'bg-green-4 text-green-38'
                          : 'text-green-28 hover:bg-green-4'
                          }`}
                      >
                        <List className="w-3 h-3" />
                        List
                      </button>
                    </div>
                  )}
                  {!loadedSession && Object.keys(sourceResults).length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-green-28">
                      {Object.values(sourceResults).map((result) => (
                        <span
                          key={result.source}
                          className={`px-2 py-1 rounded ${result.error ? 'bg-red-50 text-red-600' : 'bg-green-4'}`}
                          title={result.error || undefined}
                        >
                          {result.source}: {result.error ? 'error' : result.papers.length}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Paper Results */}
              {displayPapers.length > 0 ? (
                <>
                  {/* Clustered View */}
                  {displayClustering && viewMode === 'clustered' ? (
                    <ClusteredResults
                      clustering={displayClustering}
                      papers={displayPapers}
                      relevanceExplanations={{ explanations: displayRelevanceExplanations || [] }}
                      onExploreCitations={handleExploreCitations}
                    />
                  ) : (
                    /* List View */
                    <div className="space-y-4">
                      {displayPapers.map((paper) => (
                        <DiscoveredPaperCard
                          key={`${paper.source}-${paper.external_id}`}
                          paper={paper}
                          onExploreCitations={handleExploreCitations}
                          showCitationButton={paper.source === 'semantic_scholar'}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : isComplete && !loadedSession ? (
                <div className="text-center py-12">
                  <p className="text-lg font-medium text-green-38 mb-2">No results found</p>
                  <p className="text-sm text-green-34">
                    Try different keywords or adjust your filters.
                  </p>
                </div>
              ) : null}
            </>
          )}

          {/* Empty State */}
          {!hasSearched && (
            <div className="text-center py-16">
              <div className="max-w-md mx-auto">
                <p className="text-green-34 mb-4">
                  Enter a search query to discover papers from:
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-sm">
                  <span className="px-3 py-1 bg-red-50 text-red-700 rounded">arXiv</span>
                  <span className="px-3 py-1 bg-blue-50 text-white rounded">Semantic Scholar</span>
                  <span className="text-green-28 self-center">and more...</span>
                </div>
              </div>
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
