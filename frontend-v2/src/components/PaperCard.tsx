import { Link, useNavigate } from 'react-router-dom';
import { Trash as Trash2, People, Message as MessageSquare } from 'iconsax-reactjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { getPaperTheme } from '@/lib/paper-themes';
import { paperAuthors, paperYear } from '@/lib/paper-display';
import { usePaperThumbnail } from '@/hooks/use-paper-thumbnail';
import { PaperCoverPlaceholder } from '@/components/ui/PaperCoverPlaceholder';
import { ReadingStatusBadge } from '@/components/ReadingStatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ProcessingStatusBadge } from '@/components/ProcessingStatusBadge';
import type { Paper } from '@/lib/api/papers';

// Block elements (paragraphs, headings, lists...) and links are unwrapped to
// their plain inline text — the card only has room for a 2-line clamp, and a
// nested <a> would break out of the card's own <Link>. Only inline emphasis
// (bold/italic/code) survives as real markup.
const SUMMARY_BLOCK_ELEMENTS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img',
];

function SummaryPreview({ text }: { text: string }) {
  // Only the first paragraph is worth parsing — the rest is clipped by the
  // line-clamp anyway, and rendering it would run paragraph breaks together.
  const firstParagraph = text.split(/\n\s*\n/)[0];
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={SUMMARY_BLOCK_ELEMENTS}
      unwrapDisallowed
    >
      {firstParagraph}
    </ReactMarkdown>
  );
}

interface PaperCardProps {
  paper: Paper;
  onDelete?: (id: number) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: (id: number) => void;
  /** Index is no longer used (no stagger animation) — kept for API compatibility */
  index?: number;
}

export function PaperCard({
  paper,
  onDelete,
  selectionMode = false,
  selected = false,
  onSelect,
}: PaperCardProps) {
  const navigate = useNavigate();
  const theme = getPaperTheme(paper.id);
  const isShared = paper.is_shared === true;
  const coverUrl = usePaperThumbnail(paper);

  const authorText = paperAuthors(paper);
  const publicationYear = paperYear(paper);

  const handleClick = selectionMode && onSelect
    ? () => onSelect(paper.id)
    : undefined;

  const cardInner = (
    <div
      className={cn(
        'group relative h-full rounded-2xl border overflow-hidden paper-card-hover flex flex-col',
        selected && 'ring-2 ring-(--foreground)',
        selectionMode && 'cursor-pointer',
      )}
      style={{ backgroundColor: theme.bg, borderColor: selected ? undefined : theme.border, '--card-action': theme.action } as React.CSSProperties}
      onClick={handleClick}
    >
      {/* ── Header: status badges + year + actions ── */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Selection checkbox */}
          {selectionMode && (
            <div className={cn(
              'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0',
              selected
                ? 'bg-(--foreground) border-(--foreground)'
                : 'bg-transparent border-(--mid-gray)',
            )}>
              {selected && (
                <svg className="w-2.5 h-2.5 text-(--background)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          )}

          {/* Processing badge (only when not completed) */}
          {paper.processing_status && paper.processing_status !== 'completed' && (
            <ProcessingStatusBadge status={paper.processing_status} paperId={paper.id} />
          )}

          {/* Reading status */}
          {paper.reading_status && (
            <ReadingStatusBadge status={paper.reading_status} />
          )}

          {/* Shared indicator */}
          {isShared && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-medium bg-(--sky-blue)/10 text-(--sky-blue)">
              <People size={10} />
              Shared
            </span>
          )}

          {/* Priority (only medium and above) */}
          {paper.priority && paper.priority !== 'low' && (
            <PriorityBadge priority={paper.priority} />
          )}
        </div>

        {/* Year + delete icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {publicationYear && (
            <span className="text-caption font-semibold opacity-60" style={{ color: theme.text }}>
              {publicationYear}
            </span>
          )}
          {!selectionMode && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/papers/${paper.id}/chat`); }}
              aria-label="Chat with paper"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-black/10"
              style={{ color: theme.text }}
            >
              <MessageSquare size={12} />
            </button>
          )}
          {!selectionMode && onDelete && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(paper.id); }}
              aria-label="Delete paper"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-black/10"
              style={{ color: theme.text }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Inset content area: cover left, details right ── */}
      <div
        className="rounded-t-xl border-t px-4 pt-3.5 pb-4 flex-1 flex gap-3.5"
        style={{ backgroundColor: theme.accent, borderColor: theme.border }}
      >
        {/* Cover thumbnail */}
        <div
          className="w-20 shrink-0 self-start aspect-[0.7727] rounded-lg overflow-hidden border shadow-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.bg }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="size-full object-cover dark:invert"
              draggable={false}
            />
          ) : (
            <PaperCoverPlaceholder theme={theme.name} />
          )}
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1 flex flex-col">
          {/* Title */}
          <h4 className="text-body font-semibold leading-snug line-clamp-2 mb-1" style={{ color: theme.text }}>
            {paper.title}
          </h4>

          {/* Authors */}
          {authorText && (
            <p className="text-caption truncate opacity-70 mb-2" style={{ color: theme.text }}>
              {authorText}
            </p>
          )}

          {/* AI-generated abstract preview */}
          {paper.ai_summary && (
            <p className="text-caption line-clamp-2 leading-relaxed opacity-80 mb-3" style={{ color: theme.text }}>
              <SummaryPreview text={paper.ai_summary} />
            </p>
          )}

          {/* Tags */}
          {paper.tags && paper.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-auto">
              {paper.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag.id}
                  className="px-1.5 py-0.5 rounded text-micro font-semibold"
                  style={{ backgroundColor: theme.bg, color: theme.text }}
                >
                  {tag.name}
                </span>
              ))}
              {paper.tags.length > 4 && (
                <span className="text-micro opacity-50" style={{ color: theme.text }}>
                  +{paper.tags.length - 4}
                </span>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );

  if (selectionMode) return cardInner;

  return (
    <Link to={`/papers/${paper.id}`} className="block h-full">
      {cardInner}
    </Link>
  );
}
