import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { papersApi, type Bookmark } from '@/lib/api/papers';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { BookmarkIcon, NoteIcon, TrashIcon } from '@/components/icons';
import { LibraryIllustration } from '@/components/illustrations';
import { format } from 'date-fns';

interface BookmarksTabProps {
  paperId: number;
  onJumpToPage?: (page: number) => void;
}

export function BookmarksTab({ paperId, onJumpToPage }: BookmarksTabProps) {
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState('');

  const { data: bookmarks = [], isLoading } = useQuery({
    queryKey: ['bookmarks', paperId],
    queryFn: () => papersApi.listBookmarks(paperId),
  });

  const deleteMutation = useMutation({
    mutationFn: (bookmarkId: number) => papersApi.deleteBookmark(paperId, bookmarkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', paperId] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      papersApi.updateBookmark(id, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks', paperId] });
      setEditingId(null);
      setEditNote('');
    },
  });

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Delete Bookmark',
      description: 'Are you sure you want to delete this bookmark?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) deleteMutation.mutate(id);
  };

  const startEdit = (bookmark: Bookmark) => {
    setEditingId(bookmark.id);
    setEditNote(bookmark.note || '');
  };

  const saveEdit = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, note: editNote });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNote('');
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="w-full h-16" />
        <Skeleton className="w-full h-16" />
        <Skeleton className="w-full h-16" />
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          size="panel"
          illustration={LibraryIllustration}
          title="No bookmarks yet"
          description="Click the bookmark button in the PDF toolbar to save pages."
        />
      </div>
    );
  }

  return (
    <>
      <div className="p-6 space-y-3">
        {bookmarks.map(bookmark => (
          <div
            key={bookmark.id}
            className="bg-(--card) border border-(--border) rounded-lg p-3 hover:border-(--primary) transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => onJumpToPage?.(bookmark.page_number)}
                className="flex-1 text-left group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <BookmarkIcon size="sm" className="text-(--muted-foreground) group-hover:text-(--primary)" />
                  <span className="text-code font-medium text-(--foreground) group-hover:text-(--primary)">
                    Page {bookmark.page_number}
                  </span>
                </div>
                <p className="text-caption text-(--muted-foreground)">
                  {format(new Date(bookmark.created_at), 'MMM d, yyyy • h:mm a')}
                </p>
              </button>

              <div className="flex items-center gap-1">
                <Button
                  variant="icon"
                  size="icon-sm"
                  onClick={() => startEdit(bookmark)}
                  title="Add note"
                  aria-label="Add note"
                >
                  <NoteIcon size="sm" />
                </Button>
                <Button
                  variant="icon"
                  size="icon-sm"
                  className="text-(--destructive)"
                  onClick={() => handleDelete(bookmark.id)}
                  title="Delete"
                  aria-label="Delete"
                >
                  <TrashIcon size="sm" />
                </Button>
              </div>
            </div>

            {/* Note display/edit */}
            {editingId === bookmark.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Add a note to this bookmark..."
                  className="w-full px-2 py-1.5 text-caption bg-(--white) border border-(--border) rounded-lg focus:outline-none focus:border-(--primary) resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={saveEdit}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : bookmark.note ? (
              <div className="mt-2 p-2 bg-(--muted)/30 rounded-lg">
                <p className="text-caption text-(--foreground) whitespace-pre-wrap">{bookmark.note}</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <ConfirmDialog {...dialogProps} />
    </>
  );
}
