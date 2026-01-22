import { NotesPanel } from './NotesPanel';
import { Button } from './Button';
import { X } from 'lucide-react';
import type { Annotation } from '@/lib/api/annotations';

interface NotesSidebarProps {
  paperId: number;
  currentPage: number;
  annotations: Annotation[];
  isLoading: boolean;
  onClose: () => void;
  onEditNote: (note: Annotation) => void;
  onCreateNote?: () => void;
}

export function NotesSidebar({
  paperId,
  currentPage,
  annotations,
  isLoading,
  onClose,
  onEditNote,
  onCreateNote
}: NotesSidebarProps) {
  return (
    <div 
      className="fixed inset-y-0 right-0 z-50 w-[700px] bg-white border-l border-gray-200 shadow-lg flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-semibold">Notes</h2>
        <div className="flex items-center gap-2">
          {onCreateNote && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateNote}
              className="h-8 px-2 text-xs"
              title="Create New Note"
            >
              New Note
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
            aria-label="Close notes sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Notes Panel */}
      <div className="flex-1 overflow-hidden min-h-0">
        <NotesPanel
          paperId={paperId}
          currentPage={currentPage}
          annotations={annotations}
          isLoading={isLoading}
          onEditNote={onEditNote}
        />
      </div>
    </div>
  );
}

