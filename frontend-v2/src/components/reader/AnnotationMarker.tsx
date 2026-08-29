import { useEffect, useRef, useState } from 'react';
import { AnnotationIcon, CloseIcon } from '@/components/icons';
import type { ThemeName } from '@/lib/paper-themes';
import { cn } from '@/lib/utils';
import { highlightTheme } from './highlight-colors';
import { AnnotationCard } from './AnnotationCard';
import type { Annotation } from '@/lib/api/annotations';
import type { NormalizedRect } from './annotation-geometry';

const CARD_WIDTH = 256;

export function AnnotationMarker({
  annotation,
  rect,
  active,
  onSelect,
  onClose,
  onDelete,
  onUpdateContent,
  onRecolor,
  onRegenerate,
  regenerating = false,
  deleting = false,
}: {
  annotation: Annotation;
  rect: NormalizedRect;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onUpdateContent?: (content: string) => void;
  onRecolor?: (color: ThemeName) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  deleting?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const closeTimer = useRef(0);
  // `active` means this note is pinned open; hover only previews.
  const open = hovered || active;

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const theme = highlightTheme(annotation.highlight_type, annotation.selection_data);
  const anchorLeft = rect.left + rect.width;
  const anchorTop = rect.top + rect.height / 2;
  // Flip the popover to the left/up when the anchor is near the page edges.
  const flipX = anchorLeft > 0.66;
  const flipY = rect.top > 0.7;

  const previewOn = () => {
    window.clearTimeout(closeTimer.current);
    setHovered(true);
  };
  const previewOff = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(false), 120);
  };

  return (
    <div
      className={cn('absolute', active ? 'z-40' : open ? 'z-30' : 'z-20')}
      style={{ left: `${anchorLeft * 100}%`, top: `${anchorTop * 100}%` }}
      onMouseEnter={previewOn}
      onMouseLeave={previewOff}
    >
      <button
        type="button"
        aria-label={active ? 'Close annotation' : 'Open annotation'}
        onClick={() => (active ? onClose() : onSelect())}
        className={cn(
          'flex size-5 -translate-y-1/2 translate-x-1 items-center justify-center rounded-full border shadow-(--shadow-subtle) transition-transform',
          active ? 'scale-110' : 'hover:scale-110',
        )}
        style={{
          backgroundColor: `var(--theme-${theme}-accent)`,
          borderColor: `var(--theme-${theme}-action)`,
          color: `var(--theme-${theme}-text)`,
        }}
      >
        <AnnotationIcon size="xs" filled />
      </button>

      {open && (
        <div
          className="absolute"
          style={{
            width: CARD_WIDTH,
            [flipX ? 'right' : 'left']: 12,
            [flipY ? 'bottom' : 'top']: 12,
          }}
          onMouseEnter={previewOn}
          onMouseLeave={previewOff}
        >
          <div className="relative">
            <AnnotationCard
              annotation={annotation}
              active={active}
              compact
              onClick={onSelect}
              onDelete={onDelete}
              onUpdateContent={onUpdateContent}
              onRecolor={onRecolor}
              onRegenerate={onRegenerate}
              regenerating={regenerating}
              deleting={deleting}
            />
            <button
              type="button"
              aria-label="Close note"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full border border-(--border) bg-(--popover) text-(--muted-foreground) shadow-(--shadow-subtle) transition-colors hover:text-(--foreground)"
            >
              <CloseIcon size="xs" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
