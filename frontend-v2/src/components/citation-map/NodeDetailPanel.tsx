import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CloseIcon, ExternalLinkIcon, TrashIcon } from '@/components/icons';
import { citationMapApi, type MapNode, type CitationMapResponse } from '@/lib/api/citationMap';
import { toastError } from '@/lib/utils/toast';

interface NodeDetailPanelProps {
  node: MapNode;
  onClose: () => void;
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: (paperId: number) => citationMapApi.removeFocal(paperId),
    onSuccess: (res: CitationMapResponse) => {
      queryClient.setQueryData(['citation-map'], res);
      onClose();
    },
    onError: () => toastError('Failed to remove paper'),
  });

  const externalUrl = node.url
    ? node.url
    : node.doi
      ? `https://doi.org/${node.doi}`
      : node.s2_id
        ? `https://www.semanticscholar.org/paper/${node.s2_id}`
        : null;

  return (
    <div className="flex flex-col h-full bg-(--card) md:border-l border-t md:border-t-0 border-(--border)">
      <div className="flex items-start justify-between gap-2 p-4 border-b border-(--border)">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {node.is_focal && (
              <span className="text-caption font-semibold px-1.5 py-0.5 rounded bg-(--foreground) text-(--background)">
                Focal
              </span>
            )}
            {node.shared && (
              <span className="text-caption font-semibold px-1.5 py-0.5 rounded bg-(--coral-red)/15 text-(--coral-red)">
                Shared
              </span>
            )}
          </div>
          <h4 className="text-body font-semibold text-(--foreground) leading-snug">{node.title}</h4>
          <p className="text-caption text-(--muted-foreground) mt-1">
            {[node.authors, node.year, node.citation_count != null ? `${node.citation_count} citations` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-(--muted-foreground) hover:text-(--foreground) transition-colors"
        >
          <CloseIcon size="md" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-4">
        {node.library_paper_id != null && (
          <button
            type="button"
            onClick={() => navigate(`/papers/${node.library_paper_id}`)}
            className="flex items-center gap-1.5 px-2.5 h-8 text-caption font-medium bg-(--muted) text-(--foreground) border border-(--border) rounded-lg hover:bg-(--border) transition-colors"
          >
            <ExternalLinkIcon size="sm" /> Open paper
          </button>
        )}
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 h-8 text-caption font-medium bg-(--muted) text-(--foreground) border border-(--border) rounded-lg hover:bg-(--border) transition-colors"
          >
            <ExternalLinkIcon size="sm" /> {node.doi ? 'View DOI' : 'Semantic Scholar'}
          </a>
        )}
        {node.is_focal && node.library_paper_id != null && (
          <button
            type="button"
            onClick={() => removeMutation.mutate(node.library_paper_id!)}
            disabled={removeMutation.isPending}
            className="flex items-center gap-1.5 px-2.5 h-8 text-caption font-medium text-(--coral-red) border border-(--border) rounded-lg hover:bg-(--coral-red)/10 transition-colors"
          >
            <TrashIcon size="sm" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
