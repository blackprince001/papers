import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus } from 'lucide-react';
import { tagsApi, type Tag } from '@/lib/api/tags';
import { Input } from '@/components/ui/input';
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

  const { data: tagsData, isLoading } = useQuery({
    queryKey: ['tags', inputValue],
    queryFn: () => tagsApi.list(1, 50, inputValue || undefined),
    enabled: isOpen && inputValue.length > 0,
  });

  const createTagMutation = useMutation({
    mutationFn: (name: string) => tagsApi.create(name),
    onSuccess: (newTag) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      if (!selectedTags.find(t => t.id === newTag.id)) {
        onTagsChange([...selectedTags, newTag]);
      }
      setInputValue('');
      setIsOpen(false);
    },
  });

  const availableTags = tagsData?.tags.filter(
    tag => !selectedTags.find(st => st.id === tag.id)
  ) || [];

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setIsOpen(value.length > 0);
  };

  const handleSelectTag = (tag: Tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      onTagsChange([...selectedTags, tag]);
    }
    setInputValue('');
    setIsOpen(false);
  };

  const handleCreateTag = () => {
    if (inputValue.trim() && !selectedTags.find(t => t.name.toLowerCase() === inputValue.trim().toLowerCase())) {
      createTagMutation.mutate(inputValue.trim());
    }
  };

  const handleRemoveTag = (tagId: number) => {
    onTagsChange(selectedTags.filter(t => t.id !== tagId));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (availableTags.length > 0) {
        handleSelectTag(availableTags[0]);
      } else {
        handleCreateTag();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInputValue('');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedTags.map((tag) => (
          <div
            key={tag.id}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-gray-900 rounded-sm text-xs"
          >
            <span>{tag.name}</span>
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="hover:bg-gray-200 rounded p-0.5 transition-colors"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.length > 0) setIsOpen(true);
          }}
          placeholder="Add tags..."
          className="text-sm"
        />

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-sm shadow-lg max-h-60 overflow-auto">
            {isLoading ? (
              <div className="p-2 text-xs text-gray-500">Loading...</div>
            ) : availableTags.length > 0 ? (
              <>
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleSelectTag(tag)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                  >
                    {tag.name}
                  </button>
                ))}
                {inputValue.trim() && !availableTags.find(t => t.name.toLowerCase() === inputValue.trim().toLowerCase()) && (
                  <button
                    onClick={handleCreateTag}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-600"
                    disabled={createTagMutation.isPending}
                  >
                    <Plus className="w-4 h-4" />
                    Create "{inputValue.trim()}"
                  </button>
                )}
              </>
            ) : inputValue.trim() ? (
              <button
                onClick={handleCreateTag}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-600"
                disabled={createTagMutation.isPending}
              >
                <Plus className="w-4 h-4" />
                Create "{inputValue.trim()}"
              </button>
            ) : (
              <div className="p-2 text-xs text-gray-500">Type to search or create tags</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

