import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { searchApi, type SearchRequest, type SavedSearch } from '@/lib/api/search';
import { SearchInput } from '@/components/SearchInput';
import { AdvancedSearchFilters } from '@/components/AdvancedSearchFilters';
import { SearchModeToggle } from '@/components/SearchModeToggle';
import { SavedSearchesPanel } from '@/components/SavedSearchesPanel';
import { FilterChip } from '@/components/FilterChip';
import { ReadingStatusBadge } from '@/components/ReadingStatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';

type SearchMode = 'semantic' | 'fulltext' | 'hybrid';

export default function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(urlQuery);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic');
  const [filters, setFilters] = useState<Partial<SearchRequest>>({});

  // Sync with URL params
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    setQuery(urlQ);
    setSearchQuery(urlQ);
  }, [searchParams]);

  const searchRequest: SearchRequest = {
    query: searchQuery,
    limit: 20,
    ...filters,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', searchQuery, searchMode, filters],
    queryFn: async () => {
      if (searchMode === 'fulltext')
      {
        return searchApi.fulltextSearch(searchRequest);
      } else if (searchMode === 'hybrid')
      {
        // For hybrid, we'll do semantic search for now
        // In future, can combine results from both
        return searchApi.search(searchRequest);
      } else
      {
        return searchApi.search(searchRequest);
      }
    },
    enabled: searchQuery.length > 0,
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Update URL without navigation
    if (query.trim())
    {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`, { replace: true });
    } else
    {
      navigate('/search', { replace: true });
    }
  };

  const handleLoadSavedSearch = (savedSearch: SavedSearch) => {
    setSearchQuery(savedSearch.query_params.query);
    setFilters(savedSearch.query_params);
    navigate(`/search?q=${encodeURIComponent(savedSearch.query_params.query)}`, { replace: true });
  };

  const activeFilters = [];
  if (filters.reading_status)
  {
    activeFilters.push({ key: 'reading_status', label: 'Status', value: filters.reading_status });
  }
  if (filters.priority)
  {
    activeFilters.push({ key: 'priority', label: 'Priority', value: filters.priority });
  }
  if (filters.journal)
  {
    activeFilters.push({ key: 'journal', label: 'Journal', value: filters.journal });
  }
  if (filters.has_annotations !== undefined)
  {
    activeFilters.push({ key: 'has_annotations', label: 'Has Annotations', value: filters.has_annotations ? 'Yes' : 'No' });
  }

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 text-center text-anara-light-text">Advanced Search</h1>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Search Area */}
            <div className="lg:col-span-3 space-y-4">
              <div className="mb-6 sm:mb-8">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  onSearch={handleSearch}
                  placeholder={searchMode === 'fulltext' ? 'Search papers by keywords...' : 'Search papers by meaning...'}
                  debounceMs={500}
                  isLoading={isLoading}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-4 mb-4">
                <SearchModeToggle mode={searchMode} onChange={setSearchMode} />
                <AdvancedSearchFilters
                  filters={filters}
                  onChange={setFilters}
                  onClear={() => setFilters({})}
                />
              </div>

              {activeFilters.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {activeFilters.map((filter) => (
                    <FilterChip
                      key={filter.key}
                      label={filter.label}
                      value={filter.value}
                      onRemove={() => {
                        const newFilters = { ...filters };
                        delete newFilters[filter.key as keyof SearchRequest];
                        setFilters(newFilters);
                      }}
                    />
                  ))}
                </div>
              )}

              {isLoading && searchQuery && (
                <div className="text-center py-12">
                  <div className="inline-flex items-center gap-2 text-anara-light-text-muted">
                    <div className="w-5 h-5 border-2 border-anara-light-border border-t-anara-light-text rounded-full animate-spin" />
                    <span>Searching papers...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-center py-12">
                  <div className="inline-block px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 font-medium">Search Error</p>
                    <p className="text-sm text-red-600 mt-1">
                      {error instanceof Error ? error.message : 'Failed to search papers. Please try again.'}
                    </p>
                  </div>
                </div>
              )}

              {data && data.results.length > 0 && (
                <>
                  <div className="mb-6 flex items-center justify-between">
                    <div className="text-sm text-anara-light-text-muted">
                      Found <span className="font-semibold text-anara-light-text">{data.total}</span> result{data.total !== 1 ? 's' : ''} for <span className="font-medium">"{data.query}"</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {data.results.map((result) => (
                      <Link
                        key={result.paper.id}
                        to={`/papers/${result.paper.id}`}
                        className="block border border-green-6 rounded-sm p-4 sm:p-6 bg-grayscale-8 hover:bg-green-4 transition-all duration-200 group"
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                          <div className="flex-1">
                            <h3 className="text-base sm:text-lg font-semibold text-anara-light-text group-hover:text-anara-light-text-muted transition-colors line-clamp-2">
                              {result.paper.title}
                            </h3>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {result.paper.reading_status && (
                                <ReadingStatusBadge status={result.paper.reading_status} />
                              )}
                              {result.paper.priority && result.paper.priority !== 'low' && (
                                <PriorityBadge priority={result.paper.priority} />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-medium text-green-38 bg-green-4 text-green-38 px-3 py-1.5 rounded-sm border border-green-6">
                              {(result.similarity * 100).toFixed(0)}% match
                            </span>
                          </div>
                        </div>
                        {result.paper.doi && (
                          <p className="text-xs text-green-28 mb-2 font-mono">DOI: {result.paper.doi}</p>
                        )}
                        {result.paper.content_text && (
                          <p className="text-sm text-green-34 line-clamp-3 leading-relaxed">
                            {result.paper.content_text.substring(0, 300)}
                            {result.paper.content_text.length > 300 && '...'}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                </>
              )}

              {data && data.results.length === 0 && searchQuery && (
                <div className="text-center py-12">
                  <p className="text-lg font-medium text-green-38 mb-2">No results found</p>
                  <p className="text-sm text-green-34">
                    Try different keywords or check your spelling.
                  </p>
                </div>
              )}

              {!searchQuery && (
                <div className="text-center py-16">
                  <div className="max-w-md mx-auto">
                    <div className="mb-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-corca-blue-light rounded-full mb-4">
                        <Sparkles className="w-8 h-8 text-green-28" />
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold text-green-38 mb-2">Advanced Search</h2>
                    <p className="text-sm text-green-34 mb-1">
                      Find papers by meaning, keywords, or both
                    </p>
                    <p className="text-xs text-green-28">
                      Use semantic, full-text, or hybrid search with advanced filters
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Saved Searches Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-grayscale-8 border border-green-6 rounded-lg p-4 sticky top-4">
                <SavedSearchesPanel onLoadSearch={handleLoadSavedSearch} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

