import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, CloseIcon, ExternalLinkIcon } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { CitationIllustration } from '@/components/illustrations';
import { discoveryApi, type DiscoveredPaperPreview } from '@/lib/api/discovery';

interface CitationExplorerProps {
  paper: DiscoveredPaperPreview;
  isOpen: boolean;
  onClose: () => void;
  onSelectPaper: (paper: DiscoveredPaperPreview) => void;
}

function PaperItem({ paper, onClick }: { paper: DiscoveredPaperPreview; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full p-3 bg-(--card) border border-(--border) rounded-xl hover:border-(--foreground) transition-colors text-left group"
    >
      <p className="text-code font-semibold text-(--foreground) leading-snug line-clamp-2">{paper.title}</p>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-caption text-(--muted-foreground) line-clamp-1">
          {paper.authors?.slice(0, 2).join(', ')}{paper.authors && paper.authors.length > 2 ? ' et al.' : ''}
          {paper.year ? ` · ${paper.year}` : ''}
          {paper.citation_count !== undefined ? ` · ${paper.citation_count} citations` : ''}
        </p>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {paper.url && (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 text-(--muted-foreground) hover:text-(--foreground) opacity-0 group-hover:opacity-100 transition-all"
            >
              <ExternalLinkIcon size="xs" />
            </a>
          )}
          <ArrowRightIcon size="xs" className="text-(--muted-foreground) group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </button>
  );
}

export function CitationExplorer({ paper, isOpen, onClose, onSelectPaper }: CitationExplorerProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['citation-explorer', paper.source, paper.external_id],
    queryFn: () => discoveryApi.exploreCitations({ source: paper.source, external_id: paper.external_id, direction: 'both' }),
    enabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[90vh] bg-(--white) border border-(--border) rounded-2xl shadow-modal flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-(--border) flex items-center justify-between bg-(--card)">
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="text-btn font-bold text-(--foreground) truncate">{paper.title}</h3>
            <p className="text-caption text-(--muted-foreground) mt-0.5">
              {paper.authors?.slice(0, 2).join(', ')}{paper.authors && paper.authors.length > 2 ? ' et al.' : ''}
              {paper.year ? ` · ${paper.year}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) rounded-xl transition-colors shrink-0">
            <CloseIcon size="lg" />
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Spinner size="lg" className="text-(--muted-foreground)" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-code text-(--muted-foreground)">Failed to load citation data.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* References */}
            <div className="flex-1 flex flex-col border-r border-(--border)">
              <div className="px-5 py-2.5 bg-(--muted) border-b border-(--border)">
                <span className="text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
                  References ({data?.references_count ?? data?.references.length ?? 0})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {data?.references.length === 0 && (
                  <EmptyState size="panel" illustration={CitationIllustration} title="No references found" />
                )}
                {data?.references.map((ref, i) => (
                  <PaperItem key={i} paper={ref} onClick={() => onSelectPaper(ref)} />
                ))}
              </div>
            </div>

            {/* Citations */}
            <div className="flex-1 flex flex-col">
              <div className="px-5 py-2.5 bg-(--muted) border-b border-(--border)">
                <span className="text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
                  Citations ({data?.citations_count ?? data?.citations.length ?? 0})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {data?.citations.length === 0 && (
                  <EmptyState size="panel" illustration={CitationIllustration} title="No citations found" />
                )}
                {data?.citations.map((cit, i) => (
                  <PaperItem key={i} paper={cit} onClick={() => onSelectPaper(cit)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
