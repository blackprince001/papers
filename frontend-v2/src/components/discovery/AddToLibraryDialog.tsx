import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, FolderIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { groupsApi } from '@/lib/api/groups';
import { papersApi } from '@/lib/api/papers';
import type { DiscoveredPaperPreview } from '@/lib/api/discovery';
import { toastSuccess, toastError } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';

interface AddToLibraryDialogProps {
  paper: DiscoveredPaperPreview | { title: string; url: string };
  onClose: () => void;
}

function resolveUrl(paper: AddToLibraryDialogProps['paper']): string | null {
  if ('pdf_url' in paper || 'source' in paper) {
    const p = paper as DiscoveredPaperPreview;
    if (!p.pdf_url && p.source === 'semantic_scholar') return null; // no_pdf
    return p.pdf_url || p.url || null;
  }
  return paper.url || null;
}

function isNoPdf(paper: AddToLibraryDialogProps['paper']): boolean {
  if ('source' in paper) {
    const p = paper as DiscoveredPaperPreview;
    return !p.pdf_url && p.source === 'semantic_scholar';
  }
  return false;
}

interface AddToLibraryDialogProps {
  paper: DiscoveredPaperPreview | { title: string; url: string };
  onClose: () => void;
}

export function AddToLibraryDialog({ paper, onClose }: AddToLibraryDialogProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const queryClient = useQueryClient();

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (isNoPdf(paper)) throw new Error('no_pdf');
      const url = resolveUrl(paper);
      if (!url) throw new Error('no_url');
      return papersApi.ingestBatch([url], selectedGroupIds.length > 0 ? selectedGroupIds : undefined);
    },
    onSuccess: (data) => {
      if (data.errors?.length) {
        toastError(`Failed to add paper: ${data.errors[0].error}`);
      } else {
        toastSuccess('Paper added to library');
        queryClient.invalidateQueries({ queryKey: ['papers'] });
        onClose();
      }
    },
    onError: (error: Error) => {
      if (error.message === 'no_url') {
        toastError('Cannot add paper', 'No URL is available for this paper.');
      } else if (error.message === 'no_pdf') {
        toastError('No PDF available', 'Try finding this paper on arXiv or the publisher website.');
      } else {
        toastError('Failed to add paper', error.message);
      }
    },
  });

  const toggleGroup = (id: number) =>
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-(--white) border border-(--border) rounded-2xl p-5 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-body font-semibold text-(--foreground) mb-1">Add to Library</h2>
        <p className="text-caption text-(--muted-foreground) mb-4 line-clamp-2">{paper.title}</p>

        {groups.length > 0 && (
          <>
            <p className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-2">
              Add to group (optional)
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
              {groups.map((group) => {
                const selected = selectedGroupIds.includes(group.id);
                return (
                  <button
                    key={group.id}
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-body transition-colors text-left',
                      selected
                        ? 'bg-(--foreground) text-(--white)'
                        : 'hover:bg-(--muted) text-(--foreground)'
                    )}
                  >
                    <FolderIcon size="sm" className="shrink-0" />
                    <span className="flex-1 truncate">{group.name}</span>
                    {selected && <CheckCircleIcon size="sm" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-lg border border-(--border) text-body hover:bg-(--muted) transition-colors"
          >
            Cancel
          </button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            className="flex-1 h-9"
          >
            Add to Library
          </Button>
        </div>
      </div>
    </div>
  );
}
