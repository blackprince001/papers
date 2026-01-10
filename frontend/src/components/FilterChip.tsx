import { X } from 'lucide-react';
import { Badge } from './ui/badge';

interface FilterChipProps {
  label: string;
  value: string;
  onRemove: () => void;
}

export function FilterChip({ label, value, onRemove }: FilterChipProps) {
  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <span className="text-xs">
        {label}: {value}
      </span>
      <button
        onClick={onRemove}
        className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
        aria-label="Remove filter"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

