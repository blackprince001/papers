
import { CheckSquare } from 'lucide-react';
import { Button } from './Button';
import type { Paper } from '@/lib/api/papers';

interface PaperMultiSelectProps {
  papers: Paper[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  isSelectionMode: boolean;
  onToggleSelectionMode: (enabled: boolean) => void;
}

export function PaperMultiSelect({
  papers,
  selectedIds,
  onSelectionChange,
  isSelectionMode,
  onToggleSelectionMode
}: PaperMultiSelectProps) {

  const selectAll = () => {
    if (selectedIds.length === papers.length)
    {
      onSelectionChange([]);
    } else
    {
      onSelectionChange(papers.map(p => p.id));
    }
  };

  if (!isSelectionMode)
  {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onToggleSelectionMode(true)}
        className="flex items-center gap-2"
      >
        <CheckSquare className="h-4 w-4" />
        Select Papers
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium">
          {selectedIds.length} of {papers.length} selected
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {selectedIds.length === papers.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => {
            onToggleSelectionMode(false);
            onSelectionChange([]);
          }}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

