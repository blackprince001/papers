import type { Annotation } from '@/lib/api/annotations';

export interface NormalizedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function annotationPage(ann: Annotation): number | null {
  const coord = ann.coordinate_data as { page?: number } | undefined;
  return coord?.page ?? null;
}

/** Per-line rects with fallback to the single boundingBox (old annotations). */
export function annotationRects(ann: Annotation): NormalizedRect[] {
  const sd = ann.selection_data as
    | { rects?: NormalizedRect[]; boundingBox?: NormalizedRect }
    | undefined;
  if (!sd) return [];
  if (Array.isArray(sd.rects) && sd.rects.length > 0) return sd.rects;
  if (sd.boundingBox && typeof sd.boundingBox.left === 'number') return [sd.boundingBox];
  return [];
}

/** Vertical anchor (0-1) of an annotation on its page. */
export function annotationAnchorY(ann: Annotation): number {
  const rects = annotationRects(ann);
  if (rects.length > 0) return rects[0].top;
  const coord = ann.coordinate_data as { y?: number } | undefined;
  return coord?.y ?? 0;
}


/* ── validation ──────────────────────────────────────────────────────────── */

const EPSILON = 1e-6

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Validate a normalized rect and clamp it into [0,1]². Returns null when the
 * rect is unusable (non-finite or empty after clamping) so callers can drop
 * bad captures instead of persisting them.
 */
export function validateNormalizedRect(
  rect: NormalizedRect
): NormalizedRect | null {
  const { left, top, width, height } = rect ?? ({} as NormalizedRect)
  if (
    ![left, top, width, height].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    return null
  }

  const clampedLeft = clamp01(left)
  const clampedTop = clamp01(top)
  const clampedRight = clamp01(left + width)
  const clampedBottom = clamp01(top + height)
  const clampedWidth = clampedRight - clampedLeft
  const clampedHeight = clampedBottom - clampedTop

  if (clampedWidth <= EPSILON || clampedHeight <= EPSILON) return null

  return {
    left: clampedLeft,
    top: clampedTop,
    width: clampedWidth,
    height: clampedHeight,
  }
}

/* ── canonical (unrotated page) space ────────────────────────────────────── */

/**
 * Stored annotation rects live in CANONICAL space: fractions of the UNROTATED
 * page, origin at the top-left of the page as authored. At rotation 0
 * canonical and displayed space are identical, which keeps every legacy
 * annotation valid without migration.
 */

function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  return ((((Math.round(rotation / 90) * 90) % 360) + 360) % 360) as
    | 0
    | 90
    | 180
    | 270
}

/**
 * Map a canonical-space rect into the page's DISPLAYED space for a clockwise
 * rotation of `rotation` degrees. Quarter turns swap width and height.
 */
export function rectFromCanonical(
  rect: NormalizedRect,
  rotation: number
): NormalizedRect {
  switch (normalizeRotation(rotation)) {
    case 90:
      // Page turned clockwise: the top edge becomes the right edge.
      return {
        left: 1 - rect.top - rect.height,
        top: rect.left,
        width: rect.height,
        height: rect.width,
      }
    case 180:
      return {
        left: 1 - rect.left - rect.width,
        top: 1 - rect.top - rect.height,
        width: rect.width,
        height: rect.height,
      }
    case 270:
      return {
        left: rect.top,
        top: 1 - rect.left - rect.width,
        width: rect.height,
        height: rect.width,
      }
    default:
      return { ...rect }
  }
}

/**
 * Map a DISPLAYED-space rect back to canonical space for the rotation it was
 * captured under. Inverse of {@link rectFromCanonical}.
 */
export function rectToCanonical(
  rect: NormalizedRect,
  rotation: number
): NormalizedRect {
  return rectFromCanonical(rect, 360 - normalizeRotation(rotation))
}

/* ── replay to pixels ────────────────────────────────────────────────────── */

/** Rendered page box in CSS px for the given scale and rotation. */
export function renderedPageSize(
  pageWidth: number,
  pageHeight: number,
  scale: number,
  rotation: number
): { width: number; height: number } {
  const quarterTurn = normalizeRotation(rotation) % 180 === 90
  const width = (quarterTurn ? pageHeight : pageWidth) * scale
  const height = (quarterTurn ? pageWidth : pageHeight) * scale
  return { width, height }
}

export interface PixelRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Replay a canonical rect into CSS-pixel coordinates inside the rendered page
 * box. Pure math over the viewer-contract metric semantics, so zoom, mixed
 * page sizes, and rotation are all handled here and nowhere else.
 */
export function rectToPixels(
  rect: NormalizedRect,
  pageWidth: number,
  pageHeight: number,
  scale: number,
  rotation: number
): PixelRect {
  const displayed = rectFromCanonical(rect, rotation)
  const { width, height } = renderedPageSize(
    pageWidth,
    pageHeight,
    scale,
    rotation
  )
  return {
    left: displayed.left * width,
    top: displayed.top * height,
    width: displayed.width * width,
    height: displayed.height * height,
  }
}
