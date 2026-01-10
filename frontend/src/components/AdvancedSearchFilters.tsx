import { useState } from 'react';
import { X, Filter } from 'lucide-react';
import { Button } from './Button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import type { SearchRequest } from '@/lib/api/search';

interface AdvancedSearchFiltersProps {
  filters: Partial<SearchRequest>;
  onChange: (filters: Partial<SearchRequest>) => void;
  onClear: () => void;
}

export function AdvancedSearchFilters({ filters, onChange, onClear }: AdvancedSearchFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = Boolean(
    filters.date_from || filters.date_to || filters.authors?.length ||
    filters.journal || filters.tag_ids?.length || filters.reading_status ||
    filters.priority || filters.group_ids?.length || filters.has_annotations !== undefined ||
    filters.has_notes !== undefined || filters.reading_time_min !== undefined ||
    filters.reading_time_max !== undefined
  );

  const updateFilter = (key: keyof SearchRequest, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  if (!isOpen && !hasActiveFilters) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2"
      >
        <Filter className="h-4 w-4" />
        Filters
      </Button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Advanced Filters
        </h3>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear All
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Label>Date From</Label>
          <Input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => updateFilter('date_from', e.target.value || undefined)}
          />
        </div>

        <div>
          <Label>Date To</Label>
          <Input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => updateFilter('date_to', e.target.value || undefined)}
          />
        </div>

        <div>
          <Label>Journal</Label>
          <Input
            value={filters.journal || ''}
            onChange={(e) => updateFilter('journal', e.target.value || undefined)}
            placeholder="Filter by journal..."
          />
        </div>

        <div>
          <Label>Reading Status</Label>
          <Select
            value={filters.reading_status || ''}
            onValueChange={(value: string | null) => updateFilter('reading_status', value || undefined)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Priority</Label>
          <Select
            value={filters.priority || ''}
            onValueChange={(value: string | null) => updateFilter('priority', value || undefined)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Has Annotations</Label>
          <Select
            value={filters.has_annotations === undefined ? '' : filters.has_annotations.toString()}
            onValueChange={(value: string | null) => updateFilter('has_annotations', !value || value === '' ? undefined : value === 'true')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Has Notes</Label>
          <Select
            value={filters.has_notes === undefined ? '' : filters.has_notes.toString()}
            onValueChange={(value: string | null) => updateFilter('has_notes', !value || value === '' ? undefined : value === 'true')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Reading Time (min)</Label>
          <Input
            type="number"
            value={filters.reading_time_min || ''}
            onChange={(e) => updateFilter('reading_time_min', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Minimum minutes"
          />
        </div>

        <div>
          <Label>Reading Time (max)</Label>
          <Input
            type="number"
            value={filters.reading_time_max || ''}
            onChange={(e) => updateFilter('reading_time_max', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Maximum minutes"
          />
        </div>
      </div>
    </div>
  );
}

