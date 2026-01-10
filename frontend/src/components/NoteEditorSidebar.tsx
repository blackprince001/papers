import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { Button } from './Button';
import { TipTapEditor } from './TipTapEditor';
import { X, FileText, BookOpen } from 'lucide-react';

interface NoteEditorSidebarProps {
  paperId: number;
  currentPage: number;
  annotation?: Annotation | null; // For edit mode
  onClose: () => void;
  onSuccess: () => void;
}

type NoteScope = 'page' | 'document';

export function NoteEditorSidebar({
  paperId,
  currentPage,
  annotation,
  onClose,
  onSuccess,
}: NoteEditorSidebarProps) {
  const [noteScope, setNoteScope] = useState<NoteScope>(
    annotation?.note_scope === 'document' ? 'document' : 'page'
  );
  const [content, setContent] = useState(annotation?.content || '');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (annotation)
    {
      setContent(annotation.content || '');
      setNoteScope(annotation.note_scope === 'document' ? 'document' : 'page');
    } else
    {
      setContent('');
      setNoteScope('page');
    }
  }, [annotation]);

  const createMutation = useMutation({
    mutationFn: () =>
      annotationsApi.create({
        paper_id: paperId,
        content,
        type: 'note',
        note_scope: noteScope,
        coordinate_data: noteScope === 'page' ? { page: currentPage } : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      onSuccess();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      annotationsApi.update(annotation!.id, {
        content,
        note_scope: noteScope,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      onSuccess();
    },
  });

  const handleSave = () => {
    if (!content.trim()) return;

    if (annotation)
    {
      updateMutation.mutate();
    } else
    {
      createMutation.mutate();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div 
      className="fixed inset-y-0 right-0 z-50 w-[550px] bg-white border-l border-gray-200 shadow-lg flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-semibold">
          {annotation ? 'Edit Note' : 'New Note'}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="h-8 w-8 p-0"
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scope Toggle */}
      <div className="px-4 pt-4 flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-gray-600">Scope:</span>
        <div className="flex gap-1 bg-gray-100 rounded p-1">
          <button
            onClick={() => setNoteScope('page')}
            disabled={isSaving}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${noteScope === 'page'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <FileText className="h-3 w-3" />
            Page
          </button>
          <button
            onClick={() => setNoteScope('document')}
            disabled={isSaving}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${noteScope === 'document'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <BookOpen className="h-3 w-3" />
            Document
          </button>
        </div>
        {noteScope === 'page' && (
          <span className="text-xs text-gray-500 ml-auto">Page {currentPage}</span>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <TipTapEditor
          content={content}
          onChange={setContent}
          placeholder={
            noteScope === 'page'
              ? `Add a note for page ${currentPage}...`
              : 'Add a document note...'
          }
          editable={!isSaving}
          autoFocus
          showToolbar={true}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!content.trim() || isSaving}
        >
          {isSaving
            ? 'Saving...'
            : annotation
              ? 'Update Note'
              : 'Save Note'}
        </Button>
      </div>

      {/* Error Display */}
      {(createMutation.isError || updateMutation.isError) && (
        <div className="px-4 pb-4 flex-shrink-0">
          <p className="text-xs text-red-600">
            Error: {(createMutation.error || updateMutation.error) instanceof Error
              ? (createMutation.error || updateMutation.error)?.message
              : 'Failed to save note'}
          </p>
        </div>
      )}
    </div>
  );
}

