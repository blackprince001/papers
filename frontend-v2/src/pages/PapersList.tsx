import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, ViewGridIcon, ViewListIcon, TrashIcon, RefreshIcon, LayersIcon, CheckSquareIcon, CheckIcon, CloseIcon, FolderPlusIcon, LibraryIcon, SearchIcon } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
import { Link } from 'react-router-dom';

import { papersApi } from '@/lib/api/papers';
import { groupsApi } from '@/lib/api/groups';
import { toastSuccess, toastError, toastInfo } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { Tooltip } from '@/components/ui/Tooltip';
import { Select } from '@/components/ui/Select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageContainer } from '@/components/layout/PageContainer';

import { PaperCard, PaperCardSkeleton } from '@/components/PaperCard';
import { PaperTable } from '@/components/PaperTable';
import { SortFilterBar } from '@/components/SortFilterBar';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { MovePapersDialog } from '@/components/MovePapersDialog';

import type { PaperListFilters } from '@/lib/api/papers';

type ViewMode = 'grid' | 'table';

/* One card grid, shared by the loading state, the Continue Reading strip,
 * and the main grid view. */
const CARD_GRID = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6';

/* ===== Main component ===== */
export default function PapersList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /* ---- View / pagination / search state ---- */
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PaperListFilters>({ sort_by: 'date_added', sort_order: 'desc' });
  const [ownership, setOwnership] = useState<'all' | 'mine' | 'shared'>('all');

  /* ---- Selection state ---- */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  /* ---- Confirm dialog ---- */
  const { confirm, dialogProps } = useConfirmDialog();

  /* ---- Queries ---- */
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['papers', page, pageSize, searchQuery, filters, ownership],
    queryFn: () => papersApi.list(page, pageSize, searchQuery || undefined, { ...filters, ownership }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const papers = query.state.data?.papers ?? [];
      const hasInFlight = papers.some(
        (p) => p.processing_status === 'pending' || p.processing_status === 'processing'
      );
      // Per-paper progress badges poll at 2.5s; this only refreshes coarse status.
      return hasInFlight ? 10000 : false;
    },
  });

  const { data: recentData } = useQuery({
    queryKey: ['papers', 'recent'],
    queryFn: () => papersApi.list(1, 5, undefined, { sort_by: 'last_read_at', sort_order: 'desc' }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const recentPapers = useMemo(
    () => (recentData?.papers ?? []).filter((p) => p.last_read_at),
    [recentData],
  );

  const papers = data?.papers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 0;

  /* ---- Search ---- */
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setPage(1);
  }, []);

  /* ---- Filters ---- */
  const handleFiltersChange = useCallback((f: PaperListFilters) => {
    setFilters(f);
    setPage(1);
  }, []);

  /* ---- Sort (from table column headers) ---- */
  const handleSort = useCallback((field: PaperListFilters['sort_by']) => {
    setFilters((prev) => ({
      ...prev,
      sort_by: field,
      sort_order: prev.sort_by === field && prev.sort_order === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  }, []);

  /* ---- Selection helpers ---- */
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const selectAll = () =>
    setSelectedIds(selectedIds.length === papers.length ? [] : papers.map((p) => p.id));

  const exitSelection = () => { setSelectionMode(false); setSelectedIds([]); };

  /* ---- Delete mutations ---- */
  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => papersApi.deleteBulk(ids),
    onSuccess: (_, ids) => {
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toastSuccess(`${ids.length} paper${ids.length !== 1 ? 's' : ''} deleted`);
    },
    onError: (err: Error) => toastError(`Delete failed: ${err.message}`),
  });

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    const ok = await confirm({
      title: 'Delete Papers',
      description: `Permanently delete ${selectedIds.length} paper${selectedIds.length !== 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) deleteMutation.mutate(selectedIds);
  };

  const handleDeleteOne = async (id: number) => {
    const paper = papers.find((p) => p.id === id);
    const ok = await confirm({
      title: 'Delete Paper',
      description: `Delete "${paper?.title ?? 'this paper'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) deleteMutation.mutate([id]);
  };

  /* ---- Regenerate metadata mutation ---- */
  const regenMutation = useMutation({
    mutationFn: (ids: number[]) => papersApi.regenerateMetadataBulk(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toastSuccess('Metadata regeneration started');
    },
    onError: (err: Error) => toastError(`Regen failed: ${err.message}`),
  });

  const handleRegenerate = async () => {
    const ids = papers.filter((p) => p.file_path || p.file_url).map((p) => p.id);
    if (!ids.length) { toastInfo('No papers with PDF files on this page'); return; }
    const ok = await confirm({
      title: 'Regenerate Metadata',
      description: `Regenerate metadata for ${ids.length} paper${ids.length !== 1 ? 's' : ''} on this page?`,
      confirmLabel: 'Regenerate',
    });
    if (ok) regenMutation.mutate(ids);
  };

  /* ---- Move to group mutation ---- */
  const moveMutation = useMutation({
    mutationFn: ({ ids, groupIds }: { ids: number[]; groupIds: number[] }) =>
      Promise.all(ids.map((id) => groupsApi.updatePaperGroups(id, groupIds))).then(() => undefined),
    onSuccess: () => {
      setMoveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toastSuccess('Papers moved to group');
    },
    onError: (err: Error) => toastError(`Move failed: ${err.message}`),
  });

  /* ===== Render ===== */

  /* Loading skeleton */
  if (isLoading && !data) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 min-w-0 flex-1 sm:max-w-sm" />
          <Skeleton className="h-10 w-10 sm:w-32 sm:ml-auto" />
        </div>
        <div className={CARD_GRID}>
          {Array.from({ length: 6 }).map((_, i) => <PaperCardSkeleton key={i} />)}
        </div>
      </PageContainer>
    );
  }

  /* Error state */
  if (isError) {
    return (
      <PageContainer width="wide">
        <ErrorState
          title="Couldn't load your library"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide" className="space-y-6">
      {/* ===== Page header ===== */}
      <div>
        <h1 className="tracking-tight mb-0.5">Library</h1>
        <p className="text-body text-(--muted-foreground)">
          {total > 0
            ? <><span className="font-semibold text-(--foreground)">{total}</span> papers in your collection</>
            : 'Your library is empty'}
        </p>
      </div>

      {/* ===== Toolbar ===== */}
      <div className="space-y-3">
        {/* Row 1: search + primary action */}
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder="Search papers…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={handleSearch}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(searchInput); }}
            className="min-w-0 flex-1 sm:max-w-sm"
            id="papers-search"
          />
          <Link to="/ingest" className="shrink-0 sm:ml-auto">
            <Button variant="primary" icon={<PlusIcon size="sm" />}>Add papers</Button>
          </Link>
        </div>

        {/* Row 2: scope + sort/filters + view & actions — wraps freely on mobile */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Ownership scope */}
          <Tabs
            value={ownership}
            onValueChange={(v) => { setOwnership(v as typeof ownership); setPage(1); }}
            variant="segmented"
            className="shrink-0"
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="mine">My Papers</TabsTrigger>
              <TabsTrigger value="shared">Shared with me</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Sort selects + filter popover + active chips */}
          <SortFilterBar
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={() => setPage(1)}
          />

          {/* View toggle + selection & page actions */}
          {papers.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {/* Selection mode toggle / selection controls */}
              {!selectionMode ? (
                <Tooltip content="Select papers" side="bottom">
                  <button
                    id="btn-select-mode"
                    onClick={() => setSelectionMode(true)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-(--border) text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) transition-colors"
                  >
                    <CheckSquareIcon size="sm" />
                  </button>
                </Tooltip>
              ) : (
                <>
                  {/* Selection count + select all */}
                  <button
                    onClick={selectAll}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-(--border) text-caption font-medium hover:bg-(--muted) transition-colors"
                  >
                    <div className={cn(
                      'w-3.5 h-3.5 rounded border-2 flex items-center justify-center',
                      selectedIds.length === papers.length
                        ? 'bg-(--foreground) border-(--foreground)'
                        : 'border-current',
                    )}>
                      {selectedIds.length === papers.length && (
                        <CheckIcon size="xs" strokeWidth={3} className="text-(--background)" />
                      )}
                    </div>
                    {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                  </button>

                  {/* Move to group */}
                  {selectedIds.length > 0 && (
                    <Tooltip content={`Move ${selectedIds.length} paper${selectedIds.length !== 1 ? 's' : ''} to group`} side="bottom">
                      <button
                        id="btn-move-group"
                        onClick={() => setMoveDialogOpen(true)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-(--border) text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) transition-colors"
                      >
                        <FolderPlusIcon size="sm" />
                      </button>
                    </Tooltip>
                  )}

                  {/* Export selected */}
                  {selectedIds.length > 0 && (
                    <Tooltip content="Export selected" side="bottom">
                      <button
                        id="btn-export-selected"
                        onClick={() => navigate('/export', { state: { paperIds: selectedIds } })}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-(--border) text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) transition-colors"
                      >
                        <LayersIcon size="sm" />
                      </button>
                    </Tooltip>
                  )}

                  {/* Delete selected */}
                  {selectedIds.length > 0 && (
                    <Tooltip content="Delete selected" side="bottom">
                      <button
                        id="btn-delete-selected"
                        onClick={handleDeleteSelected}
                        disabled={deleteMutation.isPending}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-(--border) text-(--muted-foreground) hover:text-(--destructive) hover:border-(--destructive)/30 hover:bg-(--destructive)/5 transition-colors disabled:opacity-40"
                      >
                        <TrashIcon size="sm" />
                      </button>
                    </Tooltip>
                  )}

                  {/* Exit selection mode */}
                  <Tooltip content="Cancel selection" side="bottom">
                    <button
                      id="btn-cancel-select"
                      onClick={exitSelection}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-(--border) text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) transition-colors"
                    >
                      <CloseIcon size="sm" />
                    </button>
                  </Tooltip>
                </>
              )}

              {/* Regenerate metadata */}
              <Tooltip content="Regenerate metadata for papers with PDFs" side="bottom">
                <button
                  id="btn-regen-meta"
                  onClick={handleRegenerate}
                  disabled={regenMutation.isPending}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-(--border) text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) transition-colors disabled:opacity-40"
                >
                  {regenMutation.isPending ? <Spinner size="sm" /> : <RefreshIcon size="sm" />}
                </button>
              </Tooltip>

              {/* Grid / table view toggle */}
              <Tabs
                value={viewMode}
                onValueChange={(v) => setViewMode(v as ViewMode)}
                variant="segmented"
                className="shrink-0"
              >
                <TabsList>
                  <TabsTrigger value="grid" id="view-grid" aria-label="Grid view" className="px-2.5">
                    <ViewGridIcon size="sm" />
                  </TabsTrigger>
                  <TabsTrigger value="table" id="view-table" aria-label="Table view" className="px-2.5">
                    <ViewListIcon size="sm" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* ===== Continue reading strip (page 1, no search) ===== */}
      {page === 1 && !searchQuery && recentPapers.length > 0 && (
        <section>
          <h2 className="text-code font-semibold text-(--muted-foreground) uppercase tracking-widest mb-3">
            Continue Reading
          </h2>
          <div className={CARD_GRID}>
            {recentPapers.map((paper) => (
              <PaperCard
                key={`recent-${paper.id}`}
                paper={paper}
                onDelete={handleDeleteOne}
                selectionMode={selectionMode}
                selected={selectedIds.includes(paper.id)}
                onSelect={selectionMode ? toggleSelect : undefined}
              />
            ))}
          </div>
          {/* Decorative separator */}
          <div className="mt-6 mb-2 border-t-2 border-dashed border-(--border)" />
        </section>
      )}

      {/* ===== Papers content ===== */}
      {papers.length === 0 ? (
        searchQuery ? (
          <EmptyState
            icon={SearchIcon}
            title={`No papers matching "${searchQuery}"`}
            description="Try a different search term or clear your filters."
          />
        ) : (
          <EmptyState
            icon={LibraryIcon}
            title="Your library is empty"
            description="Add your first paper to start building your collection."
            actions={
              <Link to="/ingest">
                <Button variant="primary">Add papers</Button>
              </Link>
            }
          />
        )
      ) : viewMode === 'grid' ? (
        <div className={CARD_GRID}>
          {papers.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              onDelete={handleDeleteOne}
              selectionMode={selectionMode}
              selected={selectedIds.includes(paper.id)}
              onSelect={selectionMode ? toggleSelect : undefined}
            />
          ))}
        </div>
      ) : (
        <>
          {/* The table needs desktop width; below md fall back to the card list */}
          <div className="hidden md:block">
            <PaperTable
              papers={papers}
              sortBy={filters.sort_by}
              sortOrder={filters.sort_order}
              onSort={handleSort}
              onDelete={!selectionMode ? handleDeleteOne : undefined}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSelect={selectionMode ? toggleSelect : undefined}
            />
          </div>
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
            {papers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                onDelete={handleDeleteOne}
                selectionMode={selectionMode}
                selected={selectedIds.includes(paper.id)}
                onSelect={selectionMode ? toggleSelect : undefined}
              />
            ))}
          </div>
        </>
      )}

      {/* ===== Pagination + page-size ===== */}
      {totalPages > 1 && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-2">
          <p className="hidden md:block text-code text-(--muted-foreground) whitespace-nowrap order-1">
            Page <span className="font-semibold text-(--foreground)">{page}</span> of{' '}
            <span className="font-semibold text-(--foreground)">{totalPages}</span>
            {' '}({total} total)
          </p>

          <div className="flex justify-center order-2 overflow-x-auto">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2 text-code text-(--muted-foreground) order-3">
            <span className="md:hidden">
              Page <span className="font-semibold text-(--foreground)">{page}</span> of{' '}
              <span className="font-semibold text-(--foreground)">{totalPages}</span>
            </span>
            <div className="flex items-center gap-2">
              <span>Per page</span>
              <Select
                value={pageSize.toString()}
                onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1); }}
                className="w-20 h-8 text-caption"
                id="page-size-select"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* ===== Dialogs ===== */}
      <ConfirmDialog {...dialogProps} />

      <MovePapersDialog
        open={moveDialogOpen}
        onClose={() => setMoveDialogOpen(false)}
        onMove={(groupIds) => moveMutation.mutate({ ids: selectedIds, groupIds })}
        groups={groups}
        paperCount={selectedIds.length}
        isMoving={moveMutation.isPending}
      />
    </PageContainer>
  );
}
