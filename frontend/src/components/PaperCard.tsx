import type { Paper } from '@/lib/api/papers';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { ReadingStatusBadge } from './ReadingStatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { Button } from './Button';

interface PaperCardProps {
  paper: Paper;
  onDelete?: (paperId: number) => void;
}

export function PaperCard({ paper, onDelete }: PaperCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="bg-grayscale-8 border border-blue-21 rounded-md p-6 sm:p-8 hover:bg-blue-14 cursor-pointer h-full flex flex-col relative group"
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <h3 className="text-lg sm:text-xl font-medium line-clamp-2 break-words text-anara-light-text flex-1">{paper.title}</h3>
        <div className="flex gap-1 flex-shrink-0">
          {paper.reading_status && <ReadingStatusBadge status={paper.reading_status} />}
          {paper.priority && paper.priority !== 'low' && <PriorityBadge priority={paper.priority} />}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(paper.id);
              }}
              title="Delete paper"
            >
              <Trash2 size={14} />
            </Button>
          )}
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
    </motion.div>
  );
}
