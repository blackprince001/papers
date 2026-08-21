import { useId } from 'react';
import type { Annotation } from '@/lib/api/annotations';
import { cn } from '@/lib/utils';
import type { ThemeName } from '@/lib/paper-themes';
import {
  annotationRects,
  rectFromCanonical,
  type NormalizedRect,
} from './annotation-geometry';
import { highlightTheme } from './highlight-colors';
import type { HighlightDraft } from './use-highlight-drafts';

/**
 * Per-page highlight layer inside the viewer overlay: persisted highlight
 * rects plus in-flight drafts. All rects arrive in canonical (unrotated page)
 * space and are converted to displayed-space percentages here.
 *
 * Draft states are visible and deterministic: dashed ring while `draft`,
 * solid fill while `committing`, destructive fill with Retry/Discard buttons
 * while `failed`. The buttons are real buttons, so the lifecycle is fully
 * keyboard-operable.
 */
export function HighlightOverlay({
  annotations,
  drafts,
  rotation,
  activeAnnotationId,
  isDark,
  onSelectAnnotation,
  onRetryDraft,
  onDiscardDraft,
  deletingAnnotationId,
}: {
  annotations: Annotation[]
  drafts: HighlightDraft[]
  /** Effective rotation of this page (degrees). */
  rotation: number
  activeAnnotationId: number | null
  isDark: boolean
  onSelectAnnotation: (id: number) => void
  onRetryDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  /** Annotation waiting out its undo window; its rects fade. */
  deletingAnnotationId?: number | null
}) {
  const chipLabelId = useId();

  const displayed = (rect: NormalizedRect): NormalizedRect =>
    rectFromCanonical(rect, rotation);

  return (
    <>
      {/* Persisted highlight rects */}
      {annotations.map((ann) => {
        const theme = highlightTheme(ann.highlight_type, ann.selection_data);
        return annotationRects(ann).map((canonical, i) => {
          const rect = displayed(canonical);
          const deleting = deletingAnnotationId === ann.id;
          return (
            <button
              key={`${ann.id}-${i}`}
              type="button"
              aria-label={
                deleting ? 'Deleting highlight' : 'Annotation highlight'
              }
              disabled={deleting}
              onClick={() => {
                onSelectAnnotation(ann.id);
              }}
              className={cn(
                'absolute rounded-[2px] transition-opacity',
                isDark ? 'mix-blend-screen' : 'mix-blend-multiply',
                deleting
                  ? 'pointer-events-none opacity-25 ring-1 ring-(--destructive)'
                  : activeAnnotationId === ann.id
                    ? 'opacity-90'
                    : 'opacity-60 hover:opacity-80',
              )}
              style={{
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
                backgroundColor: `var(--theme-${theme}-action)`,
              }}
            />
          );
        });
      })}

      {/* In-flight draft rects */}
      {drafts.map((draft) => (
        <DraftRects
          key={draft.id}
          draft={draft}
          rotation={rotation}
          chipLabelId={chipLabelId}
          onRetry={onRetryDraft}
          onDiscard={onDiscardDraft}
        />
      ))}
    </>
  );
}

function DraftRects({
  draft,
  rotation,
  chipLabelId,
  onRetry,
  onDiscard,
}: {
  draft: HighlightDraft
  rotation: number
  chipLabelId: string
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const failed = draft.status === 'failed';
  const first = draft.rects[0] ? rectFromCanonical(draft.rects[0], rotation) : undefined;
  const colorVar = draft.color ? `var(--theme-${draft.color as ThemeName}-action)` : undefined;

  return (
    <>
      {draft.rects.map((canonical, i) => {
        const rect = rectFromCanonical(canonical, rotation);
        return (
          <div
            key={`${draft.id}-${i}`}
            role="status"
            aria-label={
              draft.status === 'committing'
                ? 'Saving highlight'
                : draft.status === 'failed'
                  ? 'Highlight failed to save'
                  : 'Highlight pending'
            }
            className={cn(
              'pointer-events-none absolute rounded-[2px]',
              failed && 'ring-1 ring-(--destructive)',
              draft.status === 'draft' && 'ring-1 ring-dashed',
            )}
            style={{
              left: `${rect.left * 100}%`,
              top: `${rect.top * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              backgroundColor: failed
                ? 'var(--destructive)'
                : (colorVar ?? 'var(--muted-foreground)'),
              opacity: draft.status === 'draft' ? 0.35 : 0.6,
            }}
          />
        );
      })}

      {failed && first ? (
        <div
          role="group"
          aria-labelledby={chipLabelId}
          className="absolute z-30 flex items-center gap-1 rounded-md border bg-(--popover) p-1 shadow-(--shadow-subtle)"
          style={{
            left: `${first.left * 100}%`,
            top: `calc(${(first.top + first.height) * 100}% + 4px)`,
          }}
        >
          <span id={chipLabelId} className="sr-only">
            Highlight failed to save. Retry or discard.
          </span>
          <button
            type="button"
            onClick={() => onRetry(draft.id)}
            className="rounded px-2 py-0.5 text-caption font-medium text-(--foreground) hover:bg-(--accent)"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => onDiscard(draft.id)}
            className="rounded px-2 py-0.5 text-caption text-(--muted-foreground) hover:bg-(--accent)"
          >
            Discard
          </button>
        </div>
      ) : null}
    </>
  );
}