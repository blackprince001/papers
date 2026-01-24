
import { CheckSquare, X } from 'lucide-react';
import { Button } from './Button';
import type { Paper } from '@/lib/api/papers';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleSelectionMode(true)}
              className="h-8 w-8 p-0"
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Select Papers</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="text-sm font-medium mr-2">
        {selectedIds.length} selected
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={selectAll} className="h-8 w-8 p-0">
              {selectedIds.length === papers.length ? (
                <CheckSquare className="h-4 w-4 text-blue-600" />
              ) : (
                <div className="h-4 w-4 border-2 border-current rounded-sm" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{selectedIds.length === papers.length ? 'Deselect All' : 'Select All'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onToggleSelectionMode(false);
                onSelectionChange([]);
              }}
              className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Cancel Selection</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

