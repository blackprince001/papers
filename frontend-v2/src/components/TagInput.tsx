import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { tagsApi, type Tag } from '@/lib/api/tags';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

interface TagInputProps {
  selectedTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  className?: string;
}

export function TagInput({ selectedTags, onTagsChange, className }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tags', inputValue],
    queryFn: () => tagsApi.list(1, 50, inputValue || undefined),
    enabled: isOpen && inputValue.length > 0,
  });

  const createTag = useMutation({
    mutationFn: (name: string) => tagsApi.create(name),
    onSuccess: (newTag) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      if (!selectedTags.find((t) => t.id === newTag.id)) {
        onTagsChange([...selectedTags, newTag]);
      }
      setInputValue('');
      setIsOpen(false);
    },
  });

  const available = data?.tags.filter((t) => !selectedTags.find((s) => s.id === t.id)) ?? [];

  const selectTag = (tag: Tag) => {
    if (!selectedTags.find((t) => t.id === tag.id)) onTagsChange([...selectedTags, tag]);
    setInputValue('');
    setIsOpen(false);
  };

  const createNew = () => {
    const name = inputValue.trim();
    if (name && !selectedTags.find((t) => t.name.toLowerCase() === name.toLowerCase())) {
      createTag.mutate(name);
    }
  };

  const removeTag = (id: number) => onTagsChange(selectedTags.filter((t) => t.id !== id));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (available.length > 0) {
        selectTag(available[0]);
      } else {
        createNew();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInputValue('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const exactExists = available.find((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase());
  const showCreate = inputValue.trim() && !exactExists;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-(--muted) rounded-badge text-caption text-(--foreground)"
            >
              {tag.name}
              <button
                onClick={() => removeTag(tag.id)}
                aria-label={`Remove ${tag.name}`}
                className="hover:bg-(--border) rounded-full p-0.5 transition-colors"
              >
                <CloseIcon size="xs" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(e.target.value.length > 0); }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (inputValue.length > 0) setIsOpen(true); }}
          aria-label="Add a tag"
          placeholder="Add tags…"
        />

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-(--popover) border border-(--border) rounded-card shadow-elevated max-h-52 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center px-3 py-2.5 text-(--muted-foreground)">
                <Spinner size="xs" />
              </div>
            ) : (
              <>
                {available.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => selectTag(tag)}
                    className="w-full text-left px-3 py-2 text-code hover:bg-(--muted) transition-colors"
                  >
                    {tag.name}
                  </button>
                ))}
                {showCreate && (
                  <button
                    onClick={createNew}
                    disabled={createTag.isPending}
                    className="w-full text-left px-3 py-2 text-code text-(--muted-foreground) hover:bg-(--muted) transition-colors flex items-center gap-2"
                  >
                    <PlusIcon size="xs" />
                    Create "{inputValue.trim()}"
                  </button>
                )}
                {!available.length && !showCreate && (
                  <p className="px-3 py-2 text-caption text-(--muted-foreground)">Type to search or create tags</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
