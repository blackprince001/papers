import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2, Plus } from 'lucide-react';
import { Button } from './Button';
import { searchApi, type SavedSearch } from '@/lib/api/search';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface SavedSearchesPanelProps {
  onLoadSearch: (search: SavedSearch) => void;
  currentQuery: string;
  currentFilters: any;
}

export function SavedSearchesPanel({ onLoadSearch, currentQuery, currentFilters }: SavedSearchesPanelProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: savedSearches, isLoading, isError, error } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => searchApi.listSavedSearches(),
  });

  const createMutation = useMutation({
    mutationFn: (search: { name: string; description?: string; query_params: any }) =>
      searchApi.createSavedSearch(search),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] });
      setDialogOpen(false);
      setName('');
      setDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => searchApi.deleteSavedSearch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] });
    },
  });

  const handleSave = () => {
    createMutation.mutate({
      name,
      description,
      query_params: {
        query: currentQuery,
        ...currentFilters,
      },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bookmark className="h-4 w-4" />
          Saved Searches
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Search</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My saved search"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description..."
                />
              </div>
              {createMutation.isError && (
                <div className="text-xs text-red-600 p-2 bg-red-50 rounded border border-red-200">
                  Error: {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to save'}
                </div>
              )}
              <Button onClick={handleSave} disabled={!name || createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-600">Loading...</div>
      ) : isError ? (
        <div className="text-sm text-red-600">
          Error loading saved searches: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : savedSearches && savedSearches.length > 0 ? (
        <div className="space-y-1">
          {savedSearches.map((search) => (
            <div
              key={search.id}
              className="flex items-center justify-between p-2 hover:bg-gray-100 rounded border border-gray-200"
            >
              <button
                onClick={() => onLoadSearch(search)}
                className="flex-1 text-left text-sm"
              >
                <div className="font-medium">{search.name}</div>
                {search.description && (
                  <div className="text-xs text-gray-500">{search.description}</div>
                )}
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(search.id)}
                className="ml-2"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-600">No saved searches</div>
      )}
    </div>
  );
}

