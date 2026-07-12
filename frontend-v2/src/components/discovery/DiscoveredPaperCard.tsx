import { useState } from 'react';
import { BookmarkPlusIcon, CheckIcon, ExternalLinkIcon } from '@/components/icons';
import type { DiscoveredPaperPreview } from '@/lib/api/discovery';
import { AddToLibraryDialog } from './AddToLibraryDialog';
import { PaperCoverPlaceholder } from '@/components/ui/PaperCoverPlaceholder';
import { cn } from '@/lib/utils';
import { getPaperTheme } from '@/lib/paper-themes';

interface DiscoveredPaperCardProps {
  paper: DiscoveredPaperPreview;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  index?: number;
}

export function DiscoveredPaperCard({
  paper,
  showCheckbox = false,
  isSelected = false,
  onToggleSelect,
  index: _index = 0,
}: DiscoveredPaperCardProps) {
  const [showDialog, setShowDialog] = useState(false);

  const titleHash = paper.title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const theme = getPaperTheme(titleHash);

  const handleClick = showCheckbox && onToggleSelect ? onToggleSelect : undefined;

  return (
    <>
      <div
        className={cn(
          'group relative h-full rounded-2xl border overflow-hidden paper-card-hover flex flex-col',
          isSelected && 'ring-2 ring-(--foreground)',
          showCheckbox && 'cursor-pointer',
        )}
        style={{ backgroundColor: theme.bg, borderColor: isSelected ? undefined : theme.border, '--card-action': theme.action } as React.CSSProperties}
        onClick={handleClick}
      >
        {/* Header: checkbox + source badge + year + actions */}
        <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
          <div className="flex items-center gap-2">
            {showCheckbox && (
              <div className={cn(
                'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0',
                isSelected
                  ? 'bg-(--foreground) border-(--foreground)'
                  : 'bg-transparent border-(--mid-gray)',
              )}>
                {isSelected && (
                  <CheckIcon size="xs" strokeWidth={3} className="w-2.5 h-2.5 text-(--background)" />
                )}
              </div>
            )}
            <span
              className="px-2 py-0.5 rounded text-micro font-bold uppercase tracking-wider"
              style={{ backgroundColor: theme.accent, color: theme.text }}
            >
              {paper.source}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {paper.year && (
              <span className="text-caption font-semibold opacity-60" style={{ color: theme.text }}>
                {paper.year}
              </span>
            )}
            <a
              href={paper.url || paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn('p-1.5 rounded-lg transition-all opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/10')}
              style={{ color: theme.text }}
              title="Open original"
            >
              <ExternalLinkIcon size="sm" />
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDialog(true); }}
              className="p-1.5 rounded-lg transition-all opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/10"
              style={{ color: theme.text }}
              title="Add to library"
            >
              <BookmarkPlusIcon size="sm" />
            </button>
          </div>
        </div>

        {/* Inset content area: cover left, details right */}
        <div
          className="rounded-t-xl border-t px-4 pt-3.5 pb-4 flex-1 flex gap-3.5"
          style={{ backgroundColor: theme.accent, borderColor: theme.border }}
        >
          {/* Cover thumbnail placeholder */}
          <div
            className="w-20 shrink-0 self-start aspect-[0.7727] rounded-lg overflow-hidden border shadow-xs"
            style={{ borderColor: theme.border, backgroundColor: theme.bg }}
          >
            <PaperCoverPlaceholder theme={theme.name} />
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <h3 className="text-body font-semibold leading-snug line-clamp-2 mb-1" style={{ color: theme.text }}>
              {paper.title}
            </h3>

            {paper.authors && paper.authors.length > 0 && (
              <p className="text-caption mb-2 opacity-75 line-clamp-1" style={{ color: theme.text }}>
                {paper.authors.slice(0, 3).join(', ')}
                {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
              </p>
            )}

            {paper.abstract && (
              <p className="text-code leading-relaxed line-clamp-2 mb-3 opacity-70" style={{ color: theme.text }}>
                {paper.abstract}
              </p>
            )}

            <div className="flex items-center gap-3 text-caption opacity-60" style={{ color: theme.text }}>
              {paper.citation_count !== undefined && <span>{paper.citation_count} citations</span>}
              {paper.relevance_score !== undefined && (
                <span className="font-semibold opacity-100">
                  {/* Sources disagree on scale: some send 0–1, OpenAlex sends
                      unbounded scores — normalize and cap so it reads as a
                      sane percentage either way. */}
                  {Math.min(
                    100,
                    Math.round(
                      paper.relevance_score <= 1 ? paper.relevance_score * 100 : paper.relevance_score,
                    ),
                  )}
                  % relevant
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDialog && (
        <AddToLibraryDialog paper={paper} onClose={() => setShowDialog(false)} />
      )}
    </>
  );
}
