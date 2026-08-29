import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { ThemeName } from '@/lib/paper-themes';
import type { AIActionKind } from '@/lib/api/aiFeatures';
import type { NormalizedRect } from './annotation-geometry';
import { THEME_NAMES } from './highlight-colors';

export interface SelectionState {
  page: number;
  text: string;
  rects: NormalizedRect[];
  /** Viewport (client) coordinates for popover placement. */
  clientX: number;
  clientY: number;
}

const AI_ACTIONS: Array<{ kind: AIActionKind; label: string }> = [
  { kind: 'explain', label: 'Explain' },
  { kind: 'why', label: 'Why' },
  { kind: 'define', label: 'Define' },
];

/**
 * Floating actions for the current text selection: AI actions, color
 * swatches for one-off highlights, and a free comment box.
 */
export function SelectionPopover({
  selection,
  pendingAction,
  onAIAction,
  onCancelAction,
  onHighlight,
  onComment,
  onClose,
}: {
  selection: SelectionState;
  pendingAction: AIActionKind | null;
  onAIAction: (kind: AIActionKind) => void;
  onCancelAction?: () => void;
  onHighlight: (color: ThemeName) => void;
  onComment: (text: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [comment, setComment] = useState('');
  const [position, setPosition] = useState({
    left: selection.clientX,
    top: selection.clientY + 10,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(selection.clientX - rect.width / 2, window.innerWidth - rect.width - 8)),
      top: Math.min(selection.clientY + 10, window.innerHeight - rect.height - 8),
    });
  }, [selection.clientX, selection.clientY]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 w-72 rounded-xl border border-(--border) bg-(--popover) p-2 shadow-(--shadow-modal)"
    >
      <div className="mb-2 flex items-center gap-1">
        {AI_ACTIONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            disabled={pendingAction !== null}
            onClick={() => onAIAction(kind)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-(--border) px-2 py-1.5 text-caption font-medium transition-colors',
              pendingAction === kind
                ? 'bg-(--secondary) text-(--foreground)'
                : 'text-(--foreground) hover:bg-(--secondary)',
              pendingAction !== null && pendingAction !== kind && 'opacity-40',
            )}
          >
            {pendingAction === kind && <Spinner size="xs" />}
            {label}
          </button>
        ))}
      </div>

      {pendingAction && onCancelAction && (
        <button
          type="button"
          onClick={onCancelAction}
          className="mb-2 w-full rounded-lg border border-(--border) px-2 py-1.5 text-caption text-(--muted-foreground) transition-colors hover:bg-(--secondary) hover:text-(--foreground)"
        >
          Cancel AI action
        </button>
      )}

      {/* Color swatch row for one-off highlights */}
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        {THEME_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onHighlight(name)}
            className="size-5 rounded-full border border-(--border) transition-transform hover:scale-125"
            style={{ backgroundColor: `var(--theme-${name}-action)` }}
            aria-label={`Highlight ${name}`}
          />
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = comment.trim();
          if (text) onComment(text);
        }}
      >
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Your comment…"
          rows={2}
          disabled={pendingAction !== null}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              const text = comment.trim();
              if (text) onComment(text);
            }
          }}
          className="w-full resize-none rounded-lg border border-(--border) bg-(--white) px-2 py-1.5 text-caption outline-none placeholder:text-(--muted-foreground) focus:border-(--foreground)"
        />
        {comment.trim() && (
          <button
            type="submit"
            disabled={pendingAction !== null}
            className="mt-1 w-full rounded-lg bg-(--primary) px-2 py-1.5 text-caption font-medium text-(--primary-foreground) transition-opacity hover:opacity-90"
          >
            Save comment
          </button>
        )}
      </form>
    </div>
  );
}
