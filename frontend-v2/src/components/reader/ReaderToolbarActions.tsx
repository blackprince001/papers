import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkIcon, ChatIcon, ShareIcon } from '@/components/icons';
import { papersApi, type Paper } from '@/lib/api/papers';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { canAnnotate, isOwner } from '@/lib/utils/permissions';
import { toastError, toastSuccess } from '@/lib/utils/toast';
import { ShareDialog } from '@/components/ShareDialog';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

/** Reading status / priority / bookmark / share toolbar cluster. */
export function ReaderToolbarActions({
  paper,
  currentPage,
  onPaperChanged,
}: {
  paper: Paper;
  currentPage: number;
  onPaperChanged: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);

  const handleStatus = async (status: string) => {
    try {
      await papersApi.updateReadingStatus(paper.id, status as Paper['reading_status'] & string);
      onPaperChanged();
    } catch {
      toastError('Failed to update reading status');
    }
  };

  const handlePriority = async (priority: string) => {
    try {
      await papersApi.updatePriority(paper.id, priority as Paper['priority'] & string);
      onPaperChanged();
    } catch {
      toastError('Failed to update priority');
    }
  };

  const handleBookmark = async () => {
    if (!canAnnotate(paper)) return;
    try {
      await papersApi.createBookmark(paper.id, currentPage);
      toastSuccess(`Bookmarked page ${currentPage}`);
      onPaperChanged();
    } catch {
      toastError('Failed to add bookmark');
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={paper.reading_status ?? 'not_started'}
        onChange={(event) => void handleStatus(event.target.value)}
        className="h-7 w-28 text-caption"
        aria-label="Reading status"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select
        value={paper.priority ?? 'low'}
        onChange={(event) => void handlePriority(event.target.value)}
        className="h-7 w-24 text-caption"
        aria-label="Priority"
      >
        {PRIORITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Tooltip content="Open full chat view" side="bottom">
        <Link
          to={`/papers/${paper.id}/chat`}
          aria-label="Open full chat view"
          className="flex size-7 items-center justify-center rounded-lg text-(--muted-foreground) transition-colors hover:bg-(--secondary) hover:text-(--foreground)"
        >
          <ChatIcon size="sm" />
        </Link>
      </Tooltip>
      {canAnnotate(paper) && (
        <Tooltip content={`Bookmark page ${currentPage}`} side="bottom">
          <button
            type="button"
            onClick={() => void handleBookmark()}
            aria-label="Bookmark current page"
            className="flex size-7 items-center justify-center rounded-lg text-(--muted-foreground) transition-colors hover:bg-(--secondary) hover:text-(--foreground)"
          >
            <BookmarkIcon size="sm" />
          </button>
        </Tooltip>
      )}
      {isOwner(paper) && (
        <Tooltip content="Share paper" side="bottom">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Share paper"
            className="flex size-7 items-center justify-center rounded-lg text-(--muted-foreground) transition-colors hover:bg-(--secondary) hover:text-(--foreground)"
          >
            <ShareIcon size="sm" />
          </button>
        </Tooltip>
      )}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceId={paper.id}
        resourceType="paper"
        resourceTitle={paper.title}
      />
    </div>
  );
}
