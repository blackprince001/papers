import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
  isLoading?: boolean;
  autoFocus?: boolean;
  showIcon?: boolean;
  size?: 'default' | 'compact';
  dark?: boolean;
}

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = 'Search...',
  className = '',
  debounceMs = 500,
  isLoading = false,
  autoFocus = false,
  showIcon = true,
  size = 'default',
  dark = false,
}: SearchInputProps) {
  const isCompact = size === 'compact';
  const [, setDebouncedValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the value
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
      if (onSearch && value.trim())
      {
        onSearch(value.trim());
      } else if (onSearch && !value.trim())
      {
        // Also call onSearch with empty string to clear results
        onSearch('');
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, debounceMs, onSearch]);

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current)
    {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape to clear
    if (e.key === 'Escape' && value)
    {
      e.preventDefault();
      onChange('');
      inputRef.current?.focus();
    }
    // Enter to search immediately
    if (e.key === 'Enter')
    {
      e.preventDefault();
      if (onSearch && value.trim())
      {
        onSearch(value.trim());
      }
    }
    // Focus with Ctrl/Cmd + K
    if ((e.ctrlKey || e.metaKey) && e.key === 'k')
    {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, [value, onChange, onSearch]);

  const handleClear = () => {
    onChange('');
    if (onSearch)
    {
      onSearch('');
    }
    inputRef.current?.focus();
  };

  if (dark) {
    return (
      <div className={cn('relative', className)}>
        <div
          className={cn(
            'bg-anara-sidebar-accent border border-anara-dark-border rounded-sm transition-all duration-200',
            isFocused
              ? 'border-gray-900 ring-2 ring-gray-900/20'
              : 'hover:border-anara-dark-border'
          )}
        >
          <div className={cn(
            "flex items-center gap-2",
            isCompact ? "px-2 py-1" : "px-3 py-1.5"
          )}>
            {showIcon && (
              <div className="flex-shrink-0 text-anara-dark-text-muted">
                {isLoading ? (
                  <Loader2 className={cn("animate-spin", isCompact ? "w-3 h-3" : "w-4 h-4")} />
                ) : (
                  <Search className={cn(isCompact ? "w-3 h-3" : "w-4 h-4")} />
                )}
              </div>
            )}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              className={cn(
                "flex-1 bg-transparent border-0 outline-none text-anara-dark-text placeholder:text-anara-dark-text-muted",
                isCompact ? "text-xs" : "text-sm"
              )}
            />
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="flex-shrink-0 text-anara-dark-text-muted hover:text-white transition-colors p-0.5 rounded"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'bg-white border rounded-sm transition-all duration-200',
          isFocused
            ? 'border-gray-900 ring-2 ring-gray-900/20'
            : 'border-anara-light-border hover:border-gray-300'
        )}
      >
        <div className={cn(
          "flex items-center gap-3",
          isCompact ? "px-3 py-1.5" : "px-4 py-3"
        )}>
          {showIcon && (
            <div className="flex-shrink-0 text-gray-400">
              {isLoading ? (
                <Loader2 className={cn("animate-spin", isCompact ? "w-4 h-4" : "w-5 h-5")} />
              ) : (
                <Search className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />
              )}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className={cn(
              "flex-1 bg-transparent border-0 outline-none text-anara-light-text placeholder:text-anara-light-text-muted",
              isCompact ? "text-sm" : "text-sm md:text-base"
            )}
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-sm hover:bg-gray-100"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search hint when focused */}
      {isFocused && !value && (
        <div className="absolute top-full left-0 right-0 mt-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-sm text-xs text-gray-500 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            <span>Semantic search - finds papers by meaning, not just keywords</span>
          </div>
        </div>
      )}
    </div>
  );
}

