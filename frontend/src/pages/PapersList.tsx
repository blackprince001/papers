import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { SearchInput } from '@/components/SearchInput';
import { ChevronLeftIcon, ChevronRightIcon, RefreshCw } from 'lucide-react';
import { papersApi } from '@/lib/api/papers';
import { PaperCard } from '@/components/PaperCard';
import { PaperTable } from '@/components/PaperTable';
import { Button } from '@/components/Button';
import { SortFilterBar } from '@/components/SortFilterBar';
import { PaperMultiSelect } from '@/components/PaperMultiSelect';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PaperListFilters } from '@/lib/api/papers';
import { usePagination } from '@/hooks/use-pagination';
import { toastInfo, toastSuccess, toastError } from '@/lib/utils/toast';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PaperCardSkeleton } from '@/components/Skeletons';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ViewMode = 'card' | 'table';

export default function PapersList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);
  const [filters, setFilters] = useState<PaperListFilters>({
    sort_by: 'date_added',
    sort_order: 'desc',
  });
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1); // Reset to first page when search changes
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['papers', page, pageSize, searchQuery, filters],
    queryFn: () => papersApi.list(page, pageSize, searchQuery || undefined, filters),
    retry: 2,
    retryDelay: 1000,
  });

  const regenerateMetadataMutation = useMutation({
    mutationFn: (paperIds: number[]) => papersApi.regenerateMetadataBulk(paperIds),
    onSuccess: () => {
      // Invalidate papers query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      // Also invalidate individual paper queries
      if (data)
      {
        data.papers.forEach(paper => {
          queryClient.invalidateQueries({ queryKey: ['paper', paper.id] });
        });
      }
    },
  });

  const handleRegenerateMetadata = () => {
    if (!data || data.papers.length === 0) return;

    const paperIds = data.papers
      .filter(paper => paper.file_path) // Only papers with PDF files
      .map(paper => paper.id);

    if (paperIds.length === 0)
    {
      toastInfo('No papers with PDF files found on this page.');
      return;
    }

    confirm(
      'Regenerate Metadata',
      `Regenerate metadata for ${paperIds.length} paper(s) on this page?`,
      () => {
        regenerateMetadataMutation.mutate(paperIds);
      }
    );
  };

  const deletePapersMutation = useMutation({
    mutationFn: (paperIds: number[]) => papersApi.deleteBulk(paperIds),
    onSuccess: (_, paperIds) => {
      const count = paperIds.length;
      // Clear selection
      setSelectedPaperIds([]);
      // Invalidate papers query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      // Show success toast
      toastSuccess(`${count} paper${count !== 1 ? 's' : ''} deleted successfully`);
    },
    onError: (error: Error) => {
      toastError(`Failed to delete papers: ${error.message}`);
    },
  });

  const handleDeleteSelected = () => {
    if (selectedPaperIds.length === 0) return;

    confirm(
      'Delete Papers',
      `Delete ${selectedPaperIds.length} paper(s)? This action cannot be undone.`,
      () => {
        deletePapersMutation.mutate(selectedPaperIds);
      },
      {
        variant: 'destructive',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      }
    );
  };

  const handleDeletePaper = (paperId: number) => {
    const paper = data?.papers.find(p => p.id === paperId);
    const paperTitle = paper?.title || 'this paper';

    confirm(
      'Delete Paper',
      `Delete "${paperTitle}"? This action cannot be undone.`,
      () => {
        deletePapersMutation.mutate([paperId]);
      },
      {
        variant: 'destructive',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      }
    );
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: page,
    totalPages,
    paginationItemsToDisplay: 5,
  });

  if (isLoading)
  {
    return (
      <div className="w-full bg-anara-light-bg min-h-screen">
        <div className="container py-8 sm:py-12">
          <div className="mb-6 sm:mb-8">
            <Skeleton className="h-10 w-64 mb-4" />
            <div className="flex flex-col sm:flex-row gap-4 items-center mb-6">
              <Skeleton className="h-11 w-full sm:max-w-md" />
              <Skeleton className="h-11 w-32" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (error)
  {
    return (
      <div className="p-8 text-center text-red-600">
        Error loading papers: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-medium mb-4 text-anara-light-text">Research Papers</h1>
          <div className="flex flex-col sm:flex-row gap-4 items-center mb-6">
            <div className="flex-1 w-full sm:max-w-md">
              <SearchInput
                value={search}
                onChange={setSearch}
                onSearch={handleSearch}
                placeholder="Search papers..."
                debounceMs={500}
                isLoading={isLoading && searchQuery.length > 0}
                showIcon
              />
            </div>
            <Button onClick={() => navigate('/ingest')}>
              Ingest Paper
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <SortFilterBar
            filters={filters}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters);
              setPage(1); // Reset to first page when filters change
            }}
            onReset={() => {
              setPage(1);
            }}
          />
        </div>

        {data && data.papers.length > 0 ? (
          <>
            <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-auto">
                <TabsList>
                  <TabsTrigger value="card">Card View</TabsTrigger>
                  <TabsTrigger value="table">Table View</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {selectedPaperIds.length > 0 && (
                  <>
                    <PaperMultiSelect
                      papers={data.papers}
                      selectedIds={selectedPaperIds}
                      onSelectionChange={setSelectedPaperIds}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={() => navigate('/export', {
                        state: {
                          paperIds: selectedPaperIds,
                          returnPath: '/',
                          context: 'Home'
                        }
                      })}
                    >
                      Export <span className="hidden sm:inline">{selectedPaperIds.length}</span>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={handleDeleteSelected}
                      disabled={deletePapersMutation.isPending}
                    >
                      <Trash2 size={16} className={deletePapersMutation.isPending ? 'animate-spin' : ''} />
                      {deletePapersMutation.isPending ? 'Deleting...' : <>Delete <span className="hidden sm:inline">{selectedPaperIds.length}</span></>}
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleRegenerateMetadata}
                  disabled={regenerateMetadataMutation.isPending}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw size={16} className={regenerateMetadataMutation.isPending ? 'animate-spin' : ''} />
                  {regenerateMetadataMutation.isPending
                    ? 'Regenerating...'
                    : <>Regenerate <span className="hidden sm:inline">Metadata ({data.papers.filter(p => p.file_path).length})</span></>}
                </Button>
                {selectedPaperIds.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={() => navigate('/export', {
                      state: {
                        paperIds: data.papers.map(p => p.id),
                        returnPath: '/',
                        context: 'Home'
                      }
                    })}
                  >
                    Export <span className="hidden sm:inline">All</span>
                  </Button>
                )}
              </div>
            </div>
            {regenerateMetadataMutation.isError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                Failed to regenerate metadata. Some papers may have been updated. Check individual paper details.
              </div>
            )}
            {regenerateMetadataMutation.isSuccess && regenerateMetadataMutation.data && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
                Successfully regenerated metadata for {regenerateMetadataMutation.data.successful.length} paper(s).
                {regenerateMetadataMutation.data.failed.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold">Failed papers:</p>
                    <ul className="list-disc list-inside mt-1">
                      {regenerateMetadataMutation.data.failed.map((f: { paper_id: number; error: string }) => (
                        <li key={f.paper_id}>Paper {f.paper_id}: {f.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                {data.papers.map((paper) => (
                  <div
                    key={paper.id}
                    onClick={() => {
                      if (selectedPaperIds.length > 0)
                      {
                        // In selection mode, toggle selection instead of navigating
                        if (selectedPaperIds.includes(paper.id))
                        {
                          setSelectedPaperIds(selectedPaperIds.filter(id => id !== paper.id));
                        } else
                        {
                          setSelectedPaperIds([...selectedPaperIds, paper.id]);
                        }
                      } else
                      {
                        navigate(`/papers/${paper.id}`);
                      }
                    }}
                    className={`cursor-pointer ${selectedPaperIds.includes(paper.id) ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    <PaperCard paper={paper} onDelete={handleDeletePaper} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-6 sm:mb-8">
                <PaperTable
                  papers={data.papers}
                  onDelete={handleDeletePaper}
                  onSort={(field: string) => {
                    const newSortBy = field as 'date_added' | 'viewed' | 'title' | 'authors';
                    if (filters.sort_by === newSortBy)
                    {
                      setFilters({
                        ...filters,
                        sort_order: filters.sort_order === 'asc' ? 'desc' : 'asc',
                      });
                    } else
                    {
                      setFilters({
                        ...filters,
                        sort_by: newSortBy,
                        sort_order: 'asc',
                      });
                    }
                    setPage(1);
                  }}
                  sortBy={filters.sort_by}
                  sortOrder={filters.sort_order}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-6">
              {/* Page number information */}
              <p
                aria-live="polite"
                className="flex-1 whitespace-nowrap text-muted-foreground text-sm"
              >
                Page <span className="text-foreground">{page}</span> of{" "}
                <span className="text-foreground">{totalPages}</span>
              </p>

              {/* Pagination */}
              <div className="grow">
                <Pagination>
                  <PaginationContent>
                    {/* Previous page button */}
                    <PaginationItem>
                      <PaginationLink
                        aria-disabled={page === 1 ? true : undefined}
                        aria-label="Go to previous page"
                        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        href={page === 1 ? undefined : '#'}
                        onClick={(e) => {
                          e.preventDefault();
                          if (page > 1) setPage(page - 1);
                        }}
                        role={page === 1 ? "link" : undefined}
                      >
                        <ChevronLeftIcon aria-hidden="true" size={16} />
                      </PaginationLink>
                    </PaginationItem>

                    {/* Left ellipsis (...) */}
                    {showLeftEllipsis && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}

                    {/* Page number links */}
                    {pages.map((pageNum) => (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          href="#"
                          isActive={pageNum === page}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(pageNum);
                          }}
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                    {/* Right ellipsis (...) */}
                    {showRightEllipsis && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}

                    {/* Next page button */}
                    <PaginationItem>
                      <PaginationLink
                        aria-disabled={page === totalPages ? true : undefined}
                        aria-label="Go to next page"
                        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        href={page === totalPages ? undefined : '#'}
                        onClick={(e) => {
                          e.preventDefault();
                          if (page < totalPages) setPage(page + 1);
                        }}
                        role={page === totalPages ? "link" : undefined}
                      >
                        <ChevronRightIcon aria-hidden="true" size={16} />
                      </PaginationLink>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>

              {/* Results per page */}
              <div className="flex flex-1 justify-end">
                <Select
                  aria-label="Results per page"
                  defaultValue={pageSize.toString()}
                  onValueChange={(value: string | null) => {
                    if (value)
                    {
                      const newPageSize = parseInt(value);
                      setPageSize(newPageSize);
                      setPage(1); // Reset to first page when changing page size
                    }
                  }}
                >
                  <SelectTrigger className="w-fit whitespace-nowrap" id="results-per-page">
                    <SelectValue placeholder="Select number of results" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / page</SelectItem>
                    <SelectItem value="20">20 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="100">100 / page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-anara-light-text-muted">
            <p className="text-lg mb-4">No papers found</p>
            <p className="text-sm sm:text-base">Start by adding papers using the browser extension.</p>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

