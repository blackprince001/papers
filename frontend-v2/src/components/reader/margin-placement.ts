export const MARGIN_CARD_GAP = 12;
/** Placement estimate before a card has been measured. */
export const MARGIN_CARD_MIN_HEIGHT = 76;

export interface MarginPlacement {
  top: number
  side: 'left' | 'right'
}

/**
 * Greedy two-column packing: walk entries top-to-bottom, always drop the
 * next card into whichever column ends higher, never above its anchor.
 * Heights come from real DOM measurement, so cards of any size stack
 * without overlapping; unmeasured cards use the minimum-height estimate
 * and are corrected on the first measure pass.
 */
export function stackPlacements(
  entries: Array<{ id: number; anchorY: number }>,
  heights: Map<number, number>,
  gap = MARGIN_CARD_GAP,
): MarginPlacement[] {
  const cursors = { left: 0, right: 0 };
  return entries.map(({ id, anchorY }) => {
    const side: 'left' | 'right' =
      cursors.left <= cursors.right ? 'left' : 'right';
    const height = heights.get(id) ?? MARGIN_CARD_MIN_HEIGHT;
    const top = Math.max(anchorY, cursors[side]);
    cursors[side] = top + height + gap;
    return { top, side };
  });
}
