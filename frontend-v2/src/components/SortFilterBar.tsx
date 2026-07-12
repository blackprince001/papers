import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloseIcon, FilterIcon } from '@/components/icons';
import { groupsApi } from '@/lib/api/groups';
import { tagsApi } from '@/lib/api/tags';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover';
import { FilterChip } from '@/components/FilterChip';
import type { PaperListFilters } from '@/lib/api/papers';

interface SortFilterBarProps {
  filters: PaperListFilters;
  onFiltersChange: (f: PaperListFilters) => void;
  onReset: () => void;
}

const SORT_OPTIONS: { value: NonNullable<PaperListFilters['sort_by']>; label: string }[] = [
  { value: 'date_added', label: 'Date Added' },
  { value: 'viewed', label: 'Most Viewed' },
  { value: 'title', label: 'Title' },
  { value: 'authors', label: 'Authors' },
  { value: 'last_read_at', label: 'Last Read' },
];

// Only the filter fields — sort lives in the parent's filters directly
interface LocalFilterState {
  group_id?: number;
  tag_id?: number;
  has_file?: boolean;
  date_from?: string;
  date_to?: string;
}

function toLocal(f: PaperListFilters): LocalFilterState {
  return { group_id: f.group_id, tag_id: f.tag_id, has_file: f.has_file, date_from: f.date_from, date_to: f.date_to };
}

export function SortFilterBar({ filters, onFiltersChange, onReset }: SortFilterBarProps) {
  const [local, setLocal] = useState<LocalFilterState>(toLocal(filters));

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const { data: tagsData } = useQuery({ queryKey: ['tags'], queryFn: () => tagsApi.list(1, 100) });
  const tags = tagsData?.tags ?? [];

  // Sync local state when filters change externally (e.g., from chips)
  useEffect(() => {
    setLocal(toLocal(filters));
  }, [filters.group_id, filters.tag_id, filters.has_file, filters.date_from, filters.date_to]);

  const hasActive = filters.group_id !== undefined || filters.tag_id !== undefined
    || filters.has_file !== undefined || filters.date_from || filters.date_to;

  // Merge local filter fields onto the current sort settings so Apply never resets sort
  const apply = () => onFiltersChange({ ...filters, ...local });
  const reset = () => {
    const cleared: LocalFilterState = {};
    setLocal(cleared);
    onFiltersChange({ sort_by: filters.sort_by, sort_order: filters.sort_order });
    onReset();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Sort - styled as button-like select */}
      <div className="flex items-center gap-1.5">
        <span className="text-caption text-(--muted-foreground) font-medium">Sort:</span>
        <Select
          value={filters.sort_by ?? 'date_added'}
          onChange={(e) => onFiltersChange({ ...filters, sort_by: e.target.value as PaperListFilters['sort_by'] })}
          className="w-auto min-w-30 h-8 text-code bg-(--card)"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select
          value={filters.sort_order ?? 'desc'}
          onChange={(e) => onFiltersChange({ ...filters, sort_order: e.target.value as 'asc' | 'desc' })}
          className="w-auto min-w-22.5 h-8 text-code bg-(--card)"
        >
          <option value="desc">Newest</option>
          <option value="asc">Oldest</option>
        </Select>
      </div>

      {/* Filter popover */}
      <Popover>
        <PopoverTrigger className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-(--border) text-caption font-medium transition-colors ${hasActive ? 'bg-(--muted) text-(--foreground)' : 'bg-(--card) text-(--muted-foreground) hover:bg-(--muted)'}`}>
          <FilterIcon size="xs" />
          Filters
          {hasActive && <span className="w-1.5 h-1.5 rounded-full bg-(--foreground)" />}
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-72 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-code font-semibold">Filters</p>
            {hasActive && (
              <button onClick={reset} className="text-caption text-(--muted-foreground) hover:text-(--foreground)">
                Clear all
              </button>
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-caption text-(--muted-foreground)">Group</span>
            <Select
              value={local.group_id?.toString() ?? ''}
              onChange={(e) => setLocal({ ...local, group_id: e.target.value ? parseInt(e.target.value) : undefined })}
              className="h-8 text-caption"
            >
              <option value="">All groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-caption text-(--muted-foreground)">Tag</span>
            <Select
              value={local.tag_id?.toString() ?? ''}
              onChange={(e) => setLocal({ ...local, tag_id: e.target.value ? parseInt(e.target.value) : undefined })}
              className="h-8 text-caption"
            >
              <option value="">All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-caption text-(--muted-foreground)">File status</span>
            <Select
              value={local.has_file === undefined ? '' : local.has_file ? 'yes' : 'no'}
              onChange={(e) => setLocal({ ...local, has_file: e.target.value === '' ? undefined : e.target.value === 'yes' })}
              className="h-8 text-caption"
            >
              <option value="">All papers</option>
              <option value="yes">Has file</option>
              <option value="no">No file</option>
            </Select>
          </label>

          <div className="space-y-1">
            <span className="text-caption text-(--muted-foreground)">Date range</span>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={local.date_from ?? ''} onChange={(e) => setLocal({ ...local, date_from: e.target.value || undefined })} className="h-8 text-caption" />
              <Input type="date" value={local.date_to ?? ''} onChange={(e) => setLocal({ ...local, date_to: e.target.value || undefined })} className="h-8 text-caption" />
            </div>
          </div>

          <div className="flex gap-2 pt-1 border-t border-(--border)">
            <Button variant="ghost" size="sm" onClick={reset} className="flex-1">Reset</Button>
            <Button variant="primary" size="sm" onClick={apply} className="flex-1">Apply</Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter chips */}
      {hasActive && (
        <div className="flex flex-wrap gap-1.5">
          {filters.group_id !== undefined && (
            <FilterChip
              label="Group"
              value={groups.find((g) => g.id === filters.group_id)?.name ?? 'Unknown'}
              onRemove={() => onFiltersChange({ ...filters, group_id: undefined })}
            />
          )}
          {filters.tag_id !== undefined && (
            <FilterChip
              label="Tag"
              value={tags.find((t) => t.id === filters.tag_id)?.name ?? 'Unknown'}
              onRemove={() => onFiltersChange({ ...filters, tag_id: undefined })}
            />
          )}
          {filters.has_file !== undefined && (
            <FilterChip
              label="File"
              value={filters.has_file ? 'Has file' : 'No file'}
              onRemove={() => onFiltersChange({ ...filters, has_file: undefined })}
            />
          )}
          {(filters.date_from || filters.date_to) && (
            <FilterChip
              label="Date"
              value={`${filters.date_from ?? '…'} – ${filters.date_to ?? '…'}`}
              onRemove={() => onFiltersChange({ ...filters, date_from: undefined, date_to: undefined })}
            />
          )}
          <button onClick={reset} className="inline-flex items-center gap-1 text-caption text-(--muted-foreground) hover:text-(--foreground) transition-colors">
            <CloseIcon size="xs" /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
