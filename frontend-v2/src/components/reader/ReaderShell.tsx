import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  MaximizeIcon,
  MinimizeIcon,
  WarningIcon,
} from "@/components/icons";
import { annotationsApi, type Annotation } from "@/lib/api/annotations";
import { aiFeaturesApi, type AIActionKind } from "@/lib/api/aiFeatures";
import { type Paper } from "@/lib/api/papers";
import {
  PDFViewer,
  type PDFViewerHandle,
  type PDFViewerPageOverlayProps,
} from "@/components/shadcn/pdf-viewer";
import { canAnnotate } from "@/lib/utils/permissions";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useReader } from "@/contexts/ReaderContext";
import { usePaperFile } from "./use-paper-file";
import {
  annotationPage,
  annotationRects,
  type NormalizedRect,
} from "./annotation-geometry";
import { highlightTheme } from "./highlight-colors";
import type { ThemeName } from "@/lib/paper-themes";
import { AnnotationCard } from "./AnnotationCard";
import { AnnotationMarker } from "./AnnotationMarker";
import { OutlinePanel } from "./OutlinePanel";
import { ReaderToolbarActions } from "./ReaderToolbarActions";
import { HighlighterControl } from "./HighlighterControl";
import { SelectionPopover, type SelectionState } from "./SelectionPopover";

const PDF_DOCUMENT_OPTIONS = {
  cMapPacked: true,
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

const MARGIN_CARD_MAX_WIDTH = 280;
const MARGIN_CARD_MIN_WIDTH = 188;
const MARGIN_CARD_GAP = 12;
const MARGIN_CARD_MIN_HEIGHT = 76;

interface ReaderShellProps {
  paper: Paper;
  annotations: Annotation[];
  onAnnotationSuccess: () => void;
  onCurrentPageChange?: (page: number) => void;
  /** Page to scroll to once the document loads (deep-link from chat refs). */
  initialPage?: number;
  /** Item to focus on load, e.g. "annotation:22" or "note:10". */
  focusRef?: string;
}

export function ReaderShell({
  paper,
  annotations,
  onAnnotationSuccess,
  onCurrentPageChange,
  initialPage,
  focusRef,
}: ReaderShellProps) {
  const queryClient = useQueryClient();
  const { fileUrl, error: fileError } = usePaperFile(paper);
  const viewerRef = useRef<PDFViewerHandle>(null);
  const [pdfProxy, setPdfProxy] = useState<PDFDocumentProxy | null>(null);
  const [activePage, setActivePage] = useState(1);
  const {
    activeAnnotationId,
    setActiveAnnotationId,
    registerScrollCallbacks,
    unregisterScrollCallbacks,
  } = useReader();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [pendingAction, setPendingAction] = useState<AIActionKind | null>(null);

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [highlighterActive, setHighlighterActive] = useState(false);
  const [highlighterColor, setHighlighterColor] = useState<ThemeName>(
    "yellow" as ThemeName,
  );

  const [zen, setZen] = useState(false);
  const ZEN_ZOOM = 1.5;
  const preZenZoomRef = useRef<number | null>(null);
  const preZenSidebarOpenRef = useRef<boolean | null>(null);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (zen) {
      preZenZoomRef.current = viewer.getZoom();
      viewer.setZoom(Math.max(viewer.getZoom(), ZEN_ZOOM));
      preZenSidebarOpenRef.current = viewer.getThumbnailSidebarOpen();
      viewer.setThumbnailSidebarOpen(false);
    } else {
      if (preZenZoomRef.current !== null) {
        viewer.setZoom(preZenZoomRef.current);
        preZenZoomRef.current = null;
      }
      if (preZenSidebarOpenRef.current !== null) {
        viewer.setThumbnailSidebarOpen(preZenSidebarOpenRef.current);
        preZenSidebarOpenRef.current = null;
      }
    }
  }, [zen]);
  useEffect(() => {
    if (!zen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zen]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fileUrl]);

  const highlights = useMemo(
    () =>
      annotations.filter(
        (a) => a.type !== "note" && annotationRects(a).length > 0,
      ),
    [annotations],
  );

  const byPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const ann of highlights) {
      const page = annotationPage(ann);
      if (page === null) continue;
      if (!map.has(page)) map.set(page, []);
      map.get(page)!.push(ann);
    }
    return map;
  }, [highlights]);

  const scrollToAnnotation = useCallback((annotation: Annotation) => {
    const page = annotationPage(annotation);
    const rect = annotationRects(annotation)[0];
    if (page === null) return;
    setActiveAnnotationId(annotation.id);
    viewerRef.current?.scrollToPageArea(
      page,
      rect
        ? {
            left: rect.left * 100,
            top: rect.top * 100,
            width: rect.width * 100,
            height: rect.height * 100,
          }
        : { top: 0 },
      { behavior: "smooth" },
    );
  }, []);

  useEffect(() => {
    registerScrollCallbacks({ scrollToAnnotation });
    return () => unregisterScrollCallbacks();
  }, [scrollToAnnotation, registerScrollCallbacks, unregisterScrollCallbacks]);

  const deepLinkDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pdfProxy) return;
    const targetKey = `${initialPage ?? ""}|${focusRef ?? ""}`;
    if (targetKey === "|" || deepLinkDoneRef.current === targetKey) return;

    const focused = focusRef
      ? annotations.find((a) => `${a.type}:${a.id}` === focusRef)
      : undefined;

    if (focusRef && !focused && annotations.length === 0 && !initialPage)
      return;

    const page = focused ? annotationPage(focused) : (initialPage ?? null);
    if (!page) {
      deepLinkDoneRef.current = targetKey;
      return;
    }
    deepLinkDoneRef.current = targetKey;

    if (focused) setActiveAnnotationId(focused.id);
    const rect = focused ? annotationRects(focused)[0] : undefined;
    const area = rect
      ? {
          left: rect.left * 100,
          top: rect.top * 100,
          width: rect.width * 100,
          height: rect.height * 100,
        }
      : { top: 0 };

    const timers = [60, 280, 600].map((d) =>
      window.setTimeout(() => {
        viewerRef.current?.scrollToPageArea(page, area, { behavior: "auto" });
      }, d),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [pdfProxy, initialPage, focusRef, annotations, setActiveAnnotationId]);

  const invalidateAnnotations = () => {
    void queryClient.invalidateQueries({ queryKey: ["annotations", paper.id] });
    onAnnotationSuccess();
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => annotationsApi.delete(id),
    onSuccess: invalidateAnnotations,
    onError: () => toastError("Failed to delete annotation"),
  });

  const handleAIAction = async (kind: AIActionKind) => {
    if (!selection) return;
    setPendingAction(kind);
    try {
      const annotation = await aiFeaturesApi.aiAction(paper.id, {
        action: kind,
        selection_text: selection.text,
        page: selection.page,
        rects: selection.rects,
      });
      invalidateAnnotations();
      setSelection(null);
      setActiveAnnotationId(annotation.id);
      toastSuccess("Saved as annotation");
    } catch (error) {
      toastError(`AI action failed: ${(error as Error).message}`);
    } finally {
      setPendingAction(null);
    }
  };

  const handleComment = async (text: string) => {
    if (!selection) return;
    try {
      const annotation = await annotationsApi.create({
        paper_id: paper.id,
        content: text,
        type: "annotation",
        highlighted_text: selection.text,
        selection_data: { rects: selection.rects },
        coordinate_data: {
          page: selection.page,
          x: selection.rects[0]
            ? selection.rects[0].left + selection.rects[0].width / 2
            : 0.5,
          y: selection.rects[0]?.top ?? 0,
        },
      });
      invalidateAnnotations();
      setSelection(null);
      setActiveAnnotationId(annotation.id);
    } catch {
      toastError("Failed to save comment");
    }
  };

  /** Create a color-only highlight annotation from text selection. */
  const createHighlight = useCallback(
    async (color: ThemeName, sel: SelectionState) => {
      try {
        const annotation = await annotationsApi.create({
          paper_id: paper.id,
          content: sel.text,
          type: "annotation",
          highlighted_text: sel.text,
          selection_data: { rects: sel.rects, color },
          coordinate_data: {
            page: sel.page,
            x: sel.rects[0] ? sel.rects[0].left + sel.rects[0].width / 2 : 0.5,
            y: sel.rects[0]?.top ?? 0,
          },
        });
        invalidateAnnotations();
        setSelection(null);
        setActiveAnnotationId(annotation.id);
      } catch {
        toastError("Failed to create highlight");
      }
    },
    [paper.id, invalidateAnnotations],
  );

  /** Called from SelectionPopover swatch row. */
  const handleHighlight = useCallback(
    (color: ThemeName) => {
      if (!selection) return;
      void createHighlight(color, selection);
    },
    [selection, createHighlight],
  );

  /* ── text selection capture ─────────────────────────────────────────── */

  const handlePagePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => {
      if (!canAnnotate(paper)) return;
      const pageElement = event.currentTarget;

      // The browser finalizes the selection after pointerup.
      window.setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!pageElement.contains(range.commonAncestorContainer)) return;
        const text = range.toString().trim();
        if (!text) return;

        const reference = pageElement.querySelector("canvas") ?? pageElement;
        const pageRect = reference.getBoundingClientRect();
        if (pageRect.width === 0 || pageRect.height === 0) return;

        const rects: NormalizedRect[] = [];
        const clientRects = range.getClientRects();
        for (const r of clientRects) {
          if (r.width < 1 || r.height < 1) continue;
          const left = Math.max(
            0,
            Math.min(1, (r.left - pageRect.left) / pageRect.width),
          );
          const top = Math.max(
            0,
            Math.min(1, (r.top - pageRect.top) / pageRect.height),
          );
          const right = Math.max(
            0,
            Math.min(1, (r.right - pageRect.left) / pageRect.width),
          );
          const bottom = Math.max(
            0,
            Math.min(1, (r.bottom - pageRect.top) / pageRect.height),
          );
          rects.push({ left, top, width: right - left, height: bottom - top });
        }
        if (rects.length === 0) return;

        // Instant highlight when toolbar highlighter is active.
        if (highlighterActive) {
          void createHighlight(highlighterColor, {
            page: pageNumber,
            text,
            rects,
            clientX: 0,
            clientY: 0,
          });
          return;
        }

        const selectionRect = range.getBoundingClientRect();
        setSelection({
          page: pageNumber,
          text,
          rects,
          clientX: (selectionRect.left + selectionRect.right) / 2,
          clientY: selectionRect.bottom,
        });
      }, 0);
    },
    [paper, highlighterActive, highlighterColor, createHighlight],
  );

  const renderPageOverlay = useCallback(
    ({
      pageNumber,
      pageWidth,
      pageHeight,
      scale,
    }: PDFViewerPageOverlayProps) => {
      const pageAnnotations = byPage.get(pageNumber) ?? [];
      const renderedWidth = pageWidth * scale;
      const renderedHeight = pageHeight * scale;

      const sideGutter = (containerWidth - renderedWidth) / 2;
      const marginMode =
        !zen && sideGutter >= MARGIN_CARD_MIN_WIDTH + MARGIN_CARD_GAP * 2;
      const cardWidth = Math.min(
        MARGIN_CARD_MAX_WIDTH,
        Math.max(
          MARGIN_CARD_MIN_WIDTH,
          Math.floor(sideGutter - MARGIN_CARD_GAP * 2),
        ),
      );

      const cursorY = { left: 0, right: 0 };
      const placed = marginMode
        ? pageAnnotations
            .map((ann) => ({ ann, rect: annotationRects(ann)[0] }))
            .filter((p): p is { ann: Annotation; rect: NormalizedRect } =>
              Boolean(p.rect),
            )
            .map(({ ann, rect }) => {
              const side: "left" | "right" =
                cursorY.left <= cursorY.right ? "left" : "right";
              const anchorY = rect.top * renderedHeight;
              const top = Math.max(anchorY, cursorY[side]);
              cursorY[side] = top + MARGIN_CARD_MIN_HEIGHT + MARGIN_CARD_GAP;
              return { ann, rect, top, side };
            })
        : [];

      return (
        <>
          {/* Highlight rects */}
          {pageAnnotations.map((ann) => {
            const theme = highlightTheme(
              ann.highlight_type,
              ann.selection_data,
            );
            return annotationRects(ann).map((rect, i) => (
              <button
                key={`${ann.id}-${i}`}
                type="button"
                aria-label="Annotation highlight"
                onClick={() => {
                  setActiveAnnotationId(ann.id);
                }}
                className={cn(
                  "absolute rounded-[2px] transition-opacity",
                  isDark ? "mix-blend-screen" : "mix-blend-multiply",
                  activeAnnotationId === ann.id
                    ? "opacity-90"
                    : "opacity-60 hover:opacity-80",
                )}
                style={{
                  left: `${rect.left * 100}%`,
                  top: `${rect.top * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  backgroundColor: `var(--theme-${theme}-action)`,
                }}
              />
            ));
          })}

          {marginMode ? (
            <>
              {/* Leader lines from highlight → margin card */}
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
              >
                {placed.map(({ ann, rect, top, side }) => {
                  const theme = highlightTheme(
                    ann.highlight_type,
                    ann.selection_data,
                  );
                  const y1 = (rect.top + rect.height / 2) * renderedHeight;
                  const y2 = top + 16;
                  const x1 =
                    side === "right"
                      ? (rect.left + rect.width) * renderedWidth
                      : rect.left * renderedWidth;
                  const x2 =
                    side === "right"
                      ? renderedWidth + MARGIN_CARD_GAP
                      : -MARGIN_CARD_GAP;
                  return (
                    <path
                      key={ann.id}
                      d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      strokeWidth={1.25}
                      style={{ stroke: `var(--theme-${theme}-action)` }}
                      opacity={activeAnnotationId === ann.id ? 0.95 : 0.5}
                    />
                  );
                })}
              </svg>
              {placed.map(({ ann, top, side }) => (
                <div
                  key={ann.id}
                  className="absolute"
                  style={{
                    top,
                    width: cardWidth,
                    zIndex: activeAnnotationId === ann.id ? 40 : 20,
                    ...(side === "right"
                      ? { left: renderedWidth + MARGIN_CARD_GAP }
                      : { right: renderedWidth + MARGIN_CARD_GAP }),
                  }}
                >
                  <AnnotationCard
                    annotation={ann}
                    active={activeAnnotationId === ann.id}
                    compact
                    onClick={() => setActiveAnnotationId(ann.id)}
                    onDelete={
                      canAnnotate(paper)
                        ? () => deleteMutation.mutate(ann.id)
                        : undefined
                    }
                  />
                </div>
              ))}
            </>
          ) : (
            /* Inline anchored note markers (popover on hover / click to pin) */
            pageAnnotations.map((ann) => {
              const rect = annotationRects(ann)[0];
              if (!rect) return null;
              return (
                <AnnotationMarker
                  key={ann.id}
                  annotation={ann}
                  rect={rect}
                  active={activeAnnotationId === ann.id}
                  onSelect={() => setActiveAnnotationId(ann.id)}
                  onClose={() => setActiveAnnotationId(null)}
                  onDelete={
                    canAnnotate(paper)
                      ? () => deleteMutation.mutate(ann.id)
                      : undefined
                  }
                />
              );
            })
          )}
        </>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byPage, activeAnnotationId, paper, isDark, containerWidth, zen],
  );

  /* ── render ─────────────────────────────────────────────────────────── */

  if (fileError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <WarningIcon
          size={40}
          className="mb-3 text-(--destructive) opacity-30"
        />
        <p className="text-body text-(--muted-foreground)">{fileError}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full",
        zen
          ? "fixed inset-0 z-50 h-screen bg-(--background) p-2"
          : "h-full pb-3",
      )}
    >
      {fileUrl ? (
        <div className="h-full" data-reader-dark={isDark || undefined}>
          <PDFViewer
            ref={viewerRef}
            file={fileUrl}
            documentOptions={PDF_DOCUMENT_OPTIONS}
            showUpload={false}
            toolbarActions={
              <ReaderToolbarActions
                paper={paper}
                currentPage={activePage}
                onPaperChanged={onAnnotationSuccess}
              />
            }
            renderPageOverlay={renderPageOverlay}
            onPagePointerUp={handlePagePointerUp}
            onDocumentProxy={setPdfProxy}
            onActivePageChange={(page) => {
              setActivePage(page);
              onCurrentPageChange?.(page);
            }}
            // PAPERS-FORK: render outline in sidebar
            outlinePanel={
              <OutlinePanel
                pdf={pdfProxy}
                activePage={activePage}
                onNavigate={(page) =>
                  viewerRef.current?.scrollToPageArea(
                    page,
                    { top: 0 },
                    { behavior: "smooth" },
                  )
                }
              />
            }
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8">
          <Skeleton className="h-full w-full max-w-3xl rounded-2xl" />
        </div>
      )}

      {fileUrl && canAnnotate(paper) && (
        <div className="absolute bottom-6 right-6 z-40">
          <HighlighterControl
            active={highlighterActive}
            color={highlighterColor}
            onToggle={() => setHighlighterActive((v) => !v)}
            onColorChange={setHighlighterColor}
          />
        </div>
      )}

      {fileUrl && (
        <button
          type="button"
          onClick={() => setZen((v) => !v)}
          aria-label={zen ? "Exit zen reading mode" : "Enter zen reading mode"}
          title={zen ? "Exit zen mode (Esc)" : "Zen reading mode"}
          className={cn(
            "absolute bottom-6 left-6 z-40 flex size-10 items-center justify-center",
            "rounded-full border border-(--border) bg-(--popover) text-(--muted-foreground)",
            "shadow-(--shadow-elevated) transition-colors hover:text-(--foreground)",
          )}
        >
          {zen ? <MinimizeIcon size="md" /> : <MaximizeIcon size="md" />}
        </button>
      )}

      {selection && (
        <SelectionPopover
          selection={selection}
          pendingAction={pendingAction}
          onAIAction={(kind) => void handleAIAction(kind)}
          onHighlight={handleHighlight}
          onComment={(text) => void handleComment(text)}
          onClose={() => {
            if (!pendingAction) setSelection(null);
          }}
        />
      )}
    </div>
  );
}
