import type { Paper } from '@/lib/api/papers';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { ReadingStatusBadge } from './ReadingStatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import { Button } from './Button';
import { useMemo } from 'react';

// Coursly-inspired card background and icon color combinations
const CARD_THEMES = [
  { bg: 'var(--card-bg-olive)', iconBg: 'var(--icon-brown)' },
  { bg: 'var(--card-bg-beige)', iconBg: 'var(--icon-yellow)' },
  { bg: 'var(--card-bg-blue)', iconBg: 'var(--icon-blue)' },
  { bg: 'var(--card-bg-yellow)', iconBg: 'var(--icon-yellow)' },
  { bg: 'var(--card-bg-pink)', iconBg: 'var(--icon-pink)' },
  { bg: 'var(--card-bg-green)', iconBg: 'var(--icon-olive)' },
  { bg: 'var(--card-bg-tan)', iconBg: 'var(--icon-brown)' },
];

interface PaperCardProps {
  paper: Paper;
  onDelete?: (paperId: number) => void;
  index?: number; // For staggered animations
}

export function PaperCard({ paper, onDelete, index = 0 }: PaperCardProps) {
  // Randomly assign a theme based on paper ID for consistency
  const theme = useMemo(() => {
    return CARD_THEMES[paper.id % CARD_THEMES.length];
  }, [paper.id]);

  // Determine badge content (Reading time -> Pages -> Default)
  const badgeContent = useMemo(() => {
    if (paper.reading_time_minutes)
    {
      return `${paper.reading_time_minutes} min read`;
    }
    if (paper.pages)
    {
      // Handle page ranges like "10-20" or single numbers "5"
      const pageCount = paper.pages.includes('-')
        ? (parseInt(paper.pages.split('-')[1]) - parseInt(paper.pages.split('-')[0]) + 1)
        : 1;
      return `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
    }
    return null;
  }, [paper.reading_time_minutes, paper.pages]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.15,
        ease: 'easeOut',
        delay: index * 0.05 // Staggered animation
      }}
      whileHover={{ scale: 1.02, y: -4 }}
      className="bg-grayscale-8 border border-green-6 rounded-lg overflow-hidden cursor-pointer h-full flex flex-col relative group transition-shadow duration-200"
    >
      {/* Colored Header/Thumbnail Area */}
      <div
        className="relative h-32 flex items-center justify-center p-4"
        style={{ backgroundColor: theme.bg }}
      >
        {/* Badge (Reading Time / Pages) */}
        {badgeContent && (
          <span className="absolute top-3 left-3 px-2.5 py-1 bg-white rounded-md text-xs font-medium text-green-38 shadow-sm">
            {badgeContent}
          </span>
        )}

        {/* Delete Button */}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 bg-white/80 hover:bg-red-100 hover:text-red-600 rounded-md shadow-sm"
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

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Tags/Badges Row */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {paper.processing_status && paper.processing_status !== 'completed' && (
            <ProcessingStatusBadge status={paper.processing_status} />
          )}
          {paper.reading_status && <ReadingStatusBadge status={paper.reading_status} />}
          {paper.priority && paper.priority !== 'low' && <PriorityBadge priority={paper.priority} />}
          {paper.doi && (
            <span className="px-2 py-0.5 bg-blue-4 rounded text-xs text-blue-48 font-medium">
              DOI
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold line-clamp-2 text-green-38 mb-2 leading-snug">
          {paper.title}
        </h3>

        {/* Description/Preview */}
        <p className="text-sm text-green-28 mb-4 flex-1 line-clamp-2">
          {paper.content_text ? (
            paper.content_text.substring(0, 150)
          ) : (
            'No content preview available'
          )}
        </p>

        {/* Meta Row */}
        <div className="flex justify-between items-center text-xs text-green-24 pt-2 border-t border-green-6">
          <span>{format(new Date(paper.created_at), 'MMM d, yyyy')}</span>
          {paper.url && (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-blue-43 hover:text-blue-51 transition-colors font-medium"
            >
              View Source →
            </a>
          )}
        </div>
      </div>
    </motion.article>
  );
}
