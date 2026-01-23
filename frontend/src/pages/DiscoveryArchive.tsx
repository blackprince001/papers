import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, ChevronDown } from 'lucide-react';
import { discoveryApi, type DiscoveredPaperPreview } from '@/lib/api/discovery';
import { DiscoveredPaperCard } from '@/components/discovery/DiscoveredPaperCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function DiscoveryArchive() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string | 'all'>('all');
  const [yearFrom, setYearFrom] = useState<number | undefined>();
  const [yearTo, setYearTo] = useState<number | undefined>();
  const [minCitations, setMinCitations] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<'date' | 'citations' | 'year'>('date');
  const [showFilters, setShowFilters] = useState(false);
  const [citationPaper, setCitationPaper] = useState<DiscoveredPaperPreview | null>(null);

  // Fetch cached papers
  const { data, isLoading, error } = useQuery({
    queryKey: ['cached-papers', selectedSource, pageSize, (page - 1) * pageSize],
    queryFn: () =>
      discoveryApi.getCachedPapers(
        selectedSource === 'all' ? undefined : selectedSource,
        pageSize,
        (page - 1) * pageSize
      ),
  });

  // Filter papers by search query and filters (client-side)
  const filteredPapers = data?.papers.filter((paper) => {
    // Search filter
    if (searchQuery)
    {
      const query = searchQuery.toLowerCase();
      const matches = (
        paper.title.toLowerCase().includes(query) ||
        paper.abstract?.toLowerCase().includes(query) ||
        paper.authors.some((author) => author.toLowerCase().includes(query))
      );
      if (!matches) return false;
    }

    // Year filter
    if (yearFrom && paper.year && paper.year < yearFrom) return false;
    if (yearTo && paper.year && paper.year > yearTo) return false;

    // Citation filter
    if (minCitations && (!paper.citation_count || paper.citation_count < minCitations)) return false;

    return true;
  }).sort((a, b) => {
    // Sort papers
    if (sortBy === 'citations')
    {
      return (b.citation_count || 0) - (a.citation_count || 0);
    } else if (sortBy === 'year')
    {
      return (b.year || 0) - (a.year || 0);
    }
    // Default: sort by date (most recent first - this would need discovered_at from backend)
    return 0;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(search);
    setPage(1);
  };

  const handleExploreCitations = (paper: DiscoveredPaperPreview) => {
    setCitationPaper(paper);
  };

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div>
                <h1 className="text-3xl font-medium text-anara-light-text">
                  Discovery Archive
                </h1>
                <p className="text-green-34">
                  Browse {data?.total || 0} papers discovered from your searches
                </p>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-grayscale-8 border border-green-6 rounded-sm p-4 mb-6">
            <form onSubmit={handleSearch} className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cached papers by title, abstract, or authors..."
                  className="w-full px-4 py-3 pl-12 pr-24 bg-grayscale-8 border border-green-6 rounded-sm text-anara-light-text placeholder:text-green-28 focus:outline-none focus:border-green-28 transition-colors"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-28" />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-green-4 text-green-38 border border-green-6 rounded-sm hover:bg-green-6 transition-colors"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-sm text-green-28 hover:text-green-38 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Filters */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-green-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-green-34 mb-1">
                      Source
                    </label>
                    <Select value={selectedSource} onValueChange={(val) => val && setSelectedSource(val)}>
                      <SelectTrigger className="w-full bg-grayscale-8 border-green-6 text-anara-light-text">
                        <SelectValue placeholder="All sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        <SelectItem value="arxiv">arXiv</SelectItem>
                        <SelectItem value="semantic_scholar">Semantic Scholar</SelectItem>
                        <SelectItem value="google_scholar">Google Scholar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-green-34 mb-1">
                      Sort By
                    </label>
                    <Select value={sortBy} onValueChange={(val) => val && setSortBy(val as 'date' | 'citations' | 'year')}>
                      <SelectTrigger className="w-full bg-grayscale-8 border-green-6 text-anara-light-text">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Discovery Date</SelectItem>
                        <SelectItem value="citations">Citations (High to Low)</SelectItem>
                        <SelectItem value="year">Publication Year (Recent First)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-green-34 mb-1">
                      Papers per page
                    </label>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(val) => {
                        if (val)
                        {
                          setPageSize(parseInt(val));
                          setPage(1);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full bg-grayscale-8 border-green-6 text-anara-light-text">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20 papers</SelectItem>
                        <SelectItem value="50">50 papers</SelectItem>
                        <SelectItem value="100">100 papers</SelectItem>
                        <SelectItem value="200">200 papers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-grayscale-8 border border-green-6 rounded-sm p-4">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-12">
              <div className="inline-block px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 font-medium">Error Loading Papers</p>
                <p className="text-sm text-red-600 mt-1">
                  {error instanceof Error ? error.message : 'Failed to load cached papers'}
                </p>
              </div>
            </div>
          )}

          {/* Papers List */}
          {!isLoading && !error && filteredPapers && (
            <>
              <div className="mb-4 text-sm text-green-34">
                Showing {filteredPapers.length} of {data?.total || 0} papers
                {searchQuery && ` matching "${searchQuery}"`}
              </div>

              {filteredPapers.length > 0 ? (
                <div className="space-y-4">
                  {filteredPapers.map((paper) => (
                    <DiscoveredPaperCard
                      key={`${paper.source}-${paper.external_id}`}
                      paper={paper}
                      onExploreCitations={handleExploreCitations}
                      showCitationButton={paper.source === 'semantic_scholar'}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-lg font-medium text-green-38 mb-2">No papers found</p>
                  <p className="text-sm text-green-34">
                    {searchQuery
                      ? 'Try adjusting your search query'
                      : 'Start searching in Discovery to cache papers'}
                  </p>
                </div>
              )}

              {/* Pagination */}
              {data && data.total > pageSize && (
                <div className="mt-8 flex items-center justify-between">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-green-4 text-green-38 border border-green-6 rounded-sm hover:bg-green-6 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-green-34">
                    Page {page} of {Math.ceil(data.total / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= Math.ceil(data.total / pageSize)}
                    className="px-4 py-2 bg-green-4 text-green-38 border border-green-6 rounded-sm hover:bg-green-6 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Citation Explorer Modal */}
      {citationPaper && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-grayscale-8 border border-green-6 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-medium text-anara-light-text">Citation Network</h2>
                <button
                  onClick={() => setCitationPaper(null)}
                  className="text-green-28 hover:text-green-38"
                >
                  Close
                </button>
              </div>
              <p className="text-sm text-green-34">
                Citation explorer for: {citationPaper.title}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
