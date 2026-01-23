import { type Paper } from '@/lib/api/papers';
import { type UseMutationResult, type QueryClient } from '@tanstack/react-query';
import { ReadingStatusBadge } from '@/components/ReadingStatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ProcessingStatusBadge } from '@/components/ProcessingStatusBadge';
import { ReadingProgressBar } from '@/components/ReadingProgressBar';
import { BookmarkList } from '@/components/BookmarkList';
import { BookmarkButton } from '@/components/BookmarkButton';
import { AlertCircle, CheckCircle2, Loader2, Clock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PaperProgressPanelProps {
  paper: Paper;
  paperId: number;
  currentPage: number;
  updateReadingStatusMutation: UseMutationResult<any, Error, 'not_started' | 'in_progress' | 'read' | 'archived', unknown>;
  updatePriorityMutation: UseMutationResult<any, Error, 'low' | 'medium' | 'high' | 'critical', unknown>;
  queryClient: QueryClient;
}

export function PaperProgressPanel({
  paper,
  paperId,
  currentPage,
  updateReadingStatusMutation,
  updatePriorityMutation,
  queryClient,
}: PaperProgressPanelProps) {
  const getProcessingIcon = (status: string | undefined) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* AI Processing Status */}
      {paper?.processing_status && (
        <div>
          <h3 className="text-sm font-semibold text-anara-light-text mb-4">AI Processing</h3>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50">
            {getProcessingIcon(paper.processing_status)}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {paper.processing_status === 'completed' ? 'Complete' : paper.processing_status}
                </span>
                {paper.processing_status !== 'completed' && (
                  <ProcessingStatusBadge status={paper.processing_status} />
                )}
              </div>
              {paper.processing_error && (
                <p className="text-xs text-red-600 mt-1">{paper.processing_error}</p>
              )}
              {paper.processing_status === 'processing' && (
                <p className="text-xs text-gray-500 mt-1">Generating summaries, findings, and reading guide...</p>
              )}
              {paper.processing_status === 'pending' && (
                <p className="text-xs text-gray-500 mt-1">Waiting for AI processing to start...</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-anara-light-text mb-4">Reading Status</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Status</label>
            <Select
              value={paper?.reading_status || 'not_started'}
              onValueChange={(value: 'not_started' | 'in_progress' | 'read' | 'archived' | null) => {
                if (value)
                {
                  updateReadingStatusMutation.mutate(value);
                }
              }}
              disabled={updateReadingStatusMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            {paper?.reading_status && (
              <div className="mt-2">
                <ReadingStatusBadge status={paper.reading_status} />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Priority</label>
            <Select
              value={paper?.priority || 'low'}
              onValueChange={(value: 'low' | 'medium' | 'high' | 'critical' | null) => {
                if (value)
                {
                  updatePriorityMutation.mutate(value);
                }
              }}
              disabled={updatePriorityMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            {paper?.priority && (
              <div className="mt-2">
                <PriorityBadge priority={paper.priority} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-anara-light-text mb-4">Reading Progress</h3>
        <ReadingProgressBar
          currentPage={paper?.last_read_page}
          readingTimeMinutes={paper?.reading_time_minutes}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-anara-light-text">Bookmarks</h3>
          <BookmarkButton
            paperId={paperId}
            currentPage={currentPage}
            onBookmarkCreated={() => queryClient.invalidateQueries({ queryKey: ['bookmarks', paperId] })}
          />
        </div>
        <BookmarkList paperId={paperId} />
      </div>
    </div>
  );
}

