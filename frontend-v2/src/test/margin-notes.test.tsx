import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarginNotes } from '@/components/reader/MarginNotes';
import {
  MARGIN_CARD_MIN_HEIGHT,
  stackPlacements,
} from '@/components/reader/margin-placement';
import type { Annotation } from '@/lib/api/annotations';

const annotation = (id: number, top: number): Annotation =>
  ({
    id,
    paper_id: 1,
    type: 'annotation',
    content: `note ${id}`,
    highlighted_text: 'quote',
    selection_data: {
      rects: [{ left: 0.1, top, width: 0.3, height: 0.1 }],
      color: 'blue',
    },
    coordinate_data: { page: 1, x: 0.25, y: top },
    highlight_type: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }) as never;

describe('stackPlacements', () => {
  it('never overlaps cards in the same column', () => {
    const entries = [1, 2, 3].map((i) => ({ id: i, anchorY: i * 10 }));
    const heights = new Map([
      [1, 200],
      [2, 150],
      [3, 180],
    ]);
    const placed = stackPlacements(entries, heights);
    for (const side of ['left', 'right'] as const) {
      const boxes = placed
        .map((p, i) => ({ ...p, id: entries[i].id }))
        .filter((p) => p.side === side)
        .sort((a, b) => a.top - b.top);
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i].top).toBeGreaterThanOrEqual(
          boxes[i - 1].top + heights.get(boxes[i - 1].id)! + 12,
        );
      }
    }
  });

  it('keeps a card at its anchor when the column is free below it', () => {
    const placed = stackPlacements([{ id: 1, anchorY: 300 }], new Map(), 12);
    expect(placed[0]).toEqual({ top: 300, side: 'left' });
  });

  it('uses the minimum-height estimate before measurement', () => {
    const placed = stackPlacements(
      [
        { id: 1, anchorY: 0 },
        { id: 2, anchorY: 0 },
        { id: 3, anchorY: 0 },
      ],
      new Map(),
      12,
    );
    // Third card stacks below the first in its column, clearing the
    // estimated height plus the gap.
    expect(placed[2].top).toBe(MARGIN_CARD_MIN_HEIGHT + 12);
  });

  it('scheduling alternates columns when anchors collide', () => {
    const placed = stackPlacements(
      [
        { id: 1, anchorY: 0 },
        { id: 2, anchorY: 0 },
        { id: 3, anchorY: 0 },
      ],
      new Map(),
      12,
    );
    expect(placed.map((p) => p.side)).toEqual(['left', 'right', 'left']);
  });
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('MarginNotes component', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders one card per annotation and links hover to its mark', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const onHover = vi.fn();
    const onDelete = vi.fn();
    render(
      <MarginNotes
        annotations={[annotation(1, 0.1), annotation(2, 0.5)]}
        rotation={0}
        renderedWidth={600}
        renderedHeight={800}
        cardWidth={220}
        activeAnnotationId={null}
        onSelectAnnotation={() => {}}
        onHoverAnnotation={onHover}
        onDelete={onDelete}
      />,
    );

    expect(screen.getAllByTestId('margin-note')).toHaveLength(2);
    const user = userEvent.setup();
    await user.hover(screen.getAllByTestId('margin-note')[0]);
    expect(onHover).toHaveBeenLastCalledWith(1);
    await user.unhover(screen.getAllByTestId('margin-note')[0]);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('wires delete through with the annotation', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <MarginNotes
        annotations={[annotation(3, 0.2)]}
        rotation={0}
        renderedWidth={600}
        renderedHeight={800}
        cardWidth={220}
        activeAnnotationId={null}
        onSelectAnnotation={() => {}}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete annotation' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });
});
