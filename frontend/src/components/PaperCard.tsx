import type { Paper } from '@/lib/api/papers';
import { format } from 'date-fns';
import { ReadingStatusBadge } from './ReadingStatusBadge';
import { PriorityBadge } from './PriorityBadge';

interface PaperCardProps {
  paper: Paper;
}

export function PaperCard({ paper }: PaperCardProps) {
  return (
    <div className="bg-grayscale-8 border border-green-6 rounded-sm p-4 sm:p-6 hover:bg-green-4 transition-all cursor-pointer h-full flex flex-col">
      <div className="flex justify-between items-start gap-2 mb-2">
        <h3 className="text-lg sm:text-xl font-semibold line-clamp-2 break-words text-anara-light-text flex-1">{paper.title}</h3>
        <div className="flex gap-1 flex-shrink-0">
          {paper.reading_status && <ReadingStatusBadge status={paper.reading_status} />}
          {paper.priority && paper.priority !== 'low' && <PriorityBadge priority={paper.priority} />}
        </div>
      </div>
      {paper.doi && (
        <p className="text-xs sm:text-sm text-anara-light-text-muted mb-2 break-all">DOI: {paper.doi}</p>
      )}
      <p className="text-xs sm:text-sm text-anara-light-text-muted mb-4 flex-1">
        {paper.content_text ? (
          <span className="line-clamp-3">{paper.content_text.substring(0, 200)}...</span>
        ) : (
          'No content available'
        )}
      </p>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 text-xs text-anara-light-text-muted">
        <span>{format(new Date(paper.created_at), 'MMM d, yyyy')}</span>
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:text-green-38 text-blue-43 whitespace-nowrap transition-colors"
          >
            View Source
          </a>
        )}
      </div>
    </div>
  );
}

