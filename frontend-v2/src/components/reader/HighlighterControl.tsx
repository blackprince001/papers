import { HighlighterIcon } from '@/components/icons';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover';
import { cn } from '@/lib/utils';
import type { ThemeName } from '@/lib/paper-themes';
import { THEME_NAMES } from './highlight-colors';

/**
 * Floating highlighter control that lives over the PDF (not in the toolbar).
 * Click the pen to arm/disarm one-tap highlighting; pick a color in the popover.
 */
export function HighlighterControl({
  active,
  color,
  onToggle,
  onColorChange,
}: {
  active: boolean;
  color: ThemeName;
  onToggle: () => void;
  onColorChange: (color: ThemeName) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Highlighter"
        aria-pressed={active}
        className={cn(
          'flex size-10 items-center justify-center rounded-full border shadow-(--shadow-elevated) transition-colors',
          active
            ? 'border-transparent text-(--primary-foreground)'
            : 'border-(--border) bg-(--popover) text-(--muted-foreground) hover:text-(--foreground)',
        )}
        style={active ? { backgroundColor: `var(--theme-${color}-action)` } : undefined}
      >
        <HighlighterIcon size="md" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto p-2">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'mb-2 w-full rounded-interactive px-3 py-1.5 text-caption font-medium transition-colors',
            active
              ? 'bg-(--primary) text-(--primary-foreground)'
              : 'bg-(--secondary) text-(--foreground) hover:bg-(--muted)',
          )}
        >
          {active ? 'Highlighter on' : 'Highlighter off'}
        </button>
        <div className="flex items-center gap-1.5 px-0.5">
          {THEME_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onColorChange(name)}
              className={cn(
                'size-5 rounded-full border transition-transform',
                name === color
                  ? 'scale-125 ring-1 ring-(--foreground)'
                  : 'border-(--border) hover:scale-110',
              )}
              style={{ backgroundColor: `var(--theme-${name}-action)` }}
              aria-label={name}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
