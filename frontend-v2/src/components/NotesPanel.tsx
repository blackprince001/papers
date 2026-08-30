import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BookOpenIcon, CloseIcon, EditIcon, FileTextIcon, NoteIcon, SaveIcon, TrashIcon } from '@/components/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnnotationIllustration } from '@/components/illustrations';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

interface NotesPanelProps {
  paperId: number;
  currentPage: number;
  annotations: Annotation[];
  isLoading: boolean;
}

type NoteScope = 'page' | 'document';
type ViewScope = 'all' | 'page' | 'document';

export function NotesPanel({ paperId, currentPage, annotations, isLoading }: NotesPanelProps) {
  const [scope, setScope] = useState<ViewScope>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editScope, setEditScope] = useState<NoteScope>('page');
  const [isCreating, setIsCreating] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newScope, setNewScope] = useState<NoteScope>('page');
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();

  const notes = annotations.filter((a) => a.type === 'note');
  const pageNotes = notes.filter((n) => {
    if (n.note_scope === 'page') {
      const coord = n.coordinate_data as { page?: number } | undefined;
      return coord?.page === currentPage;
    }
    return false;
  });
  const documentNotes = notes.filter((n) => n.note_scope === 'document');
  const displayed = scope === 'all' ? notes : scope === 'page' ? pageNotes : documentNotes;

  const createMutation = useMutation({
    mutationFn: (data: { content: string; noteScope: NoteScope }) =>
      annotationsApi.create({
        paper_id: paperId,
        content: data.content,
        type: 'note',
        note_scope: data.noteScope,
        coordinate_data: data.noteScope === 'page' ? { page: currentPage } : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      setIsCreating(false);
      setNewContent('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => annotationsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations', paperId] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content, noteScope }: { id: number; content: string; noteScope: NoteScope }) =>
      annotationsApi.update(id, { content, note_scope: noteScope }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      setEditingId(null);
      setEditContent('');
    },
  });

  const startEdit = (note: Annotation) => {
    setEditingId(note.id);
    setEditContent(note.content || '');
    setEditScope(note.note_scope === 'document' ? 'document' : 'page');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEdit = () => {
    if (editingId && editContent.trim()) {
      updateMutation.mutate({ id: editingId, content: editContent, noteScope: editScope });
    }
  };

  const handleDelete = (id: number) => {
    confirm({
      title: 'Delete Note',
      description: 'Are you sure you want to delete this note? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    }).then((ok) => { if (ok) deleteMutation.mutate(id); });
  };

  const renderContent = (content: string) => {
    if (/^<[a-z][\s\S]*>/i.test(content.trim())) {
      return (
        <div
          className="prose prose-sm max-w-none text-code text-(--foreground) leading-relaxed"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="text-code text-(--foreground) mb-2 leading-relaxed">{children}</p>,
          h1: ({ children }) => <h1 className="text-body font-bold text-(--foreground) mt-3 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-code font-bold text-(--foreground) mt-2 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-code font-semibold text-(--foreground) mt-2 mb-1">{children}</h3>,
          ul: ({ children }) => <ul className="text-code text-(--foreground) mb-2 ml-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="text-code text-(--foreground) mb-2 ml-4 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="text-code text-(--foreground) mb-0.5">{children}</li>,
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            return isBlock
              ? <code className="block text-caption bg-(--muted) text-(--foreground) p-2 rounded-lg overflow-x-auto mb-2">{children}</code>
              : <code className="text-caption bg-(--muted) px-1.5 py-0.5 rounded">{children}</code>;
          },
          a: ({ href, children }) => <a href={href} className="text-(--sky-blue) hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
          strong: ({ children }) => <strong className="font-semibold text-(--foreground)">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-(--border) pl-3 text-(--muted-foreground) mb-2 text-code">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scope toggle & New Note button */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-1 p-1 bg-(--muted)/40 rounded-lg w-fit">
          <button
            onClick={() => setScope('all')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium transition-colors',
              scope === 'all'
                ? 'bg-(--white) text-(--foreground) shadow-subtle'
                : 'text-(--muted-foreground) hover:text-(--foreground)',
            )}
          >
            <NoteIcon size="xs" />
            All
            {notes.length > 0 && <span className="text-micro opacity-60">{notes.length}</span>}
          </button>
          <button
            onClick={() => setScope('page')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium transition-colors',
              scope === 'page'
                ? 'bg-(--white) text-(--foreground) shadow-subtle'
                : 'text-(--muted-foreground) hover:text-(--foreground)',
            )}
          >
            <FileTextIcon size="xs" />
            Pg {currentPage}
          </button>
          <button
            onClick={() => setScope('document')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium transition-colors',
              scope === 'document'
                ? 'bg-(--white) text-(--foreground) shadow-subtle'
                : 'text-(--muted-foreground) hover:text-(--foreground)',
            )}
          >
            <BookOpenIcon size="xs" />
            Document
          </button>
        </div>

        {!isCreating && (
          <Button 
            size="sm" 
            className="h-8 rounded-lg"
            onClick={() => {
              setIsCreating(true);
              setNewScope(scope === 'document' ? 'document' : 'page');
            }}
          >
            New Note
          </Button>
        )}
      </div>

      {/* New Note Form */}
      {isCreating && (
        <div className="mb-6 rounded-xl border border-(--foreground)/10 bg-(--muted)/10 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-caption font-semibold text-(--foreground)">Create New Note</h3>
            <div className="flex items-center gap-2">
              <span className="text-caption text-(--muted-foreground)">Scope:</span>
              <div className="flex items-center gap-1 p-0.5 bg-(--muted)/40 rounded-lg">
                {(['page', 'document'] as NoteScope[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setNewScope(s)}
                    disabled={createMutation.isPending}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded text-caption font-medium transition-colors capitalize',
                      newScope === s
                        ? 'bg-(--foreground) text-(--background)'
                        : 'text-(--muted-foreground) hover:text-(--foreground)',
                    )}
                  >
                    {s === 'page' ? <FileTextIcon size="xs" /> : <BookOpenIcon size="xs" />}
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            className="w-full text-code bg-(--card) focus-visible:ring-1"
            placeholder={newScope === 'page' ? `Write note for page ${currentPage}...` : 'Write document-wide note...'}
            autoFocus
            disabled={createMutation.isPending}
          />

          <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-(--border)">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { setIsCreating(false); setNewContent(''); }} 
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate({ content: newContent, noteScope: newScope })}
              disabled={!newContent.trim()}
              loading={createMutation.isPending}
            >
              Create Note
            </Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : displayed.length > 0 ? (
        <div className="space-y-3">
          {displayed.map((note) => {
            const notePage = (note.coordinate_data as { page?: number } | undefined)?.page;
            const isEditing = editingId === note.id;

            return (
              <div
                key={note.id}
                className={cn(
                  'rounded-xl border p-4 transition-colors',
                  isEditing
                    ? 'border-(--foreground)/20 bg-(--muted)/20'
                    : 'border-(--border) bg-(--card) hover:border-(--muted-foreground)/30',
                )}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Edit scope toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-(--muted-foreground)">Scope:</span>
                      <div className="flex items-center gap-1 p-0.5 bg-(--muted)/40 rounded-lg">
                        {(['page', 'document'] as NoteScope[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setEditScope(s)}
                            disabled={updateMutation.isPending}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded text-caption font-medium transition-colors capitalize',
                              editScope === s
                                ? 'bg-(--foreground) text-(--background)'
                                : 'text-(--muted-foreground) hover:text-(--foreground)',
                            )}
                          >
                            {s === 'page' ? <FileTextIcon size="xs" /> : <BookOpenIcon size="xs" />}
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={6}
                      className="w-full text-code bg-(--white)"
                      placeholder="Write your note..."
                      autoFocus
                      disabled={updateMutation.isPending}
                    />

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-(--border)">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<CloseIcon size="sm" />}
                        onClick={cancelEdit}
                        disabled={updateMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        icon={<SaveIcon size="sm" />}
                        onClick={saveEdit}
                        disabled={!editContent.trim()}
                        loading={updateMutation.isPending}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3">{renderContent(note.content)}</div>

                    <div className="flex items-center justify-between pt-2 border-t border-(--border)">
                      <div className="flex items-center gap-2 text-micro text-(--muted-foreground) opacity-60">
                        {note.note_scope === 'page' && notePage && (
                          <span>Page {notePage}</span>
                        )}
                        {note.note_scope === 'document' && <span>Document</span>}
                        <span>{format(new Date(note.created_at), 'MMM d, yyyy')}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="icon"
                          size="icon-xs"
                          onClick={() => startEdit(note)}
                          disabled={deleteMutation.isPending || editingId !== null}
                          aria-label="Edit note"
                        >
                          <EditIcon size="xs" />
                        </Button>
                        <Button
                          variant="icon"
                          size="icon-xs"
                          className="text-(--destructive) hover:bg-(--destructive)/10"
                          onClick={() => handleDelete(note.id)}
                          disabled={deleteMutation.isPending || editingId !== null}
                          aria-label="Delete note"
                        >
                          <TrashIcon size="xs" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-(--muted)/10 rounded-2xl border border-dashed border-(--border)">
          <EmptyState
            size="panel"
            illustration={AnnotationIllustration}
            title={scope === 'all' ? 'No notes yet' : scope === 'page' ? `No notes for page ${currentPage}` : 'No document notes yet'}
          />
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
