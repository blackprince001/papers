import { describe, expect, it } from 'vitest';
import {
  rectFromCanonical,
  rectToCanonical,
  renderedPageSize,
  rectToPixels,
  validateNormalizedRect,
  type NormalizedRect,
} from '@/components/reader/annotation-geometry';

const rect = (left: number, top: number, width: number, height: number): NormalizedRect => ({
  left,
  top,
  width,
  height,
});

const expectRectClose = (
  received: NormalizedRect | null,
  expected: NormalizedRect,
) => {
  expect(received).not.toBeNull();
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    expect(received![key]).toBeCloseTo(expected[key], 6);
  }
};

describe('validateNormalizedRect', () => {
  it('accepts a well-formed rect unchanged', () => {
    expectRectClose(
      validateNormalizedRect(rect(0.1, 0.2, 0.3, 0.4)),
      rect(0.1, 0.2, 0.3, 0.4),
    );
  });

  it('clamps rects that spill past the page edges', () => {
    expectRectClose(
      validateNormalizedRect(rect(-0.2, 0.9, 0.5, 0.5)),
      rect(0, 0.9, 0.3, 0.1),
    );
    expectRectClose(
      validateNormalizedRect(rect(0.8, 0.1, 0.5, 0.5)),
      rect(0.8, 0.1, 0.2, 0.5),
    );
  });

  it('rejects non-finite and empty rects', () => {
    expect(validateNormalizedRect(rect(Number.NaN, 0, 0.1, 0.1))).toBeNull();
    expect(
      validateNormalizedRect(rect(Number.POSITIVE_INFINITY, 0, 0.1, 0.1)),
    ).toBeNull();
    expect(validateNormalizedRect(rect(0.5, 0.5, 0, 0.1))).toBeNull();
    // Entirely outside the page clamps to empty.
    expect(validateNormalizedRect(rect(1.5, 0.5, 0.2, 0.2))).toBeNull();
    expect(validateNormalizedRect(undefined as never)).toBeNull();
  });
});

describe('rectFromCanonical / rectToCanonical round trips', () => {
  const cases = [rect(0.1, 0.2, 0.3, 0.4), rect(0.6, 0.7, 0.25, 0.15)];

  for (const rotation of [0, 90, 180, 270]) {
    it(`round-trips through ${rotation}°`, () => {
      for (const r of cases) {
        expectRectClose(
          rectToCanonical(rectFromCanonical(r, rotation), rotation),
          r,
        );
      }
    });
  }

  it('is identity at rotation 0 (legacy data stays valid)', () => {
    expect(rectFromCanonical(cases[0], 0)).toEqual(cases[0]);
    expect(rectToCanonical(cases[0], 0)).toEqual(cases[0]);
  });

  it('swaps width/height on quarter turns', () => {
    const rotated = rectFromCanonical(rect(0.1, 0.2, 0.3, 0.4), 90);
    expect(rotated.width).toBeCloseTo(0.4);
    expect(rotated.height).toBeCloseTo(0.3);
  });

  it('maps the canonical top edge to the displayed right edge at 90°', () => {
    // A full-width strip along the top of the unrotated page becomes a
    // full-height strip along the right of the displayed page.
    const strip = rectFromCanonical(rect(0, 0, 1, 0.25), 90);
    expect(strip.top).toBeCloseTo(0);
    expect(strip.left + strip.width).toBeCloseTo(1);
    expect(strip.height).toBeCloseTo(1);
  });
});

describe('renderedPageSize', () => {
  it('multiplies by scale without swapping at 0/180°', () => {
    expect(renderedPageSize(600, 800, 1.5, 0)).toEqual({ width: 900, height: 1200 });
    expect(renderedPageSize(600, 800, 1.5, 180)).toEqual({ width: 900, height: 1200 });
  });

  it('swaps dimensions on quarter turns', () => {
    expect(renderedPageSize(600, 800, 2, 90)).toEqual({ width: 1600, height: 1200 });
    expect(renderedPageSize(600, 800, 2, 270)).toEqual({ width: 1600, height: 1200 });
  });
});

describe('rectToPixels replay', () => {
  it('replays across zoom levels (canonical → pixels)', () => {
    const canonical = rect(0.25, 0.5, 0.5, 0.25);
    for (const scale of [0.5, 1, 1.75]) {
      const px = rectToPixels(canonical, 400, 600, scale, 0);
      expect(px.left).toBeCloseTo(0.25 * 400 * scale);
      expect(px.top).toBeCloseTo(0.5 * 600 * scale);
      expect(px.width).toBeCloseTo(0.5 * 400 * scale);
      expect(px.height).toBeCloseTo(0.25 * 600 * scale);
    }
  });

  it('replays identically on mixed page sizes', () => {
    // Same canonical fraction lands proportionally on different pages.
    const canonical = rect(0.1, 0.1, 0.2, 0.2);
    const small = rectToPixels(canonical, 300, 400, 1, 0);
    const large = rectToPixels(canonical, 1200, 1600, 1, 0);
    expect(small.left / 300).toBeCloseTo(large.left / 1200);
    expect(small.top / 400).toBeCloseTo(large.top / 1600);
  });

  it('keeps a rect inside the rendered box under all four rotations', () => {
    const canonical = rect(0.2, 0.3, 0.4, 0.5);
    for (const rotation of [0, 90, 180, 270]) {
      const { width, height } = renderedPageSize(400, 600, 1.25, rotation);
      const px = rectToPixels(canonical, 400, 600, 1.25, rotation);
      expect(px.left).toBeGreaterThanOrEqual(-1e-6);
      expect(px.top).toBeGreaterThanOrEqual(-1e-6);
      expect(px.left + px.width).toBeLessThanOrEqual(width + 1e-6);
      expect(px.top + px.height).toBeLessThanOrEqual(height + 1e-6);
    }
  });

  it('preserves area ratio between canonical and displayed space', () => {
    const canonical = rect(0.2, 0.3, 0.4, 0.5);
    const px = rectToPixels(canonical, 400, 600, 1, 90);
    // Canonical fraction area vs pixel area on swapped page dims.
    expect(px.width * px.height).toBeCloseTo(0.4 * 0.5 * 600 * 400);
  });
});
