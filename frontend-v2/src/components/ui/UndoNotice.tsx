import { cn } from '@/lib/utils';

/**
 * Bottom-center notice announcing a deferred destructive action while its
 * undo window is open. A plain button keeps Undo keyboard-operable.
 */
export function UndoNotice({
  message,
  onUndo,
  className,
}: {
  message: string
  onUndo: () => void
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2',
        'rounded-full border border-(--border) bg-(--popover) px-4 py-2 shadow-(--shadow-elevated)',
        className,
      )}
    >
      <span className="text-caption text-(--muted-foreground)">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="rounded px-2 py-0.5 text-caption font-medium text-(--foreground) transition-colors hover:bg-(--accent)"
      >
        Undo
      </button>
    </div>
  );
}
