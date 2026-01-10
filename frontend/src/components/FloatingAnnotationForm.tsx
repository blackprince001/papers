import { useEffect, useRef, useState } from 'react';
import { AnnotationForm } from './AnnotationForm';
import type { Annotation } from '@/lib/api/annotations';

interface FloatingAnnotationFormProps {
  paperId: number;
  coordinateData: { page: number; x: number; y: number };
  position: { x: number; y: number };
  annotation?: Annotation | null;
  highlightedText?: string;
  selectionData?: any;
  onCancel: () => void;
  onSuccess: () => void;
}

export function FloatingAnnotationForm({
  paperId,
  coordinateData,
  position,
  annotation,
  highlightedText,
  selectionData,
  onCancel,
  onSuccess,
}: FloatingAnnotationFormProps) {
  const formRef = useRef<HTMLDivElement>(null);
  const [formPosition, setFormPosition] = useState({ x: position.x, y: position.y });

  // Calculate smart positioning after form is rendered
  useEffect(() => {
    if (!formRef.current) return;

    const form = formRef.current;
    const padding = 16;
    const scrollbarWidth = 17; // Approximate scrollbar width

    // Get actual form dimensions
    const rect = form.getBoundingClientRect();
    const formWidth = rect.width;
    const formHeight = rect.height;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    // Try to position to the right of click, but ensure it fits
    if (x + formWidth > window.innerWidth - padding)
    {
      // Doesn't fit on the right, try left side
      if (x - formWidth > padding)
      {
        x = x - formWidth - 10; // Position to the left with gap
      } else
      {
        // Doesn't fit on either side, center it horizontally
        x = Math.max(padding, (window.innerWidth - formWidth - scrollbarWidth) / 2);
      }
    } else if (x < padding)
    {
      x = padding;
    }

    // Adjust vertical position
    // Try to position below click, but ensure it fits
    if (y + formHeight > window.innerHeight - padding)
    {
      // Doesn't fit below, try above
      const spaceAbove = y - padding;
      const spaceBelow = window.innerHeight - y - padding;

      if (spaceAbove > spaceBelow && spaceAbove >= formHeight)
      {
        // More space above and form fits
        y = y - formHeight - 10; // Position above with gap
      } else if (spaceAbove < formHeight && spaceBelow < formHeight)
      {
        // Form doesn't fit in either direction, position at top with max height
        y = padding;
        // Limit form height to available space
        form.style.maxHeight = `${window.innerHeight - padding * 2}px`;
      } else
      {
        // Position at bottom with available space
        y = window.innerHeight - formHeight - padding;
      }
    } else if (y < padding)
    {
      y = padding;
    }

    setFormPosition({ x, y });
  }, [position.x, position.y, highlightedText, annotation]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node))
      {
        // Don't close if clicking on the PDF (which triggers annotation)
        const target = event.target as HTMLElement;
        if (!target.closest('.react-pdf__Page'))
        {
          onCancel();
        }
      }
    };

    // Delay to avoid immediate close on the click that opened it
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
      if (event.key === 'Escape')
      {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  return (
    <div
      ref={formRef}
      className="fixed z-50 bg-blue-2 border border-blue-10 rounded-lg shadow-xl p-4 animate-in fade-in-0 zoom-in-95 duration-200"
      style={{
        left: `${formPosition.x}px`,
        top: `${formPosition.y}px`,
        minWidth: '300px',
        maxWidth: '400px',
        maxHeight: 'calc(100vh - 32px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex-shrink-0">
        <h3 className="text-xs font-semibold text-green-38">
          {annotation ? 'Edit Annotation' : highlightedText ? 'Add Annotation from Highlight' : 'Add Annotation'}
        </h3>
        <p className="text-xs text-green-28 mt-1">
          Page {coordinateData.page} • ({Math.round(coordinateData.x * 100)}%, {Math.round(coordinateData.y * 100)}%)
        </p>
      </div>
      {highlightedText && (
        <div className="mb-3 p-2 bg-yellow-2 border border-yellow-3 rounded text-xs text-green-34 flex-shrink-0 max-h-24 overflow-y-auto">
          <p className="font-medium text-xs text-green-28 mb-1">Highlighted text:</p>
          <p className="italic text-xs">{highlightedText}</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <AnnotationForm
          paperId={paperId}
          annotation={annotation}
          coordinateData={coordinateData}
          highlightedText={highlightedText}
          selectionData={selectionData}
          onCancel={onCancel}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}

