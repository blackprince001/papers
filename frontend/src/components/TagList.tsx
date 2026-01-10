import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tag } from '@/lib/api/papers';

interface TagListProps {
  tags: Tag[];
  onRemove?: (tagId: number) => void;
  className?: string;
  showRemove?: boolean;
}

export function TagList({ tags, onRemove, className, showRemove = false }: TagListProps) {
  if (tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {tags.map((tag) => (
        <div
          key={tag.id}
          className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-gray-900 rounded-sm text-xs"
        >
          <span>{tag.name}</span>
          {showRemove && onRemove && (
            <button
              onClick={() => onRemove(tag.id)}
              className="hover:bg-gray-200 rounded p-0.5 transition-colors"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

