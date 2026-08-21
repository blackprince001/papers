import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  MaximizeIcon,
  MinimizeIcon,
  WarningIcon,
} from "@/components/icons";
import {
  annotationsApi,
  type Annotation,
  type AnnotationUpdate,
} from "@/lib/api/annotations";
import { aiFeaturesApi, type AIActionKind } from "@/lib/api/aiFeatures";
import { type Paper } from "@/lib/api/papers";
import { PDFViewer } from "@/components/shadcn/pdf-viewer";
import type {
  ReaderPageMetrics,
  ReaderPageOverlayProps,
  ReaderViewerHandle,
} from "./viewer-contract";
import { canAnnotate } from "@/lib/utils/permissions";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useReader } from "@/contexts/ReaderContext";
import { usePaperFile } from "./use-paper-file";
import { useDeferredDelete } from "@/hooks/use-deferred-delete";
import { UndoNotice } from "@/components/ui/UndoNotice";
import {
  annotationPage,
  annotationRects,
  rectFromCanonical,
  rectToCanonical,
  renderedPageSize,
  validateNormalizedRect,
  type NormalizedRect,
} from "./annotation-geometry";
import type { ThemeName } from "@/lib/paper-themes";
import { HighlightOverlay } from "./HighlightOverlay";
import type { HighlightDraft } from "./use-highlight-drafts";
import { useHighlightDrafts } from "./use-highlight-drafts";
import { AnnotationMarker } from "./AnnotationMarker";
import { MarginNotes } from "./MarginNotes";
import { MARGIN_CARD_GAP } from "./margin-placement";
import { OutlinePanel } from "./OutlinePanel";
import { ReaderToolbarActions } from "./ReaderToolbarActions";
import { HighlighterControl } from "./HighlighterControl";

/** Stable empty reference so overlay props don't churn. */
const EMPTY_DRAFTS: HighlightDraft[] = [];
import { SelectionPopover, type SelectionState } from "./SelectionPopover";

const PDF_DOCUMENT_OPTIONS = {
  cMapPacked: true,
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

const MARGIN_CARD_MAX_WIDTH = 280;
const MARGIN_CARD_MIN_WIDTH = 188;

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
  const viewerRef = useRef<ReaderViewerHandle>(null);
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
  // Card currently hovered/focused in the margin; its highlight rects link.
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<number | null>(
    null,
  );

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
    // Scroll areas are percent of the DISPLAYED page box; stored rects are
    // canonical, so convert using the page's current effective rotation.
    const rotation =
      viewerRef.current?.getPageMetrics(page)?.rotation ?? 0;
    const displayed = rect ? rectFromCanonical(rect, rotation) : undefined;
    viewerRef.current?.scrollToPageArea(
      page,
      displayed
        ? {
            left: displayed.left * 100,
            top: displayed.top * 100,
            width: displayed.width * 100,
            height: displayed.height * 100,
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
    const rotation =
      viewerRef.current?.getPageMetrics(page)?.rotation ?? 0;
    const displayed = rect ? rectFromCanonical(rect, rotation) : undefined;
    const area = displayed
      ? {
          left: displayed.left * 100,
          top: displayed.top * 100,
          width: displayed.width * 100,
          height: displayed.height * 100,
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

  const { drafts, draftsByPage, addDraft, setDraftStatus, removeDraft } =
    useHighlightDrafts();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => annotationsApi.delete(id),
    onSuccess: invalidateAnnotations,
    onError: () => toastError("Failed to delete annotation"),
  });

  // Deletes wait behind a five-second undo window before hitting the API;
  // unmount commits whatever is still pending so intent is never lost.
  const {
    pendingItem: deletingId,
    schedule: scheduleDelete,
    undo: undoDelete,
  } = useDeferredDelete<number>({
    onDelete: (id) => deleteMutation.mutate(id),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: AnnotationUpdate }) =>
      annotationsApi.update(id, updates),
    onSuccess: invalidateAnnotations,
    onError: () => toastError("Failed to update annotation"),
  });

  /** At-mark note editing (AnnotationCard inline editor). */
  const handleUpdateContent = useCallback((id: number, content: string) => {
    updateMutation.mutate({ id, updates: { content } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** At-mark recolor; selection_data.color overrides the type theme. */
  const handleRecolor = useCallback((ann: Annotation, color: ThemeName) => {
    updateMutation.mutate({
      id: ann.id,
      updates: { selection_data: { ...ann.selection_data, color } },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * Persist one draft annotation through its visible lifecycle:
   * committing → removed on success (the persisted copy replaces it) or
   * failed with retry/discard offered in the overlay.
   */
  const persistDraft = useCallback(
    async (draft: HighlightDraft) => {
      setDraftStatus(draft.id, "committing");
      try {
        const annotation = await annotationsApi.create({
          paper_id: paper.id,
          content: draft.text,
          type: "annotation",
          highlighted_text: draft.text,
          selection_data: draft.color
            ? { rects: draft.rects, color: draft.color }
            : { rects: draft.rects },
          coordinate_data: {
            page: draft.page,
            x: draft.rects[0]
              ? draft.rects[0].left + draft.rects[0].width / 2
              : 0.5,
            y: draft.rects[0]?.top ?? 0,
          },
        });
        removeDraft(draft.id);
        invalidateAnnotations();
        setActiveAnnotationId(annotation.id);
      } catch {
        setDraftStatus(draft.id, "failed");
        toastError(
          draft.kind === "comment"
            ? "Failed to save comment"
            : "Failed to save highlight",
        );
      }
    },
    [paper.id, invalidateAnnotations, setDraftStatus, removeDraft],
  );

  /** Create a color-only highlight annotation from a selection via a draft. */
  const createHighlight = useCallback(
    (color: ThemeName, sel: SelectionState) => {
      const draft = addDraft({
        kind: "highlight",
        page: sel.page,
        rects: sel.rects,
        color,
        text: sel.text,
      });
      void persistDraft(draft);
    },
    [addDraft, persistDraft],
  );

  /** Called from SelectionPopover swatch row. */
  const handleHighlight = useCallback(
    (color: ThemeName) => {
      if (!selection) return;
      createHighlight(color, selection);
      setSelection(null);
    },
    [selection, createHighlight],
  );

  const handleComment = useCallback(
    (text: string) => {
      if (!selection) return;
      const draft = addDraft({
        kind: "comment",
        page: selection.page,
        rects: selection.rects,
        text,
      });
      void persistDraft(draft);
      setSelection(null);
    },
    [selection, addDraft, persistDraft],
  );

  const retryDraft = useCallback(
    (id: string) => {
      const draft = drafts.find((d) => d.id === id);
      if (draft) void persistDraft(draft);
    },
    [drafts, persistDraft],
  );

  const discardDraft = useCallback(
    (id: string) => {
      removeDraft(id);
    },
    [removeDraft],
  );

  /* ── text selection capture ─────────────────────────────────────────── */

  const handlePagePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, metrics: ReaderPageMetrics) => {
      if (!canAnnotate(paper)) return;
      const pageNumber = metrics.pageNumber;
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

        // Capture happens in DISPLAYED space (the canvas is rendered with the
        // page's effective rotation applied). Stored rects are canonical
        // (unrotated page fractions), so convert before persisting — see
        // annotation-geometry.ts.
        const rects: NormalizedRect[] = [];
        const clientRects = range.getClientRects();
        for (const r of clientRects) {
          if (r.width < 1 || r.height < 1) continue;
          const displayed: NormalizedRect = {
            left: Math.max(
              0,
              Math.min(1, (r.left - pageRect.left) / pageRect.width),
            ),
            top: Math.max(
              0,
              Math.min(1, (r.top - pageRect.top) / pageRect.height),
            ),
            width: 0,
            height: 0,
          };
          displayed.width = Math.max(
            0,
            Math.min(1, (r.right - pageRect.left) / pageRect.width) -
              displayed.left,
          );
          displayed.height = Math.max(
            0,
            Math.min(1, (r.bottom - pageRect.top) / pageRect.height) -
              displayed.top,
          );
          const valid = validateNormalizedRect(displayed);
          if (!valid) continue;
          rects.push(rectToCanonical(valid, metrics.rotation));
        }
        if (rects.length === 0) return;

        // Instant highlight when toolbar highlighter is active.
        if (highlighterActive) {
          createHighlight(highlighterColor, {
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
    (props: ReaderPageOverlayProps) => {
      const { pageNumber, rotation } = props;
      const pageAnnotations = byPage.get(pageNumber) ?? [];
      // Contract metrics are unrotated at scale 1; derive the rendered box
      // (quarter turns swap width/height) in one place.
      const { width: renderedWidth, height: renderedHeight } =
        renderedPageSize(props.pageWidth, props.pageHeight, props.scale, rotation);
      // Stored rects are canonical (unrotated) fractions; overlays position in
      // percent of the DISPLAYED page box, so convert with this page's rotation.
      const displayedRect = (rect: NormalizedRect): NormalizedRect =>
        rectFromCanonical(rect, rotation);

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

      return (
        <>
          {/* Persisted highlights + in-flight drafts */}
          <HighlightOverlay
            annotations={pageAnnotations}
            drafts={draftsByPage.get(pageNumber) ?? EMPTY_DRAFTS}
            rotation={rotation}
            activeAnnotationId={activeAnnotationId}
            isDark={isDark}
            onSelectAnnotation={setActiveAnnotationId}
            onRetryDraft={retryDraft}
            onDiscardDraft={discardDraft}
            deletingAnnotationId={deletingId}
            linkedAnnotationId={hoveredAnnotationId}
          />

          {marginMode ? (
            /* Measured two-column stacking in the gutters */
            <MarginNotes
              annotations={pageAnnotations}
              rotation={rotation}
              renderedWidth={renderedWidth}
              renderedHeight={renderedHeight}
              cardWidth={cardWidth}
              activeAnnotationId={activeAnnotationId}
              deletingAnnotationId={deletingId}
              onSelectAnnotation={setActiveAnnotationId}
              onHoverAnnotation={setHoveredAnnotationId}
              onDelete={canAnnotate(paper) ? (ann) => scheduleDelete(ann.id) : undefined}
              onUpdateContent={
                canAnnotate(paper)
                  ? (ann, content) => handleUpdateContent(ann.id, content)
                  : undefined
              }
              onRecolor={canAnnotate(paper) ? handleRecolor : undefined}
            />
          ) : (
            /* Inline anchored note markers (popover on hover / click to pin) */
            pageAnnotations.map((ann) => {
              const canonical = annotationRects(ann)[0];
              if (!canonical) return null;
              const rect = displayedRect(canonical);
              return (
                <AnnotationMarker
                  key={ann.id}
                  annotation={ann}
                  rect={rect}
                  active={activeAnnotationId === ann.id}
                  onSelect={() => setActiveAnnotationId(ann.id)}
                  onClose={() => setActiveAnnotationId(null)}
                  deleting={deletingId === ann.id}
                  onDelete={
                    canAnnotate(paper)
                      ? () => scheduleDelete(ann.id)
                      : undefined
                  }
                  onUpdateContent={
                    canAnnotate(paper)
                      ? (content) => handleUpdateContent(ann.id, content)
                      : undefined
                  }
                  onRecolor={
                    canAnnotate(paper)
                      ? (color) => handleRecolor(ann, color)
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
    [
      byPage,
      activeAnnotationId,
      paper,
      isDark,
      containerWidth,
      zen,
      draftsByPage,
      retryDraft,
      discardDraft,
      deletingId,
      scheduleDelete,
      handleUpdateContent,
      handleRecolor,
    ],
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

      {fileUrl && deletingId !== null && (
        <UndoNotice message="Highlight deleted" onUndo={undoDelete} />
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
