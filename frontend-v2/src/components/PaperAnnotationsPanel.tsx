import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ChatIcon, ChevronRightIcon, EditIcon, ExternalLinkIcon, HighlighterIcon, TrashIcon } from '@/components/icons';
import { type Annotation } from '@/lib/api/annotations';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnnotationIllustration } from '@/components/illustrations';
import { cn } from '@/lib/utils';

interface PaperAnnotationsPanelProps {
  annotations: Annotation[];
  isLoading: boolean;
  currentPage: number;
  filterByPage: boolean;
  onFilterByPageChange: (value: boolean) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  onEditAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: number) => void;
  isDeleting?: boolean;
}

export function PaperAnnotationsPanel({
  annotations,
  isLoading,
  currentPage,
  filterByPage,
  onFilterByPageChange,
  onAnnotationClick,
  onEditAnnotation,
  onDeleteAnnotation,
}: PaperAnnotationsPanelProps) {
  const navigate = useNavigate();
  const annotationItems = annotations.filter(ann => ann.type !== 'note');
  const noteItems = annotations.filter(ann => ann.type === 'note');

  const filteredAnnotations = filterByPage
    ? annotationItems.filter(ann => ann.coordinate_data?.page === currentPage)
    : annotationItems;

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const renderAnnotationCard = (ann: Annotation) => {
    const isNote = ann.type === 'note';
    const page = ann.coordinate_data?.page as number | undefined;
    const isOnCurrentPage = page === currentPage;

    return (
      <div
        key={ann.id}
        onClick={() => onAnnotationClick(ann)}
        className={cn(
          "group relative p-4 rounded-2xl border transition-all cursor-pointer",
          isOnCurrentPage
            ? "bg-(--white) border-(--foreground)/20 shadow-sm"
            : "bg-(--muted)/20 border-transparent hover:bg-(--muted)/40"
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {isNote ? (
              <ChatIcon size="sm" className="text-(--muted-foreground) shrink-0" />
            ) : (
              <HighlighterIcon size="sm" className="text-(--muted-foreground) shrink-0" />
            )}
            {page && (
              <span className={cn(
                "text-micro font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                isOnCurrentPage ? "bg-(--foreground) text-(--white)" : "bg-(--border) text-(--muted-foreground)"
              )}>
                Page {page}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="icon"
              size="icon-xs"
              onClick={(e) => { e.stopPropagation(); onEditAnnotation(ann); }}
              aria-label="Edit annotation"
            >
              <EditIcon size="xs" />
            </Button>
            <Button
              variant="icon"
              size="icon-xs"
              className="text-(--destructive) hover:bg-(--destructive)/10"
              onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(ann.id); }}
              aria-label="Delete annotation"
            >
              <TrashIcon size="xs" />
            </Button>
          </div>
        </div>

        {ann.highlighted_text && (
          <div className="mb-2 p-2 bg-(--white) border border-(--border) rounded-lg">
            <p className="text-caption text-(--muted-foreground) line-clamp-2">
              "{ann.highlighted_text}"
            </p>
          </div>
        )}

        <p className="text-code text-(--foreground) leading-relaxed whitespace-pre-wrap">
          {ann.content}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-micro text-(--muted-foreground) opacity-60 font-medium uppercase tabular-nums">
            {format(new Date(ann.created_at), 'MMM d, yyyy')}
          </span>
          <ChevronRightIcon size="xs" className="text-(--muted-foreground) opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-body font-bold text-(--foreground)">Annotations</h3>
          <span className="text-caption bg-(--muted) px-1.5 py-0.5 rounded-full text-(--muted-foreground) tabular-nums">
            {annotationItems.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {annotationItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-caption text-(--muted-foreground) hover:text-(--foreground)"
              onClick={() => navigate('/annotations')}
            >
              <ExternalLinkIcon size="sm" />
              Cite & Export
            </Button>
          )}
          <button
            onClick={() => onFilterByPageChange(!filterByPage)}
            className={cn(
              "text-caption font-medium px-2 py-1 rounded-lg border transition-all",
              filterByPage
                ? "bg-(--foreground) text-(--white) border-(--foreground)"
                : "text-(--muted-foreground) border-(--border) hover:border-(--muted-foreground)/50"
            )}
          >
            {filterByPage ? `Page ${currentPage} only` : 'All pages'}
          </button>
        </div>
      </div>

      {filteredAnnotations.length > 0 ? (
        <div className="space-y-4">
          {filteredAnnotations.map(renderAnnotationCard)}
        </div>
      ) : (
        <div className="bg-(--muted)/10 rounded-2xl border border-dashed border-(--border)">
          <EmptyState
            size="panel"
            illustration={AnnotationIllustration}
            title={filterByPage ? `No annotations on page ${currentPage}` : 'No annotations yet'}
          />
        </div>
      )}

      {noteItems.length > 0 && (
        <div className="pt-8 border-t border-(--border)">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-body font-bold text-(--foreground)">General Notes</h3>
            <span className="text-caption bg-(--muted) px-1.5 py-0.5 rounded-full text-(--muted-foreground) tabular-nums">
              {noteItems.length}
            </span>
          </div>
          <div className="space-y-4">
            {noteItems.map(renderAnnotationCard)}
          </div>
        </div>
      )}
    </div>
  );
}
