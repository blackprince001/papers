import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { papersApi } from '@/lib/api/papers';
import { Button } from './Button';
import { BookmarkPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BookmarkButtonProps {
  paperId: number;
  currentPage: number;
  onBookmarkCreated?: () => void;
}

export function BookmarkButton({ paperId, currentPage, onBookmarkCreated }: BookmarkButtonProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (pageNumber: number) =>
      papersApi.createBookmark(paperId, pageNumber, note || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks', paperId] });
      setNote('');
      setOpen(false);
      onBookmarkCreated?.();
    },
  });

  const handleCreate = () => {
    createMutation.mutate(currentPage);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2" title="Add Bookmark">
          <BookmarkPlus className="h-4 w-4 mr-1" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Bookmark</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Page Number</Label>
            <Input type="number" value={currentPage} disabled />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this page..."
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Bookmark'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

