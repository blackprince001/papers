import { useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SearchIcon, SlidersIcon, SparklesIcon } from '@/components/icons';
import { searchApi, type SearchMode, type SearchRequest } from '@/lib/api/search';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { getPaperTheme } from '@/lib/paper-themes';
import { cn } from '@/lib/utils';
import { SearchIllustration } from '@/components/illustrations';

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const initialQuery = searchParams.get('q') ?? '';
  const initialMode = (searchParams.get('mode') as SearchMode) ?? 'fulltext';
  
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  // Filters
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [readingStatus, setReadingStatus] = useState('');
  const [priority, setPriority] = useState('');

  // Semantic search availability (server embedding key present?)
  const { data: capabilities } = useQuery({
    queryKey: ['search', 'capabilities'],
    queryFn: searchApi.getCapabilities,
    staleTime: 5 * 60 * 1000,
  });

  // Search query
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['search', query, mode, yearFrom, yearTo, readingStatus, priority],
    queryFn: () => searchApi.search({
      query,
      mode,
      year_from: yearFrom ? parseInt(yearFrom) : undefined,
      year_to: yearTo ? parseInt(yearTo) : undefined,
      reading_status: (readingStatus || undefined) as SearchRequest['reading_status'],
      priority: (priority || undefined) as SearchRequest['priority'],
    }),
    enabled: !!query.trim(),
  });

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      const params = new URLSearchParams();
      params.set('q', query.trim());
      params.set('mode', mode);
      setSearchParams(params);
    }
  }, [query, mode, setSearchParams]);

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (query.trim()) {
      const params = new URLSearchParams();
      params.set('q', query.trim());
      params.set('mode', newMode);
      setSearchParams(params);
    }
  };

  const clearFilters = () => {
    setYearFrom('');
    setYearTo('');
    setReadingStatus('');
    setPriority('');
  };

  const hasFilters = yearFrom || yearTo || readingStatus || priority;
  const results = data?.results ?? [];
  const semanticUnavailable =
    capabilities?.semantic_available === false || data?.semantic_available === false;

  return (
    <div className="max-w-content mx-auto px-6 py-8">
      {/* Search header */}
      <div className="mb-8">
        <h1 className="tracking-tight mb-1">Search</h1>
        <p className="text-body text-(--muted-foreground)">
          Find papers by content, metadata, or meaning
        </p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <SearchIcon
            size="md"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-(--muted-foreground) pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search across all papers..."
            className="w-full h-11 pl-10 pr-4 bg-(--card) border border-(--border) rounded-xl text-code text-(--foreground) placeholder:text-(--muted-foreground) focus:outline-none focus:border-(--ring) transition-all"
            autoFocus
          />
        </div>
        
        {/* Filters Popover */}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger>
            <Button
              variant="secondary"
              size="lg"
              icon={<SlidersIcon size="sm" />}
              className={cn(hasFilters && 'bg-(--muted)')}
            >
              Filters
              {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-(--foreground) ml-1" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-72 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-code font-semibold">Advanced Filters</p>
              {hasFilters && (
                <button onClick={clearFilters} className="text-caption text-(--muted-foreground) hover:text-(--foreground)">
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-caption text-(--muted-foreground) font-medium block mb-1.5">Year Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="From" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} className="h-8 text-code" />
                  <Input type="number" placeholder="To" value={yearTo} onChange={(e) => setYearTo(e.target.value)} className="h-8 text-code" />
                </div>
              </div>

              <div>
                <label className="text-caption text-(--muted-foreground) font-medium block mb-1.5">Reading Status</label>
                <Select value={readingStatus} onChange={(e) => setReadingStatus(e.target.value)} className="h-8 text-code">
                  <option value="">All</option>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="read">Read</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div>
                <label className="text-caption text-(--muted-foreground) font-medium block mb-1.5">Priority</label>
                <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 text-code">
                  <option value="">All</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Search mode toggle */}
      <div className="flex items-center gap-2 mb-8">
        <button 
          onClick={() => handleModeChange('fulltext')}
          className={cn(
            "h-8 px-3 text-caption font-medium rounded-lg flex items-center gap-1.5 transition-colors",
            mode === 'fulltext' 
              ? "bg-(--foreground) text-(--white) shadow-sm" 
              : "bg-(--muted) text-(--foreground) hover:bg-(--border)"
          )}
        >
          <SearchIcon size="sm" />
          <span>Full-text</span>
        </button>
        <button 
          onClick={() => handleModeChange('semantic')}
          className={cn(
            "h-8 px-3 text-caption font-medium rounded-lg flex items-center gap-1.5 transition-colors",
            mode === 'semantic' 
              ? "bg-(--foreground) text-(--white) shadow-sm" 
              : "bg-(--muted) text-(--foreground) hover:bg-(--border)"
          )}
        >
          <SparklesIcon size="sm" />
          <span>Semantic</span>
        </button>
      </div>

      {/* Semantic search degradation notice */}
      {semanticUnavailable && mode === 'semantic' && (
        <div className="flex items-start gap-3 px-3 py-2 mb-6 rounded-lg border border-(--warning-border) bg-(--warning-soft) text-caption">
          <span className="mt-0.5 shrink-0 text-sm text-(--warning)">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-(--warning)">
              Semantic search is unavailable — the server has no embedding key configured.
            </p>
            <p className="text-(--muted-foreground) mt-0.5 text-micro">
              Full-text search still works normally.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => handleModeChange('fulltext')}
          >
            Use full-text
          </Button>
        </div>
      )}

      {/* Results */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="border rounded-2xl p-6">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          size="page"
          title="Failed to search"
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      )}

      {!isLoading && !isError && query.trim() && (
        <div className="space-y-4">
          <p className="text-code font-medium text-(--muted-foreground) mb-6">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </p>

          {results.length === 0 ? (
            <EmptyState
              size="page"
              illustration={SearchIllustration}
              title="No results found"
              description="Try a different query or adjust your filters."
            />
          ) : (
            results.map((result) => {
              const theme = getPaperTheme(result.paper_id);
              return (
                <Link 
                  key={result.paper_id} 
                  to={`/papers/${result.paper_id}`}
                  className="group block border rounded-2xl p-6 transition-all duration-200 hover:border-(--foreground) relative overflow-hidden"
                  style={{ backgroundColor: theme.bg, borderColor: theme.border }}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h3 className="text-body-lg font-medium leading-snug group-hover:text-(--foreground) transition-colors" style={{ color: theme.text }}>
                      {result.title}
                    </h3>
                    {mode === 'semantic' && result.similarity_score !== undefined && (
                      <Badge variant="secondary" className="shrink-0">
                        {Math.round(result.similarity_score * 100)}% match
                      </Badge>
                    )}
                  </div>
                  
                  {result.authors && (
                    <p className="text-caption text-(--muted-foreground) mb-3">{result.authors}</p>
                  )}
                  
                  {result.snippet && (
                    <p 
                      className="text-code leading-relaxed" 
                      style={{ color: theme.text }}
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                  )}
                </Link>
              );
            })
          )}
        </div>
      )}

      {!query.trim() && (
        <EmptyState
          size="page"
          illustration={SearchIllustration}
          title="Enter a search query to find papers"
        />
      )}
    </div>
  );
}
