import { useRef, useEffect } from 'react';
import { ArrowUpIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export function ResearchComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  loading,
  autoFocus,
  placeholder = 'Research with Lumen. Press Enter to start.',
  submitLabel = 'Start research',
  ariaLabel = 'Research question',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  submitLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content, up to a cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const canSend = !!value.trim() && !disabled && !loading;

  return (
    <div
      className={cn(
        'rounded-2xl border border-(--border) bg-(--card) transition-colors duration-150',
        'hover:border-(--foreground)/20 focus-within:border-(--foreground)/30',
        className,
      )}
    >
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        className="w-full bg-transparent text-body text-(--foreground) placeholder:text-(--muted-foreground) px-4 pt-3.5 pb-1 resize-none focus:outline-none leading-relaxed"
      />
      <div className="flex items-center justify-end px-3 pb-2.5 pt-1">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label={submitLabel}
          aria-busy={loading || undefined}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            'transition-all duration-150 active:scale-95',
            canSend
              ? 'bg-(--primary) [color:var(--primary-foreground)] hover:brightness-95'
              : 'bg-(--muted) text-(--muted-foreground) cursor-not-allowed',
          )}
        >
          {loading ? <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" /> : <ArrowUpIcon size="md" />}
        </button>
      </div>
    </div>
  );
}

export default ResearchComposer;
