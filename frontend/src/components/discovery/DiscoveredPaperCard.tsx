import { useState } from 'react';
import { ExternalLink, Plus, Users, Calendar, Quote, Check, GitBranch } from 'lucide-react';
import type { DiscoveredPaperPreview } from '@/lib/api/discovery';
import { AddToLibraryDialog } from './AddToLibraryDialog';

interface DiscoveredPaperCardProps {
  paper: DiscoveredPaperPreview;
  onExploreCitations?: (paper: DiscoveredPaperPreview) => void;
  showCitationButton?: boolean;
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  arxiv: { label: 'arXiv', color: 'bg-red-100 text-red-800 border-red-200' },
  semantic_scholar: { label: 'S2', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  pubmed: { label: 'PubMed', color: 'bg-green-100 text-green-800 border-green-200' },
  crossref: { label: 'Crossref', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  openalex: { label: 'OpenAlex', color: 'bg-orange-100 text-orange-800 border-orange-200' },
};

export function DiscoveredPaperCard({
  paper,
  onExploreCitations,
  showCitationButton = true,
}: DiscoveredPaperCardProps) {
  const [isAdded, setIsAdded] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const sourceBadge = SOURCE_BADGES[paper.source] || {
    label: paper.source,
    color: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const authors = paper.authors?.slice(0, 3) || [];
  const hasMoreAuthors = (paper.authors?.length || 0) > 3;

  const handleAddSuccess = () => {
    setIsAdded(true);
    setShowDialog(false);
  };

  return (
    <>
      <div className="border border-green-6 rounded-sm p-4 bg-grayscale-8 hover:bg-green-4/30 transition-all duration-200">
        {/* Header with source badge and actions */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${sourceBadge.color}`}>
              {sourceBadge.label}
            </span>
            {paper.year && (
              <span className="flex items-center gap-1 text-xs text-green-28">
                <Calendar className="w-3 h-3" />
                {paper.year}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {paper.url && (
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-green-28 hover:text-green-38 hover:bg-green-6 rounded transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => setShowDialog(true)}
              disabled={isAdded}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm transition-all duration-200
                ${
                  isAdded
                    ? 'bg-green-100 text-green-800 border border-green-200 cursor-default'
                    : 'bg-green-4 text-green-38 border border-green-6 hover:bg-green-6'
                }
              `}
              title={isAdded ? 'Added to library' : 'Add to library'}
            >
              {isAdded ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {isAdded ? 'Added' : 'Add'}
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base font-medium text-anara-light-text mb-2 line-clamp-2 leading-snug">
          {paper.title}
        </h3>

        {/* Authors */}
        {authors.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-green-28 mb-2">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="line-clamp-1">
              {authors.join(', ')}
              {hasMoreAuthors && ` +${paper.authors!.length - 3} more`}
            </span>
          </div>
        )}

        {/* Abstract */}
        {paper.abstract && (
          <p className="text-sm text-green-34 line-clamp-3 leading-relaxed mb-3">
            {paper.abstract}
          </p>
        )}

        {/* Footer with metadata */}
        <div className="flex items-center justify-between pt-2 border-t border-green-6">
          <div className="flex items-center gap-3 text-xs text-green-28">
            {paper.citation_count !== undefined && paper.citation_count !== null && (
              <span className="flex items-center gap-1">
                <Quote className="w-3 h-3" />
                {paper.citation_count.toLocaleString()} citations
              </span>
            )}
            {paper.doi && (
              <span className="font-mono text-[10px] text-green-28">
                DOI: {paper.doi}
              </span>
            )}
          </div>
          {showCitationButton && onExploreCitations && (
            <button
              onClick={() => onExploreCitations(paper)}
              className="flex items-center gap-1 text-xs text-green-28 hover:text-green-38 transition-colors"
            >
              <GitBranch className="w-3 h-3" />
              Citations
            </button>
          )}
        </div>
      </div>

      {/* Add to Library Dialog */}
      <AddToLibraryDialog
        paper={paper}
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
