import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { Button } from './Button';
import { TipTapEditor } from './TipTapEditor';
import { X, FileText, BookOpen } from 'lucide-react';

interface FloatingNoteEditorProps {
  paperId: number;
  currentPage: number;
  annotation?: Annotation | null;
  position: { x: number; y: number };
  onCancel: () => void;
  onSuccess: () => void;
}

type NoteScope = 'page' | 'document';

export function FloatingNoteEditor({
  paperId,
  currentPage,
  annotation,
  position,
  onCancel,
  onSuccess,
}: FloatingNoteEditorProps) {
  const [noteScope, setNoteScope] = useState<NoteScope>(
    annotation?.note_scope === 'document' ? 'document' : 'page'
  );
  const [content, setContent] = useState(annotation?.content || '');
  const formRef = useRef<HTMLDivElement>(null);
  const [formPosition, setFormPosition] = useState({ x: position.x, y: position.y });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (annotation) {
      setContent(annotation.content || '');
      setNoteScope(annotation.note_scope === 'document' ? 'document' : 'page');
    } else {
      setContent('');
      setNoteScope('page');
    }
  }, [annotation]);

  // Calculate smart positioning after form is rendered
  useEffect(() => {
    if (!formRef.current) return;

    const form = formRef.current;
    const padding = 16;
    const scrollbarWidth = 17;
    
    const rect = form.getBoundingClientRect();
    const formWidth = rect.width;
    const formHeight = rect.height;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    if (x + formWidth > window.innerWidth - padding) {
      if (x - formWidth > padding) {
        x = x - formWidth - 10;
      } else {
        x = Math.max(padding, (window.innerWidth - formWidth - scrollbarWidth) / 2);
      }
    } else if (x < padding) {
      x = padding;
    }

    // Adjust vertical position
    if (y + formHeight > window.innerHeight - padding) {
      const spaceAbove = y - padding;
      const spaceBelow = window.innerHeight - y - padding;
      
      if (spaceAbove > spaceBelow && spaceAbove >= formHeight) {
        y = y - formHeight - 10;
      } else if (spaceAbove < formHeight && spaceBelow < formHeight) {
        y = padding;
        form.style.maxHeight = `${window.innerHeight - padding * 2}px`;
      } else {
        y = window.innerHeight - formHeight - padding;
      }
    } else if (y < padding) {
      y = padding;
    }

    setFormPosition({ x, y });
  }, [position.x, position.y, content, annotation]);

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

    if (annotation) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest('.react-pdf__Page')) {
          onCancel();
        }
      }
    };

    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onCancel]);

  // Close on ESC key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      ref={formRef}
      className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-xl flex flex-col animate-in fade-in-0 zoom-in-95 duration-200"
      style={{
        left: `${formPosition.x}px`,
        top: `${formPosition.y}px`,
        minWidth: '400px',
        maxWidth: '600px',
        maxHeight: 'calc(100vh - 32px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {annotation ? 'Edit Note' : 'New Note'}
          </h3>
          {noteScope === 'page' && (
            <p className="text-xs text-gray-500 mt-1">
              Page {currentPage}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-8 w-8 p-0"
          aria-label="Close note editor"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scope Toggle */}
      <div className="px-4 pt-3 flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-gray-600">Scope:</span>
        <div className="flex gap-1 bg-gray-100 rounded p-1">
          <button
            onClick={() => setNoteScope('page')}
            disabled={isSaving}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
              noteScope === 'page'
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
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
              noteScope === 'document'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <BookOpen className="h-3 w-3" />
            Document
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0" style={{ maxHeight: 'calc(100vh - 200px)' }}>
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
          onClick={onCancel}
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

