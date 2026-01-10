import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { Button } from './Button';

interface AnnotationFormProps {
  paperId: number;
  annotation?: Annotation | null; // For edit mode
  coordinateData?: { page: number; x: number; y: number } | null; // For PDF click-to-annotate
  highlightedText?: string; // Pre-filled highlighted text
  selectionData?: any; // Selection coordinates
  onCancel?: () => void; // Callback to cancel edit mode
  onSuccess?: () => void; // Callback after successful save
}

export function AnnotationForm({ 
  paperId, 
  annotation, 
  coordinateData,
  highlightedText,
  selectionData,
  onCancel,
  onSuccess 
}: AnnotationFormProps) {
  const [content, setContent] = useState('');
  const queryClient = useQueryClient();
  const isEditMode = !!annotation;

  // Initialize form with annotation data if editing, or highlighted text if available
  useEffect(() => {
    if (annotation) {
      setContent(annotation.content || '');
    } else if (highlightedText) {
      // Pre-fill with highlighted text, user can add more
      setContent(highlightedText);
    } else {
      setContent('');
    }
  }, [annotation, highlightedText]);

  const createMutation = useMutation({
    mutationFn: () =>
      annotationsApi.create({
        paper_id: paperId,
        content,
        type: 'annotation',
        highlighted_text: highlightedText || undefined,
        selection_data: selectionData || undefined,
        coordinate_data: coordinateData || undefined,
      }),
    onSuccess: () => {
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      onSuccess?.();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      annotationsApi.update(annotation!.id, {
        content,
        highlighted_text: highlightedText || annotation?.highlighted_text,
        selection_data: selectionData || annotation?.selection_data,
        coordinate_data: coordinateData || annotation?.coordinate_data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      onSuccess?.();
    },
  });

  const mutation = isEditMode ? updateMutation : createMutation;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      mutation.mutate();
    }
  };

  const handleCancel = () => {
    setContent('');
    onCancel?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={isEditMode ? "Edit annotation..." : highlightedText ? "Add your notes or commentary..." : "Add an annotation..."}
        className="w-full px-3 py-2 border border-green-6 rounded-md bg-grayscale-8 text-green-38 resize-none focus:outline-none focus:ring-2 focus:ring-blue-19 focus:border-transparent text-xs"
        rows={4}
        autoFocus
      />
      {coordinateData && (
        <p className="text-xs text-green-28">
          Position: Page {coordinateData.page}, ({Math.round(coordinateData.x * 100)}%, {Math.round(coordinateData.y * 100)}%)
        </p>
      )}
      <div className="flex gap-2">
        {isEditMode && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!content.trim() || mutation.isPending}
          size="sm"
        >
          {mutation.isPending 
            ? (isEditMode ? 'Updating...' : 'Adding...') 
            : (isEditMode ? 'Update Annotation' : 'Add Annotation')}
        </Button>
      </div>
      {mutation.isError && (
        <p className="text-xs text-red-13">
          Error: {mutation.error instanceof Error ? mutation.error.message : `Failed to ${isEditMode ? 'update' : 'add'} annotation`}
        </p>
      )}
    </form>
  );
}

