---
type: Module
title: Frontend PDF Reader & Annotations
description: The forked virtualized react-pdf viewer (PAPERS-FORK hooks), the ReaderShell orchestrator, per-page annotation overlay, selection capture, highlighter, deep-linking, and dark reading.
resource: frontend-v2/src/components/shadcn/pdf-viewer.tsx
tags: [frontend, pdf, reader, annotations, pdfjs, react-pdf]
timestamp: 2026-06-28T00:00:00Z
---

The reader combines a **forked** shadcn-style PDF block with a reader
orchestrator that adds annotation capture, AI selection actions, and
deep-linking.

# `components/shadcn/pdf-viewer.tsx` — the viewer

Built on **`react-pdf@10.4.1`** + **`pdfjs-dist@5.4.296`**. `react-pdf` is
**dynamically imported** (`pdf-viewer.tsx:858-875`); `pdfjs.GlobalWorkerOptions.workerSrc`
is set to the same-origin `/pdfjs/pdf.worker.min.mjs` (`getPdfWorkerUrl`,
`:182-185`, applied at `:858-862`). All pdf.js assets are **self-hosted — no CDN
requests at runtime**: the `copy-pdfjs` postinstall script (`package.json:11-12`)
copies the worker, cmaps, and standard fonts from the installed `pdfjs-dist`
into `public/pdfjs/`, so the served worker always matches the resolved package
version (a single `pdfjs-dist@5.4.296` is shared by react-pdf and the app).
The VitePWA config precaches `pdfjs/*.mjs` (`vite.config.ts:13`).

CMaps/standard fonts: `getDefaultPdfDocumentOptions` returns same-origin
`/pdfjs/cmaps/` and `/pdfjs/standard_fonts/`; `file-system.tsx` passes the same
paths explicitly for its dialog viewer.

E2E coverage: `e2e/authenticated-reader-chat.spec.ts` ("reader loads pdf.js
worker and assets from same origin only") fails on any unpkg/jsdelivr/cdnjs
request or any 4xx+ fetch under `/pdfjs/`, and asserts the served worker body
contains the installed `pdfjs-dist` version. Shared reader fixtures live in
`e2e/support/reader-fixtures.ts`.

- **Virtualized continuous scroll** via `@tanstack/react-virtual` `useVirtualizer` (`:954-963`), with scroll-velocity-aware render buffering (`fastAheadBuffer`/`fastBehindBuffer`, `:1120-1171`).
- DPR-drop-while-zooming then re-raster on settle (`:889-904`); per-page metrics caching (`:999-1059`); thumbnail sidebar virtualizer (`:1109-1118`); in-document text search highlighting (`:602-679`); rotate + download-with-rotations via `pdf-lib` (`:261-302`).
- `PDFViewerHandle` imperative API (`:67-78`): `scrollToPage`, `scrollToPageArea`, `getViewportElement`, `setZoom`, `getZoom` — the last three are `PAPERS-FORK` additions (`:75-77`, `:1441-1447`).
- Other `PAPERS-FORK` hooks: `onDocumentProxy` (`:121`), `outlinePanel` slot (`:123`), `renderPageOverlay` (`:117`), `onPagePointerDown/Move/Up/Cancel` (`:125-140`).

# `components/reader/ReaderShell.tsx:59` — the orchestrator

- Loads the PDF through the authenticated API as a Blob → object URL via `hooks/use-paper-file.ts:24-45` (revokes on unmount/paper change).
- Mounts `<PDFViewer>` with `renderPageOverlay={renderPageOverlay}` (`ReaderShell.tsx:567`) which draws per page: (a) highlight rectangles from normalized `selection_data.rects`; (b) **margin annotation cards** (`reader/MarginNotes.tsx`, measured two-column stacking — see below) when side gutters are wide enough, or **inline `AnnotationMarker`s** otherwise. Color comes from `reader/highlight-colors.ts` → CSS vars `--theme-{name}-action`.
- **Selection capture** (`handlePagePointerUp`, `ReaderShell.tsx:299-364`): on pointerup, reads `window.getSelection()`, normalizes each `ClientRect` to 0–1 page-relative rects; creates an instant highlight if the `HighlighterControl` pen is armed (`:342-351`), otherwise opens the `SelectionPopover`.
- `components/reader/SelectionPopover.tsx:28` — floating actions: AI actions (Explain/Why/Define → `aiFeaturesApi.aiAction`), color-swatch one-off highlights, and a comment box (creates an `annotation`-type annotation, `ReaderShell.tsx:237-260`).
- `components/reader/HighlighterControl.tsx:11` — floating pen button + color popover (8 themes).
- `components/reader/AnnotationsPanel.tsx:10` — side list sorted by page then anchor Y; click → `reader.scrollCallbacks.scrollToAnnotation` (registered via `ReaderContext`, `ReaderShell.tsx:161-164`) which calls `viewerRef.scrollToPageArea`.
- `components/reader/OutlinePanel.tsx:48` + `utils/toc.ts:11` — extracts the PDF outline (`pdf.getOutline`) and resolves destinations to page numbers; rendered into the viewer's `outlinePanel` slot.
- Deep-linking: `?page=N` and `?focus=annotation:22` (parsed in `PaperDetail.tsx:20-23`) scroll to the target on load (`ReaderShell.tsx:166-203`).
- Zen mode: full-screen toggle at zoom ≥ 1.5 (`ReaderShell.tsx:88-109`).
- Dark reading: wraps viewer in `data-reader-dark`; the CSS `filter: invert(1) hue-rotate(180deg)` applies only to `.react-pdf__Page canvas` (`index.css:674`); `hooks/use-pdf-dark-mode.ts:22` refines image regions.

# Annotation geometry

`reader/annotation-geometry.ts`: `annotationPage`, `annotationRects` (per-line
rects with fallback to legacy `boundingBox`), `annotationAnchorY`. Types:
`annotation` (highlights/comments) vs `note` (freeform); `type`/`highlight_type`
drive the color theme mapping in `highlight-colors.ts:6-14`.

**Canonical space (RD-01).** Stored rects are fractions of the UNROTATED page;
at rotation 0 canonical and displayed space are identical, so all legacy data
stays valid without migration. The module provides `validateNormalizedRect`
(clamps into [0,1]², rejects non-finite/empty), `rectFromCanonical` /
`rectToCanonical` (displayed↔canonical for 0/90/180/270°), `renderedPageSize`
(unrotated dims × scale, swapped on quarter turns), and `rectToPixels`
(canonical → CSS px inside the rendered box). Capture converts displayed→canonical
using the page's effective rotation (`ReaderShell.handlePagePointerUp`);
overlay replay converts back. Unit tests: `src/test/annotation-geometry.test.ts`.

# Viewer contract (RD-01)

`reader/viewer-contract.ts` is the engine-neutral seam between `ReaderShell`
and a PDF engine (currently pdf.js via `shadcn/pdf-viewer`). It defines
1-based page numbering; `ReaderPageMetrics` (`pageWidth`/`pageHeight` are
UNROTATED CSS px at scale 1, `scale` unitless, `rotation` 0/90/180/270);
percent-of-rendered-page scroll areas; readiness (`onReady`) and current-page
notification (`onActivePageChange`); the overlay slot; metrics-aware pointer
callbacks; and the imperative handle (`getPageMetrics`, `scrollToPage`,
`scrollToPageArea`, viewport access, zoom clamp/get/set, thumbnail sidebar).
Engines import the contract — callers never import engine types.
`PDFViewerHandle`/`PDFViewerPageOverlayProps` in the engine are aliases of the
contract types. Overlay consumers derive rendered size via
`renderedPageSize` only, so scale is never applied twice.

# Highlight lifecycle (RD-02)

Highlight and comment creation flows through a visible draft lifecycle
(`reader/use-highlight-drafts.ts` + `reader/HighlightOverlay.tsx`):
draft → committing → persisted (draft removed, persisted annotation replaces
it) or draft → failed → retry/discard. Drafts render immediately as dashed
rects in the page overlay; committing shows solid fill with a "Saving
highlight" status; failure tints the rects destructive and shows keyboard-
operable Retry/Discard buttons under the first rect. All three creation paths
(SelectionPopover swatches, active highlighter, comment submit) funnel through
one `persistDraft` in ReaderShell, which reconstructs the same API payload on
retry. E2E: `e2e/highlight-drafts.spec.ts` fails the first POST, asserts the
failed chip, retries, and asserts recovery.

# Reading position (RD-05)

`lib/reading-position.ts` persists per-paper last page under
`lumen:reading-position:<paperId>` with a probe-backed localStorage wrapper
(memory fallback when storage is unavailable); corrupt entries parse as "no
position". `reader/use-reading-position.ts` resolves the initial page once per
paper (explicit `?page=N` deep link wins over storage), gates all recording on
viewer readiness via ReaderShell's `onReady`, and treats a page-one report as
progress only after another page was seen — load-time page-one signals can't
clobber a stored position. E2E: `e2e/reading-position.spec.ts`.

# Checkpoint D

`e2e/checkpoint-d.spec.ts` runs the full selection/annotation flow against a
stateful in-memory annotations API (collection GET/POST at
`/papers/1/annotations`, item PATCH/DELETE at `/annotations/:id`) across the
gate matrix: pointer create → keyboard edit → deferred delete with keyboard
undo → window expiry commits DELETE, at 1920×1000; narrow desktop (800px) with
inline-marker fallback; and the reader's real 200% zoom step (page outgrows the
gutter, so replay falls back to inline markers). Found and fixed along the way:
AnnotationCard's hover-revealed Edit/Delete controls are now also revealed on
`group-focus-within` so keyboard users can see what they're operating.

# Permissions

`lib/utils/permissions.ts`: `isOwner`/`canEdit`/`canAnnotate`/`isViewer` gate
which actions show (e.g. only owners can share, editors+ can annotate/bookmark
— `ReaderToolbarActions.tsx:101,113`). Mirrors backend
[`services/access`](/backend/services/access.md).