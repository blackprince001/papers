import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Annotation } from '@/lib/api/annotations';
import type { ThemeName } from '@/lib/paper-themes';
import {
  annotationRects,
  rectFromCanonical,
  type NormalizedRect,
} from './annotation-geometry';
import { highlightTheme } from './highlight-colors';
import { AnnotationCard } from './AnnotationCard';
import { MARGIN_CARD_GAP, stackPlacements } from './margin-placement';

/**
 * Margin annotation layer for one page: measures every card's real height
 * (ResizeObserver, so content and resize changes re-stack), packs cards
 * into the side gutters without overlap, and draws leader lines to their
 * marks. Hovering or focusing a card links it to its highlight rect via
 * `onHoverAnnotation`.
 */
export function MarginNotes({
  annotations,
  rotation,
  renderedWidth,
  renderedHeight,
  cardWidth,
  gap = MARGIN_CARD_GAP,
  activeAnnotationId,
  deletingAnnotationId,
  onSelectAnnotation,
  onHoverAnnotation,
  onDelete,
  onUpdateContent,
  onRecolor,
}: {
  annotations: Annotation[]
  /** Effective rotation of this page (degrees). */
  rotation: number
  renderedWidth: number
  renderedHeight: number
  cardWidth: number
  gap?: number
  activeAnnotationId: number | null
  deletingAnnotationId?: number | null
  onSelectAnnotation: (id: number) => void
  onHoverAnnotation?: (id: number | null) => void
  onDelete?: (annotation: Annotation) => void
  onUpdateContent?: (annotation: Annotation, content: string) => void
  onRecolor?: (annotation: Annotation, color: ThemeName) => void
}) {
  const wrappers = useRef(new Map<number, HTMLDivElement>());
  const [heights, setHeights] = useState<Map<number, number>>(new Map());

  // Displayed-space rects sorted by anchor Y give deterministic packing.
  const entries = useMemo(
    () =>
      annotations
        .map((ann) => {
          const canonical = annotationRects(ann)[0];
          return canonical
            ? { ann, rect: rectFromCanonical(canonical, rotation) }
            : null;
        })
        .filter((e): e is { ann: Annotation; rect: NormalizedRect } => !!e)
        .sort((a, b) => a.rect.top - b.rect.top),
    [annotations, rotation],
  );

  const entryIds = entries.map(({ ann }) => ann.id).join(',');
  useLayoutEffect(() => {
    const observer = new ResizeObserver((observed) => {
      setHeights((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const item of observed) {
          const id = Number(
            (item.target as HTMLElement).dataset.annotationId,
          );
          const height = item.target.getBoundingClientRect().height;
          if (Number.isFinite(height) && next.get(id) !== height) {
            next.set(id, height);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    for (const el of wrappers.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [entryIds]);

  const placements = useMemo(
    () =>
      stackPlacements(
        entries.map(({ ann, rect }) => ({
          id: ann.id,
          anchorY: rect.top * renderedHeight,
        })),
        heights,
        gap,
      ),
    [entries, heights, renderedHeight, gap],
  );

  if (entries.length === 0) return null;

  return (
    <>
      {/* Leader lines from highlight → margin card */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        {entries.map(({ ann, rect }, i) => {
          const { top, side } = placements[i];
          const theme = highlightTheme(ann.highlight_type, ann.selection_data);
          const y1 = (rect.top + rect.height / 2) * renderedHeight;
          const y2 = top + 16;
          const x1 =
            side === 'right'
              ? (rect.left + rect.width) * renderedWidth
              : rect.left * renderedWidth;
          const x2 =
            side === 'right'
              ? renderedWidth + MARGIN_CARD_GAP
              : -MARGIN_CARD_GAP;
          const linked =
            activeAnnotationId === ann.id || deletingAnnotationId === ann.id;
          return (
            <path
              key={ann.id}
              d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
              fill="none"
              strokeWidth={1.25}
              style={{ stroke: `var(--theme-${theme}-action)` }}
              opacity={linked ? 0.95 : 0.5}
            />
          );
        })}
      </svg>

      {entries.map(({ ann }, i) => {
        const { top, side } = placements[i];
        return (
          <div
            key={ann.id}
            data-annotation-id={ann.id}
            data-testid="margin-note"
            className="absolute"
            style={{
              top,
              width: cardWidth,
              zIndex:
                activeAnnotationId === ann.id
                  ? 40
                  : deletingAnnotationId === ann.id
                    ? 30
                    : 20,
              ...(side === 'right'
                ? { left: renderedWidth + MARGIN_CARD_GAP }
                : { right: renderedWidth + MARGIN_CARD_GAP }),
            }}
            onMouseEnter={() => onHoverAnnotation?.(ann.id)}
            onMouseLeave={() => onHoverAnnotation?.(null)}
            onFocusCapture={() => onHoverAnnotation?.(ann.id)}
            onBlurCapture={() => onHoverAnnotation?.(null)}
            ref={(el) => {
              if (el) wrappers.current.set(ann.id, el);
              else wrappers.current.delete(ann.id);
            }}
          >
            <AnnotationCard
              annotation={ann}
              active={activeAnnotationId === ann.id}
              compact
              onClick={() => onSelectAnnotation(ann.id)}
              deleting={deletingAnnotationId === ann.id}
              onDelete={onDelete ? () => onDelete(ann) : undefined}
              onUpdateContent={
                onUpdateContent
                  ? (content) => onUpdateContent(ann, content)
                  : undefined
              }
              onRecolor={onRecolor ? (color) => onRecolor(ann, color) : undefined}
            />
          </div>
        );
      })}
    </>
  );
}
