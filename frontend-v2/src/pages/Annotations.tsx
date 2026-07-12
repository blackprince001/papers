import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { papersApi, type Paper } from '@/lib/api/papers';
import {
  FileTextIcon,
  ChatIcon,
  HighlighterIcon,
  TrashIcon,
  EditIcon,
  CloseIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { Textarea } from '@/components/ui/Textarea';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toastSuccess, toastError } from '@/lib/utils/toast';

type FilterType = 'all' | 'highlight' | 'note';
type CitationFormat = 'apa' | 'mla' | 'bibtex';

type AnnotationWithPaper = Annotation & { paperTitle: string; paperId: number };

interface PaperGroup {
  paper: Paper;
  annotations: AnnotationWithPaper[];
}

export default function Annotations() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [citationFormat, setCitationFormat] = useState<CitationFormat>('apa');
  const [exportingPaperId, setExportingPaperId] = useState<number | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();

  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ['all-papers-for-annotations'],
    queryFn: async () => {
      const all: Paper[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const data = await papersApi.list(page, 100);
        all.push(...data.papers);
        hasMore = data.papers.length === 100 && all.length < data.total;
        page++;
      }
      return all;
    },
  });

  const { data: allAnnotations = [], isLoading: annotationsLoading } = useQuery({
    queryKey: ['all-annotations', papersData?.map((p) => p.id)],
    queryFn: async (): Promise<AnnotationWithPaper[]> => {
      if (!papersData || papersData.length === 0) return [];
      const results = await Promise.all(
        papersData.map(async (paper) => {
          try {
            const list = await annotationsApi.list(paper.id);
            return list.map((ann) => ({ ...ann, paperTitle: paper.title, paperId: paper.id }));
          } catch (err) {
            console.error(`Failed to fetch annotations for paper ${paper.id}`, err);
            return [] as AnnotationWithPaper[];
          }
        }),
      );
      return results.flat();
    },
    enabled: !!papersData && papersData.length > 0,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      annotationsApi.update(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-annotations'] });
      setEditingId(null);
      toastSuccess('Annotation updated');
    },
    onError: () => toastError('Failed to update annotation'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => annotationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-annotations'] });
      toastSuccess('Annotation deleted');
    },
    onError: () => toastError('Failed to delete annotation'),
  });

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Delete Annotation',
      description: 'Are you sure you want to delete this annotation?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) deleteMutation.mutate(id);
  };

  const startEdit = (annotation: Annotation) => {
    setEditingId(annotation.id);
    setEditContent(annotation.content || '');
  };

  const saveEdit = () => {
    if (editingId && editContent.trim()) {
      updateMutation.mutate({ id: editingId, content: editContent });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const openPaper = (paperId: number, page?: number) => {
    navigate(`/papers/${paperId}${page ? `?page=${page}` : ''}`);
  };

  const toggleGroup = (paperId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  };

  const exportCitation = async (paperId: number) => {
    setExportingPaperId(paperId);
    try {
      const { reference } = await papersApi.getReference(paperId, citationFormat);
      try {
        await navigator.clipboard.writeText(reference);
      } catch {
        const el = document.createElement('textarea');
        el.value = reference;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      toastSuccess(`${citationFormat.toUpperCase()} citation copied`);
    } catch {
      toastError('Failed to generate citation');
    } finally {
      setExportingPaperId(null);
    }
  };

  const filteredAnnotations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAnnotations.filter((ann) => {
      if (filter === 'highlight' && ann.type !== 'annotation') return false;
      if (filter === 'note' && ann.type !== 'note') return false;
      if (q) {
        const matchContent = ann.content?.toLowerCase().includes(q);
        const matchHighlight = ann.highlighted_text?.toLowerCase().includes(q);
        const matchPaper = ann.paperTitle?.toLowerCase().includes(q);
        if (!matchContent && !matchHighlight && !matchPaper) return false;
      }
      return true;
    });
  }, [allAnnotations, filter, searchQuery]);

  const groups = useMemo<PaperGroup[]>(() => {
    if (!papersData) return [];
    const map = new Map<number, AnnotationWithPaper[]>();
    filteredAnnotations.forEach((ann) => {
      if (!map.has(ann.paperId)) map.set(ann.paperId, []);
      map.get(ann.paperId)!.push(ann);
    });
    return papersData
      .filter((p) => map.has(p.id))
      .map((p) => ({
        paper: p,
        annotations: (map.get(p.id) ?? []).sort((a, b) => {
          const pa = (a.coordinate_data?.page as number | undefined) ?? 0;
          const pb = (b.coordinate_data?.page as number | undefined) ?? 0;
          if (pa !== pb) return pa - pb;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }),
      }))
      .sort((a, b) => a.paper.title.localeCompare(b.paper.title));
  }, [papersData, filteredAnnotations]);

  const isLoading = papersLoading || annotationsLoading;
  const totalAnnotations = filteredAnnotations.length;

  const expandAll = () => setExpanded(new Set(groups.map((g) => g.paper.id)));
  const collapseAll = () => setExpanded(new Set());

  if (isLoading) {
    return (
      <div className="max-w-content mx-auto px-6 py-8">
        <Skeleton className="w-64 h-8 mb-2" />
        <Skeleton className="w-96 h-5 mb-8" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="w-full h-14" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-content mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1>Annotations</h1>
            <p className="text-btn text-(--muted-foreground) mt-1">
              Manage highlights, notes and references across your library
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption text-(--muted-foreground)">Citation</span>
            <div className="w-24">
              <Select
                value={citationFormat}
                onChange={(e) => setCitationFormat(e.target.value as CitationFormat)}
                className="h-8!"
              >
                <option value="apa">APA</option>
                <option value="mla">MLA</option>
                <option value="bibtex">BibTeX</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Filters and search */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'h-8 px-3 text-code font-medium rounded-lg transition-colors',
                filter === 'all'
                  ? 'bg-(--primary) [color:var(--primary-foreground)]'
                  : 'bg-(--muted) text-(--foreground) hover:bg-(--border)',
              )}
            >
              All
            </button>
            <button
              onClick={() => setFilter('highlight')}
              className={cn(
                'h-8 px-3 text-code font-medium rounded-lg transition-colors flex items-center gap-1.5',
                filter === 'highlight'
                  ? 'bg-(--primary) [color:var(--primary-foreground)]'
                  : 'bg-(--muted) text-(--foreground) hover:bg-(--border)',
              )}
            >
              <HighlighterIcon size="sm" />
              <span>Highlights</span>
            </button>
            <button
              onClick={() => setFilter('note')}
              className={cn(
                'h-8 px-3 text-code font-medium rounded-lg transition-colors flex items-center gap-1.5',
                filter === 'note'
                  ? 'bg-(--primary) [color:var(--primary-foreground)]'
                  : 'bg-(--muted) text-(--foreground) hover:bg-(--border)',
              )}
            >
              <ChatIcon size="sm" />
              <span>Notes</span>
            </button>
          </div>
          <div className="flex-1 min-w-48 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search annotations or papers..."
            />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={expandAll} disabled={groups.length === 0}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} disabled={expanded.size === 0}>
              Collapse all
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <p className="text-caption text-(--muted-foreground)">
            {groups.length} paper{groups.length !== 1 ? 's' : ''} · {totalAnnotations} annotation{totalAnnotations !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Grouped annotations table */}
        {groups.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-(--border) rounded-xl">
            <FileTextIcon size={48} className="mx-auto mb-3 text-(--muted-foreground) opacity-40" />
            <p className="text-body text-(--muted-foreground)">No annotations found</p>
          </div>
        ) : (
          <div className="border border-(--border) rounded-xl overflow-hidden bg-(--card)">
            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_160px_140px] items-center gap-3 px-4 py-2.5 border-b border-(--border) bg-(--muted)">
              <span className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider">Paper</span>
              <span className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider">Annotations</span>
              <span className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider">Last updated</span>
              <span className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider text-right">Actions</span>
            </div>

            {groups.map((group, idx) => {
              const isOpen = expanded.has(group.paper.id);
              const latest = group.annotations.reduce((acc, a) => {
                const t = new Date(a.updated_at).getTime();
                return t > acc ? t : acc;
              }, 0);
              const authors = group.paper.authors?.split(',').slice(0, 2).join(', ');

              return (
                <div
                  key={group.paper.id}
                  className={cn(idx > 0 && 'border-t border-(--border)')}
                >
                  {/* Collapsible header row */}
                  <div className="grid grid-cols-[1fr_120px_160px_140px] items-center gap-3 px-4 py-3 hover:bg-(--muted) transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.paper.id)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-2 min-w-0 text-left focus:outline-none"
                    >
                      <ChevronRightIcon
                        size="sm"
                        className={cn(
                          'shrink-0 text-(--muted-foreground) transition-transform duration-150',
                          isOpen && 'rotate-90',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-code font-medium text-(--foreground) truncate">
                          {group.paper.title}
                        </p>
                        {authors && (
                          <p className="text-caption text-(--muted-foreground) truncate">
                            {authors}{group.paper.authors && group.paper.authors.split(',').length > 2 ? ' et al.' : ''}
                            {(() => {
                              const year = (group.paper.metadata_json as Record<string, unknown> | undefined)?.year;
                              return typeof year === 'number' || typeof year === 'string' ? <span> · {year}</span> : null;
                            })()}
                          </p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.paper.id)}
                      className="text-code text-(--muted-foreground) text-left focus:outline-none"
                    >
                      {group.annotations.length}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.paper.id)}
                      className="text-caption text-(--muted-foreground) text-left focus:outline-none"
                    >
                      {latest ? format(new Date(latest), 'MMM d, yyyy') : '—'}
                    </button>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => exportCitation(group.paper.id)}
                        loading={exportingPaperId === group.paper.id}
                        icon={<ExternalLinkIcon size="xs" />}
                      >
                        Cite
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPaper(group.paper.id)}
                      >
                        Open
                      </Button>
                    </div>
                  </div>

                  {/* Annotations list */}
                  {isOpen && (
                    <div className="border-t border-(--border) bg-(--background) px-4 py-3 space-y-2">
                      {group.annotations.map((annotation) => {
                        const Icon = annotation.type === 'note' ? ChatIcon : HighlighterIcon;
                        const page = annotation.coordinate_data?.page as number | undefined;
                        const isEditing = editingId === annotation.id;

                        return (
                          <div
                            key={annotation.id}
                            className="rounded-lg border border-(--border) bg-(--card) p-3"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-7 h-7 rounded-md bg-(--muted) flex items-center justify-center shrink-0 mt-0.5">
                                <Icon size="sm" className="text-(--muted-foreground)" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-2 text-caption text-(--muted-foreground)">
                                    {page !== undefined && <span>Page {page}</span>}
                                    {page !== undefined && <span>·</span>}
                                    <span>{format(new Date(annotation.created_at), 'MMM d, yyyy')}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {!isEditing && (
                                      <>
                                        <Button
                                          variant="icon"
                                          size="icon-sm"
                                          onClick={() => startEdit(annotation)}
                                          aria-label="Edit annotation"
                                        >
                                          <EditIcon size="xs" />
                                        </Button>
                                        <Button
                                          variant="icon"
                                          size="icon-sm"
                                          className="text-(--destructive)"
                                          onClick={() => handleDelete(annotation.id)}
                                          aria-label="Delete annotation"
                                        >
                                          <TrashIcon size="xs" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {annotation.highlighted_text && (
                                  <div
                                    className="mb-2 px-2.5 py-1.5 bg-(--muted) rounded border-l-2 border-(--foreground)/40 cursor-pointer"
                                    onClick={() => openPaper(annotation.paperId, page)}
                                  >
                                    <p className="text-code text-(--foreground) line-clamp-3">
                                      {annotation.highlighted_text}
                                    </p>
                                  </div>
                                )}

                                {isEditing ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      value={editContent}
                                      onChange={(e) => setEditContent(e.target.value)}
                                      rows={3}
                                      className="text-code"
                                    />
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="primary"
                                        className="h-7! px-3! text-caption"
                                        onClick={saveEdit}
                                      >
                                        <CheckIcon size="xs" className="mr-1" />
                                        Save
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        className="h-7! px-3! text-caption"
                                        onClick={cancelEdit}
                                      >
                                        <CloseIcon size="xs" className="mr-1" />
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : annotation.content ? (
                                  <p className="text-code text-(--muted-foreground) whitespace-pre-wrap">
                                    {annotation.content}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}
