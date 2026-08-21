/**
 * Engine-neutral reader viewer contract.
 *
 * This module is the seam between the reader orchestrator (ReaderShell) and a
 * PDF rendering engine (currently pdf.js via components/shadcn/pdf-viewer).
 * Engines implement these types; callers import them from here — never from an
 * engine file — so the engine can be replaced without touching the reader.
 *
 * Conventions every implementation must honor:
 *
 * - Page numbers are 1-based and match the document's own numbering.
 * - `pageWidth`/`pageHeight` are the page's UNROTATED dimensions in CSS
 *   pixels at scale 1. Rendered size is always `dimension * scale`, with
 *   width/height swapped when `rotation` is a quarter turn.
 * - `scale` is a unitless zoom multiplier; `rotation` is degrees, normalized
 *   to 0/90/180/270. Engines apply scale and rotation themselves — overlay
 *   consumers position children in percent of the rendered page box, so no
 *   consumer ever multiplies by scale twice.
 * - Scroll areas (`ReaderScrollArea`) express top/left/width/height as
 *   PERCENT of the rendered page box (0-100), matching the engine's existing
 *   scrollToPageArea units.
 */

export interface ReaderPageMetrics {
  /** 1-based page number. */
  pageNumber: number
  /** Unrotated page width in CSS px at scale 1. */
  pageWidth: number
  /** Unrotated page height in CSS px at scale 1. */
  pageHeight: number
  /** Unitless zoom multiplier applied to the rendered page. */
  scale: number
  /** Effective rotation in degrees, one of 0 | 90 | 180 | 270. */
  rotation: number
}

/** Props for the per-page overlay slot. Positioned in % of the rendered page. */
export type ReaderPageOverlayProps = ReaderPageMetrics

/** Scroll target area as percent (0-100) of the rendered page box. */
export interface ReaderScrollArea {
  top: number
  left?: number
  width?: number
  height?: number
}

export type ReaderViewerHandle = {
  /** Effective metrics for a page, or null when unknown/not yet measured. */
  getPageMetrics: (pageNumber: number) => ReaderPageMetrics | null
  /** Scroll the viewport so the page is visible. */
  scrollToPage: (pageNumber: number, options?: ScrollIntoViewOptions) => void
  /** Scroll to an area of a page given in percent of the rendered page box. */
  scrollToPageArea: (
    pageNumber: number,
    area: ReaderScrollArea,
    options?: ScrollToOptions
  ) => void
  /** The scrollable viewport element containing all pages. */
  getViewportElement: () => HTMLDivElement | null
  /** Clamp and apply a zoom multiplier. */
  setZoom: (zoom: number) => void
  /** Current zoom multiplier. */
  getZoom: () => number
  /** Collapse or expand the thumbnail sidebar (e.g. zen reading mode). */
  setThumbnailSidebarOpen: (open: boolean) => void
  /** Whether the thumbnail sidebar is open. */
  getThumbnailSidebarOpen: () => boolean
}

/** Engine component props that are part of the neutral contract. */
export interface ReaderViewerContractProps {
  /** Document finished loading and pages can be scrolled/rendered. */
  onReady?: (pageCount: number) => void
  /** The page currently at the viewport's reading position changed. */
  onActivePageChange?: (pageNumber: number) => void
  /** Per-page overlay slot, positioned in % of the rendered page box. */
  renderPageOverlay?: (
    props: ReaderPageOverlayProps
  ) => React.ReactNode
  /** Pointer interactions on a page, with that page's effective metrics. */
  onPagePointerDown?: (
    event: React.PointerEvent<HTMLDivElement>,
    metrics: ReaderPageMetrics
  ) => void
  onPagePointerMove?: (
    event: React.PointerEvent<HTMLDivElement>,
    metrics: ReaderPageMetrics
  ) => void
  onPagePointerUp?: (
    event: React.PointerEvent<HTMLDivElement>,
    metrics: ReaderPageMetrics
  ) => void
  onPagePointerCancel?: (
    event: React.PointerEvent<HTMLDivElement>,
    metrics: ReaderPageMetrics
  ) => void
}
