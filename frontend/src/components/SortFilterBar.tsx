import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/Button';
import { X, Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PaperListFilters } from '@/lib/api/papers';
import { groupsApi } from '@/lib/api/groups';
import { tagsApi } from '@/lib/api/tags';
import { useQuery } from '@tanstack/react-query';

interface SortFilterBarProps {
  filters: PaperListFilters;
  onFiltersChange: (filters: PaperListFilters) => void;
  onReset: () => void;
}

export function SortFilterBar({ filters, onFiltersChange, onReset }: SortFilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<PaperListFilters>(filters);

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const result = await tagsApi.list(1, 100);
      return result;
    },
  });

  const hasActiveFilters = 
    filters.group_id !== undefined ||
    filters.tag_id !== undefined ||
    filters.has_file !== undefined ||
    filters.date_from ||
    filters.date_to;

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleReset = () => {
    const resetFilters: PaperListFilters = {
      sort_by: 'date_added',
      sort_order: 'desc',
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
    onReset();
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Sort By */}
      <Select
        value={filters.sort_by || 'date_added'}
        onValueChange={(value: string | null) => {
          if (value && ['date_added', 'viewed', 'title', 'authors'].includes(value)) {
            onFiltersChange({ ...filters, sort_by: value as 'date_added' | 'viewed' | 'title' | 'authors' });
          }
        }}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date_added">Date Added</SelectItem>
          <SelectItem value="viewed">Most Viewed</SelectItem>
          <SelectItem value="title">Title</SelectItem>
          <SelectItem value="authors">Authors</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort Order */}
      <Select
        value={filters.sort_order || 'desc'}
        onValueChange={(value: string | null) => {
          if (value && (value === 'asc' || value === 'desc')) {
            onFiltersChange({ ...filters, sort_order: value as 'asc' | 'desc' });
          }
        }}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Order" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="asc">Ascending</SelectItem>
          <SelectItem value="desc">Descending</SelectItem>
        </SelectContent>
      </Select>

      {/* Filter Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 text-xs ${hasActiveFilters ? 'bg-gray-100' : ''}`}
          >
            <Filter className="w-3 h-3 mr-1" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 w-2 h-2 bg-gray-900 rounded-full" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Filters</h3>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-6 text-xs text-gray-600"
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Group Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Group</Label>
              <Select
                value={localFilters.group_id?.toString() || ''}
                onValueChange={(value) => {
                  setLocalFilters({
                    ...localFilters,
                    group_id: value ? parseInt(value) : undefined,
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All groups</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tag Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Tag</Label>
              <Select
                value={localFilters.tag_id?.toString() || ''}
                onValueChange={(value) => {
                  setLocalFilters({
                    ...localFilters,
                    tag_id: value ? parseInt(value) : undefined,
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All tags</SelectItem>
                  {tagsData?.tags.map((tag: { id: number; name: string }) => (
                    <SelectItem key={tag.id} value={tag.id.toString()}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Has File Filter */}
            <div className="space-y-2">
              <Label className="text-xs">File Status</Label>
              <Select
                value={
                  localFilters.has_file === undefined
                    ? ''
                    : localFilters.has_file
                      ? 'yes'
                      : 'no'
                }
                onValueChange={(value) => {
                  setLocalFilters({
                    ...localFilters,
                    has_file: value === '' ? undefined : value === 'yes',
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All papers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All papers</SelectItem>
                  <SelectItem value="yes">Has file</SelectItem>
                  <SelectItem value="no">No file</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label className="text-xs">Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-500">From</Label>
                  <Input
                    type="date"
                    value={localFilters.date_from || ''}
                    onChange={(e) => {
                      setLocalFilters({
                        ...localFilters,
                        date_from: e.target.value || undefined,
                      });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">To</Label>
                  <Input
                    type="date"
                    value={localFilters.date_to || ''}
                    onChange={(e) => {
                      setLocalFilters({
                        ...localFilters,
                        date_to: e.target.value || undefined,
                      });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                className="h-8 text-xs"
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex items-center gap-1 flex-wrap">
          {filters.group_id !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-sm text-xs">
              <span>
                Group: {groups.find((g) => g.id === filters.group_id)?.name || 'Unknown'}
              </span>
              <button
                onClick={() => {
                  onFiltersChange({ ...filters, group_id: undefined });
                }}
                className="ml-1 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {filters.tag_id !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-sm text-xs">
              <span>
                Tag: {tagsData?.tags?.find((t: { id: number; name: string }) => t.id === filters.tag_id)?.name || 'Unknown'}
              </span>
              <button
                onClick={() => {
                  onFiltersChange({ ...filters, tag_id: undefined });
                }}
                className="ml-1 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {filters.has_file !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-sm text-xs">
              <span>{filters.has_file ? 'Has file' : 'No file'}</span>
              <button
                onClick={() => {
                  onFiltersChange({ ...filters, has_file: undefined });
                }}
                className="ml-1 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {(filters.date_from || filters.date_to) && (
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-sm text-xs">
              <span>
                {filters.date_from || '...'} - {filters.date_to || '...'}
              </span>
              <button
                onClick={() => {
                  onFiltersChange({
                    ...filters,
                    date_from: undefined,
                    date_to: undefined,
                  });
                }}
                className="ml-1 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

