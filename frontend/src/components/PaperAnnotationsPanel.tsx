import { format } from 'date-fns';
import { type Annotation } from '@/lib/api/annotations';
import { type UseMutationResult } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Highlighter } from 'lucide-react';

interface PaperAnnotationsPanelProps {
  paperId: number;
  annotations: Annotation[];
  annotationsLoading: boolean;
  currentPage: number;
  filterByPage: boolean;
  onFilterByPageChange: (value: boolean) => void;
  editingAnnotation: Annotation | null;
  onEditAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: number) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  deleteAnnotationMutation: UseMutationResult<any, Error, number, unknown>;
  getAnnotationPage: (annotation: Annotation) => number | null;
}

export function PaperAnnotationsPanel({
  paperId: _paperId,
  annotations,
  annotationsLoading,
  currentPage,
  filterByPage,
  onFilterByPageChange,
  editingAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  onAnnotationClick,
  deleteAnnotationMutation,
  getAnnotationPage,
}: PaperAnnotationsPanelProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base sm:text-lg font-semibold text-anara-light-text">
          Annotations ({annotations?.filter((ann) => ann.type !== 'note').length || 0})
        </h3>
        {annotations && annotations.filter((ann) => ann.type !== 'note').length > 0 && (
          <label className="flex items-center gap-2 text-xs text-anara-light-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={filterByPage}
              onChange={(e) => onFilterByPageChange(e.target.checked)}
              className="w-4 h-4"
            />
            Filter by page
          </label>
        )}
      </div>
      {annotationsLoading ? (
        <div className="text-anara-light-text-muted text-sm">Loading annotations...</div>
      ) : (() => {
        const annotationItems = annotations?.filter((ann) => ann.type !== 'note') || [];
        const displayedAnnotations = filterByPage
          ? annotationItems.filter((ann) => {
            const annPage = getAnnotationPage(ann);
            return annPage === currentPage;
          })
          : annotationItems;

        return displayedAnnotations.length > 0 ? (
          <div className="space-y-3">
            {displayedAnnotations.map((annotation) => {
              const page = getAnnotationPage(annotation);
              const isEditing = editingAnnotation?.id === annotation.id;
              const isOnCurrentPage = page === currentPage;
              return (
                <div
                  key={annotation.id}
                  data-annotation-id={annotation.id}
                  onClick={() => onAnnotationClick(annotation)}
                  className={`border rounded-sm p-3 sm:p-4 transition-all cursor-pointer hover:bg-blue-5 ${isEditing
                    ? 'border-blue-31 bg-blue-14'
                    : isOnCurrentPage && !filterByPage
                      ? 'border-blue-10 bg-teal-2'
                      : 'border-blue-10 bg-blue-4'
                    }`}
                >
                  {annotation.highlighted_text && (
                    <div className="mb-2 p-2 bg-yellow-2 border border-yellow-3 rounded text-xs italic text-green-38">
                      "{annotation.highlighted_text}"
                    </div>
                  )}
                  <p className="text-sm mb-2 break-words whitespace-pre-wrap text-anara-light-text">{annotation.content}</p>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-anara-light-text-muted">
                      {page ? (
                        <span className={`mr-2 ${isOnCurrentPage ? 'font-semibold text-anara-light-text' : ''}`}>
                          Page {page}
                        </span>
                      ) : (
                        <span className="text-anara-light-text-muted/50 mr-2">No position</span>
                      )}
                      <span>{format(new Date(annotation.created_at), 'MMM d, yyyy HH:mm')}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditAnnotation(annotation);
                        }}
                        disabled={isEditing || deleteAnnotationMutation.isPending}
                        className="text-xs h-6 px-2 text-green-28 hover:text-green-38 hover:bg-blue-5"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteAnnotation(annotation.id);
                        }}
                        disabled={isEditing || deleteAnnotationMutation.isPending}
                        className="text-xs h-6 px-2 text-red-600 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Highlighter className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">
              {filterByPage ? `No annotations on page ${currentPage}` : 'No annotations yet'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Select text in the PDF and use the highlight tool to annotate</p>
          </div>
        );
      })()}
    </div>
  );
}

