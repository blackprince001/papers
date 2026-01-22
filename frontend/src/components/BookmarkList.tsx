import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { papersApi } from '@/lib/api/papers';
import { Button } from './Button';
import { Trash2, Bookmark } from 'lucide-react';
import { format } from 'date-fns';

interface BookmarkListProps {
  paperId: number;
}

export function BookmarkList({ paperId }: BookmarkListProps) {
  const queryClient = useQueryClient();

  const { data: bookmarks, isLoading } = useQuery({
    queryKey: ['bookmarks', paperId],
    queryFn: () => papersApi.listBookmarks(paperId),
  });

  const deleteMutation = useMutation({
    mutationFn: (bookmarkId: number) => papersApi.deleteBookmark(paperId, bookmarkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks', paperId] });
    },
  });

  if (isLoading) {
    return <div className="text-sm text-gray-600">Loading bookmarks...</div>;
  }

  if (!bookmarks || bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Bookmark className="h-10 w-10 text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">No bookmarks yet</p>
        <p className="text-xs text-gray-400 mt-1">Click the bookmark icon on any page to save your place</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bookmarks.map((bookmark) => (
        <div
          key={bookmark.id}
          className="flex items-start justify-between p-3 bg-gray-50 rounded border border-gray-200"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">Page {bookmark.page_number}</span>
              <span className="text-xs text-gray-500">
                {format(new Date(bookmark.created_at), 'MMM d, yyyy')}
              </span>
            </div>
            {bookmark.note && (
              <p className="text-sm text-gray-700">{bookmark.note}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteMutation.mutate(bookmark.id)}
            className="ml-2"
            aria-label="Delete bookmark"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

