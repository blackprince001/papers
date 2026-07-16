import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AnnotationIcon,
  BookOpenIcon,
  ChartBarsIcon,
  EditIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  UserIcon,
  ViewListIcon,
  type IconProps,
} from "@/components/icons";
import {
  referencesApi,
  type ReferenceManifestEntry,
} from "@/lib/api/references";
import { cn } from "@/lib/utils";
import { useReferenceManifest } from "./ReferenceManifestProvider";

interface ReferenceChipProps {
  kind: string;
  id: string;
  label: string;
}

type IconCmp = ComponentType<IconProps>;

const KIND_ICONS: Record<string, IconCmp> = {
  paper: FileTextIcon,
  citation: BookOpenIcon,
  figure: ChartBarsIcon,
  section: ViewListIcon,
  annotation: EditIcon,
  note: AnnotationIcon,
  external: GlobeIcon,
  author: UserIcon,
};

const KIND_LABELS: Record<string, string> = {
  paper: "Paper",
  citation: "Citation",
  figure: "Figure",
  section: "Section",
  annotation: "Annotation",
  note: "Note",
  external: "External",
  author: "Author",
};

// Subtle, theme-aware pill per reference kind: a low-opacity tinted background
// + border in the kind's color, with the icon and label in that kind's readable
// shade (light + dark variants) so the text stays vivid without shouting.
const KIND_STYLE: Record<string, string> = {
  paper:
    "bg-sky-500/10 border-sky-500/25 text-sky-700 dark:bg-sky-400/15 dark:border-sky-400/30 dark:text-sky-300",
  citation:
    "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:bg-amber-400/15 dark:border-amber-400/30 dark:text-amber-300",
  figure:
    "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:bg-emerald-400/15 dark:border-emerald-400/30 dark:text-emerald-300",
  section:
    "bg-violet-500/10 border-violet-500/25 text-violet-700 dark:bg-violet-400/15 dark:border-violet-400/30 dark:text-violet-300",
  annotation:
    "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:bg-rose-400/15 dark:border-rose-400/30 dark:text-rose-300",
  note:
    "bg-orange-500/10 border-orange-500/25 text-orange-700 dark:bg-orange-400/15 dark:border-orange-400/30 dark:text-orange-300",
  external:
    "bg-cyan-500/10 border-cyan-500/25 text-cyan-700 dark:bg-cyan-400/15 dark:border-cyan-400/30 dark:text-cyan-300",
  author:
    "bg-indigo-500/10 border-indigo-500/25 text-indigo-700 dark:bg-indigo-400/15 dark:border-indigo-400/30 dark:text-indigo-300",
};
const DEFAULT_STYLE = "bg-(--muted) border-(--border) text-(--foreground)";

// Text-only kind color for the hover-card icon (the card has a neutral surface).
const KIND_ICON: Record<string, string> = {
  paper: "text-sky-600 dark:text-sky-400",
  citation: "text-amber-600 dark:text-amber-400",
  figure: "text-emerald-600 dark:text-emerald-400",
  section: "text-violet-600 dark:text-violet-400",
  annotation: "text-rose-600 dark:text-rose-400",
  note: "text-orange-600 dark:text-orange-400",
  external: "text-cyan-600 dark:text-cyan-400",
  author: "text-indigo-600 dark:text-indigo-400",
};

const CARD_WIDTH = 288; // 18rem
const VIEWPORT_MARGIN = 8;

interface CardPos {
  top: number;
  left: number;
  width: number;
  placement: "top" | "bottom";
}

function paperIdFromTarget(target: string | null): number | null {
  const m = target?.match(/\/papers\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function useEntry(
  kind: string,
  id: string,
): ReferenceManifestEntry | null | "loading" {
  const context = useReferenceManifest();
  const fromContext = context?.getEntry(kind, id);

  const { data: fetched } = useQuery({
    queryKey: ["ref-resolve", kind, id],
    queryFn: async () => {
      const res = await referencesApi.resolveBatch([{ kind, id }]);
      return res.entries[0] ?? null;
    },
    enabled: !fromContext && !context?.has(kind, id),
    staleTime: 300_000,
  });

  if (fromContext) return fromContext;
  if (fetched === undefined) return "loading";
  return fetched ?? null;
}

export function ReferenceChip({ kind, id, label }: ReferenceChipProps) {
  const entry = useEntry(kind, id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CardPos | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const Icon = KIND_ICONS[kind] ?? FileTextIcon;
  const style = KIND_STYLE[kind] ?? DEFAULT_STYLE;
  const iconTint = KIND_ICON[kind] ?? "text-(--muted-foreground)";
  const kindLabel = KIND_LABELS[kind] ?? kind;

  const resolved = entry !== "loading" && entry !== null ? entry : null;

  const isPlaceholder = !label || label === `${kind}/${id}`;
  const text =
    (!isPlaceholder && label) || resolved?.label || `${kindLabel} ${id}`;
  const target = resolved?.target ?? null;

  const figurePaperId = kind === "figure" ? paperIdFromTarget(target) : null;
  const { data: figureThumb } = useQuery({
    queryKey: ["figure-thumb", figurePaperId, id],
    queryFn: () => referencesApi.figureThumbnail(figurePaperId!, Number(id)),
    enabled:
      open && kind === "figure" && !!figurePaperId && !resolved?.thumbnail_url,
    staleTime: 600_000,
  });
  const thumbnailUrl =
    resolved?.thumbnail_url ?? figureThumb?.thumbnail_url ?? null;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(CARD_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    // Prefer above the chip; flip below when there isn't room.
    const estimatedHeight = 200;
    const placement: "top" | "bottom" =
      r.top > estimatedHeight + VIEWPORT_MARGIN ? "top" : "bottom";
    const top =
      placement === "top"
        ? r.top - VIEWPORT_MARGIN
        : r.bottom + VIEWPORT_MARGIN;
    setPos({ top, left, width, placement });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  const baseChip =
    "inline-flex items-center gap-1 align-middle rounded-md border px-1.5 py-px " +
    "transition-colors " +
    style;

  // Unresolved → quiet, non-interactive (no broken link for a hallucinated id).
  if (entry === null) {
    return (
      <span
        className={cn(baseChip, "opacity-60 cursor-default")}
        title="Reference unavailable"
      >
        <Icon size="xs" filled className="shrink-0 opacity-60" />
        <span className="truncate max-w-[16ch]">{text}</span>
      </span>
    );
  }

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const handleNavigate = () => {
    if (!target) return;
    if (/^https?:\/\//.test(target))
      window.open(target, "_blank", "noopener,noreferrer");
    else navigate(target);
  };

  const card =
    open && resolved && pos
      ? createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 70,
              transform:
                pos.placement === "top" ? "translateY(-100%)" : undefined,
            }}
            className="bg-(--popover) border border-(--border) rounded-card shadow-elevated"
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
          >
            <div className="p-3">
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="w-full h-28 object-contain rounded mb-2 bg-(--muted)"
                />
              )}
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size="xs" filled className={iconTint} />
                <span className="text-[0.625rem] text-(--muted-foreground) uppercase tracking-wider">
                  {kindLabel}
                </span>
              </div>
              <div className="text-code font-semibold leading-snug mb-0.5">
                {resolved.title}
              </div>
              {resolved.subtitle && (
                <div className="text-caption text-(--muted-foreground) mb-1">
                  {resolved.subtitle}
                </div>
              )}
              {resolved.snippet && (
                <div className="text-caption text-(--muted-foreground) leading-relaxed line-clamp-4">
                  {resolved.snippet}
                </div>
              )}
              {target && (
                <button
                  type="button"
                  onClick={handleNavigate}
                  className="mt-2 inline-flex items-center gap-1 text-caption text-(--sky-blue) hover:opacity-80 transition-opacity"
                >
                  {resolved.internal ? "Open" : "View source"}
                  <ExternalLinkIcon size="xs" />
                </button>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        onFocus={openNow}
        onBlur={closeSoon}
        onClick={target ? handleNavigate : undefined}
        className={cn(
          baseChip,
          "hover:border-(--foreground)/40",
          target ? "cursor-pointer" : "cursor-default",
        )}
        title={resolved?.title || text}
      >
        <Icon size="xs" filled className="shrink-0" />
        <span className="truncate max-w-[16ch]">{text}</span>
      </button>
      {card}
    </>
  );
}
