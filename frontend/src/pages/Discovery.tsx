import { useState } from 'react';
import { Search, Compass, Filter, ChevronDown, ChevronUp, Sparkles, List, CheckCircle2 } from 'lucide-react';
import { type DiscoveredPaperPreview } from '@/lib/api/discovery';
import { useAISearchStream } from '@/hooks/use-ai-search-stream';
import { SourceSelector } from '@/components/discovery/SourceSelector';
import { DiscoveredPaperCard } from '@/components/discovery/DiscoveredPaperCard';
import { CitationExplorer } from '@/components/discovery/CitationExplorer';
import { SearchOverviewPanel } from '@/components/discovery/SearchOverviewPanel';
import { ClusteredResults } from '@/components/discovery/ClusteredResults';

export default function Discovery() {
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['arxiv', 'semantic_scholar']);
  const [showFilters, setShowFilters] = useState(false);
  const [yearFrom, setYearFrom] = useState<number | undefined>();
  const [yearTo, setYearTo] = useState<number | undefined>();
  const [minCitations, setMinCitations] = useState<number | undefined>();
  const [useAI, setUseAI] = useState(true);
  const [viewMode, setViewMode] = useState<'clustered' | 'list'>('clustered');

  // Citation explorer state
  const [citationPaper, setCitationPaper] = useState<DiscoveredPaperPreview | null>(null);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && selectedSources.length > 0)
    {
      search({
        query: query.trim(),
        sources: selectedSources,
        filters: {
          year_from: yearFrom,
          year_to: yearTo,
          min_citations: minCitations,
        },
        limit: 20,
        include_overview: useAI,
        include_clustering: useAI,
        include_relevance: useAI,
      });
    }
  };

  const handleSuggestedSearch = (suggestedQuery: string) => {
    setQuery(suggestedQuery);
    search({
      query: suggestedQuery,
      sources: selectedSources,
      filters: {
        year_from: yearFrom,
        year_to: yearTo,
        min_citations: minCitations,
      },
      limit: 20,
      include_overview: useAI,
      include_clustering: useAI,
      include_relevance: useAI,
    });
  };

  const handleExploreCitations = (paper: DiscoveredPaperPreview) => {
    setCitationPaper(paper);
  };

  // Check if we have any results
  const hasResults = allPapers.length > 0 || isComplete;
  const hasSearched = isSearching || hasResults || error;

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-corca-blue-light rounded-full mb-4">
              <Compass className="w-8 h-8 text-green-28" />
            </div>
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
                placeholder="Search for papers by topic, title, or keywords..."
                className="w-full px-4 py-3 pl-12 bg-grayscale-8 border border-green-6 rounded-sm text-anara-light-text placeholder:text-green-28 focus:outline-none focus:border-green-28 transition-colors"
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
              <div className="mt-4 pt-4 border-t border-green-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              </div>
            )}
          </div>

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
              {useAI && overview && (
                <SearchOverviewPanel
                  overview={overview}
                  queryUnderstanding={queryUnderstanding ?? undefined}
                  onSuggestedSearch={handleSuggestedSearch}
                />
              )}

              {/* Results Summary */}
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm text-anara-light-text-muted">
                  Found <span className="font-semibold text-anara-light-text">{allPapers.length}</span> paper{allPapers.length !== 1 ? 's' : ''}
                  {isSearching && <span className="text-green-28 ml-2">(still searching...)</span>}
                </div>
                <div className="flex items-center gap-3">
                  {/* View Mode Toggle */}
                  {useAI && clustering && (
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
                </div>
              </div>

              {/* Paper Results */}
              {allPapers.length > 0 ? (
                <>
                  {/* Clustered View */}
                  {useAI && clustering && viewMode === 'clustered' ? (
                    <ClusteredResults
                      clustering={clustering}
                      papers={allPapers}
                      relevanceExplanations={{ explanations: relevanceExplanations }}
                      onExploreCitations={handleExploreCitations}
                    />
                  ) : (
                    /* List View */
                    <div className="space-y-4">
                      {allPapers.map((paper) => (
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
              ) : isComplete ? (
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
