import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { Button } from './Button';
import { TipTapEditor } from './TipTapEditor';
import { format } from 'date-fns';
import { FileText, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useConfirmDialog } from './ConfirmDialog';

interface NotesPanelProps {
  paperId: number;
  currentPage: number;
  annotations: Annotation[];
  isLoading: boolean;
  onEditNote?: (note: Annotation) => void;
}

type NoteScope = 'page' | 'document';

export function NotesPanel({ paperId, currentPage, annotations, isLoading, onEditNote }: NotesPanelProps) {
  const [noteScope, setNoteScope] = useState<NoteScope>('page');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editScope, setEditScope] = useState<NoteScope>('page');
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  // Filter notes by type and scope
  const notes = annotations.filter((ann) => ann.type === 'note');
  const pageNotes = notes.filter((note) => {
    if (note.note_scope === 'page')
    {
      const coord = note.coordinate_data as { page?: number } | undefined;
      return coord?.page === currentPage;
    }
    return false;
  });
  const documentNotes = notes.filter((note) => note.note_scope === 'document');

  const displayedNotes = noteScope === 'page' ? pageNotes : documentNotes;

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => annotationsApi.delete(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, content, noteScope }: { noteId: number; content: string; noteScope: NoteScope }) =>
      annotationsApi.update(noteId, {
        content,
        note_scope: noteScope,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      setEditingNoteId(null);
      setEditContent('');
    },
  });

  const handleDeleteNote = (noteId: number) => {
    confirm(
      'Delete Note',
      'Are you sure you want to delete this note?',
      () => {
        deleteNoteMutation.mutate(noteId);
      },
      { variant: 'destructive', confirmLabel: 'Delete' }
    );
  };

  const handleEditNote = (note: Annotation) => {
    setEditingNoteId(note.id);
    setEditContent(note.content || '');
    setEditScope(note.note_scope === 'document' ? 'document' : 'page');
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent('');
  };

  const handleSaveEdit = () => {
    if (editingNoteId && editContent.trim())
    {
      updateNoteMutation.mutate({
        noteId: editingNoteId,
        content: editContent,
        noteScope: editScope,
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-anara-light-border flex-shrink-0">
        <h3 className="text-sm font-semibold text-anara-light-text">Notes</h3>
        <div className="flex gap-1 bg-gray-100 rounded p-1">
          <button
            onClick={() => setNoteScope('page')}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${noteScope === 'page'
              ? 'bg-gray-100 text-anara-light-text'
              : 'text-anara-light-text-muted hover:text-anara-light-text'
              }`}
          >
            <FileText className="h-3 w-3" />
            Page
          </button>
          <button
            onClick={() => setNoteScope('document')}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${noteScope === 'document'
              ? 'bg-gray-100 text-anara-light-text'
              : 'text-anara-light-text-muted hover:text-anara-light-text'
              }`}
          >
            <BookOpen className="h-3 w-3" />
            Document
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-anara-light-text-muted text-sm text-center py-8">Loading notes...</div>
        ) : displayedNotes.length > 0 ? (
          <div className="space-y-3">
            {displayedNotes.map((note) => {
              const notePage = note.coordinate_data && typeof note.coordinate_data === 'object'
                ? (note.coordinate_data as { page?: number }).page
                : null;

              const isEditing = editingNoteId === note.id;

              return (
                <div
                  key={note.id}
                  className={`border rounded-sm p-3 sm:p-4 transition-all ${isEditing && !onEditNote
                    ? 'border-gray-300 bg-gray-100'
                    : 'border-anara-light-border bg-gray-50 hover:border-anara-light-border'
                    }`}
                >
                  {isEditing && !onEditNote ? (
                    <div className="space-y-3">
                      {/* Scope Toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-anara-light-text-muted">Scope:</span>
                        <div className="flex gap-1 bg-gray-100 rounded p-1">
                          <button
                            onClick={() => setEditScope('page')}
                            disabled={updateNoteMutation.isPending}
                            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${editScope === 'page'
                              ? 'bg-black text-white'
                              : 'text-anara-light-text-muted hover:text-anara-light-text'
                              } ${updateNoteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <FileText className="h-3 w-3" />
                            Page
                          </button>
                          <button
                            onClick={() => setEditScope('document')}
                            disabled={updateNoteMutation.isPending}
                            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${editScope === 'document'
                              ? 'bg-black text-white'
                              : 'text-anara-light-text-muted hover:text-anara-light-text'
                              } ${updateNoteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <BookOpen className="h-3 w-3" />
                            Document
                          </button>
                        </div>
                      </div>

                      {/* Editor */}
                      <div className="min-h-[200px] border border-anara-light-border rounded-sm bg-white">
                        <TipTapEditor
                          content={editContent}
                          onChange={setEditContent}
                          placeholder={
                            editScope === 'page'
                              ? `Edit note for page ${currentPage}...`
                              : 'Edit document note...'
                          }
                          editable={!updateNoteMutation.isPending}
                          autoFocus
                          showToolbar={true}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-anara-light-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          disabled={updateNoteMutation.isPending}
                          className="text-xs h-7 px-3"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          disabled={!editContent.trim() || updateNoteMutation.isPending}
                          className="text-xs h-7 px-3"
                        >
                          {updateNoteMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                      </div>

                      {/* Error Display */}
                      {updateNoteMutation.isError && (
                        <p className="text-xs text-red-13">
                          Error: {updateNoteMutation.error instanceof Error
                            ? updateNoteMutation.error.message
                            : 'Failed to update note'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="prose prose-sm max-w-none mb-3">
                        {/^<[a-z][\s\S]*>/i.test(note.content.trim()) ? (
                          // Render HTML content (from TipTap) - using text-sm to match AI Summary
                          <div
                            className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-green-38 prose-headings:text-sm prose-h1:text-sm prose-p:text-sm prose-p:text-green-34 prose-p:leading-relaxed prose-ul:text-sm prose-ul:text-green-34 prose-ol:text-sm prose-ol:text-green-34 prose-li:text-sm prose-li:text-green-34 prose-code:text-sm prose-code:bg-green-4 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-green-38 prose-pre:text-grayscale-8 prose-a:text-sm prose-a:text-green-34 prose-a:no-underline hover:prose-a:underline prose-strong:text-sm prose-strong:text-green-38 prose-strong:font-semibold prose-em:text-sm prose-em:text-green-34 prose-blockquote:border-l-4 prose-blockquote:border-green-6 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-sm"
                            dangerouslySetInnerHTML={{ __html: note.content }}
                          />
                        ) : (
                          // Render markdown content
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              // Style markdown elements - using text-sm to match AI Summary
                              h1: ({ node, ...props }) => <h1 className="text-sm font-semibold text-green-38 mt-2 mb-2" {...props} />,
                              h2: ({ node, ...props }) => <h2 className="text-sm font-semibold text-green-38 mt-2 mb-2" {...props} />,
                              h3: ({ node, ...props }) => <h3 className="text-sm font-semibold text-green-38 mt-1 mb-1" {...props} />,
                              p: ({ node, ...props }) => <p className="text-sm text-green-34 mb-2 leading-relaxed" {...props} />,
                              ul: ({ node, ...props }) => <ul className="text-sm text-green-34 mb-2 ml-4 list-disc" {...props} />,
                              ol: ({ node, ...props }) => <ol className="text-sm text-green-34 mb-2 ml-4 list-decimal" {...props} />,
                              li: ({ node, ...props }) => <li className="text-sm text-green-34 mb-1" {...props} />,
                              code: ({ node, inline, ...props }: any) =>
                                inline ? (
                                  <code className="text-sm bg-green-4 px-1.5 py-0.5 rounded font-mono text-green-38" {...props} />
                                ) : (
                                  <code className="block text-sm bg-green-38 text-grayscale-8 p-2 rounded overflow-x-auto" {...props} />
                                ),
                              pre: ({ node, ...props }) => <pre className="text-sm bg-green-38 text-grayscale-8 p-2 rounded overflow-x-auto mb-2" {...props} />,
                              a: ({ node, ...props }) => <a className="text-sm text-green-34 hover:underline" {...props} />,
                              blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-green-6 pl-3 italic text-green-28 mb-2 text-sm" {...props} />,
                              strong: ({ node, ...props }) => <strong className="font-semibold text-green-38 text-sm" {...props} />,
                              em: ({ node, ...props }) => <em className="italic text-green-34 text-sm" {...props} />,
                            }}
                          >
                            {note.content}
                          </ReactMarkdown>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-green-6">
                        <div className="text-xs text-green-28">
                          {note.note_scope === 'page' && notePage && (
                            <span className="mr-2">Page {notePage}</span>
                          )}
                          {note.note_scope === 'document' && (
                            <span className="mr-2">Document note</span>
                          )}
                          <span>{format(new Date(note.created_at), 'MMM d, yyyy HH:mm')}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (onEditNote)
                              {
                                // When onEditNote is provided (fullscreen mode), use callback
                                onEditNote(note);
                              } else
                              {
                                // Otherwise, use inline editing
                                handleEditNote(note);
                              }
                            }}
                            disabled={deleteNoteMutation.isPending || (editingNoteId !== null && !onEditNote)}
                            className="text-xs h-6 px-2 text-green-34 hover:text-green-38"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteNote(note.id)}
                            disabled={deleteNoteMutation.isPending || editingNoteId !== null}
                            className="text-xs h-6 px-2 text-red-13 hover:text-red-16"
                          >
                            Delete
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
          <p className="text-sm text-anara-light-text-muted text-center py-8">
            {noteScope === 'page' ? `No notes for page ${currentPage} yet` : 'No document notes yet'}
          </p>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}


