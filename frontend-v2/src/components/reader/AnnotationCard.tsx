import { useEffect, useRef, useState } from "react";
import { CloseIcon, CheckIcon, EditIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ThemeName } from "@/lib/paper-themes";
import { THEME_NAMES, highlightLabel, highlightTheme } from "./highlight-colors";
import type { Annotation } from "@/lib/api/annotations";

export function AnnotationCard({
  annotation,
  active = false,
  compact = false,
  onClick,
  onDelete,
  onUpdateContent,
  onRecolor,
  onRegenerate,
  regenerating = false,
  deleting = false,
}: {
  annotation: Annotation;
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  /** Present → the card offers inline note editing (at-mark). */
  onUpdateContent?: (content: string) => void;
  /** Present → the card offers a recolor swatch row (highlights only). */
  onRecolor?: (color: ThemeName) => void;
  /** Present → the card offers an explicit regeneration action for AI answers. */
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Delete is pending behind an undo window; fade without removing. */
  deleting?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(annotation.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    // Focus after mount so keyboard users land in the textarea directly.
    editRef.current?.focus();
    editRef.current?.setSelectionRange(
      editRef.current.value.length,
      editRef.current.value.length,
    );
  }, [editing]);

  const theme = highlightTheme(
    annotation.highlight_type,
    annotation.selection_data,
  );
  const label = annotation.highlight_type
    ? highlightLabel(annotation.highlight_type)
    : annotation.selection_data?.color
      ? "Highlight"
      : "Note";
  const showQuote =
    annotation.highlighted_text &&
    annotation.highlighted_text !== annotation.content;
  const canRecolor = Boolean(onRecolor) && active && annotation.type !== "note";
  const isAIExplanation =
    annotation.selection_data?.source === "ai_action" &&
    (annotation.highlight_type === "explain" ||
      annotation.highlight_type === "why" ||
      annotation.highlight_type === "define");

  const saveEdit = () => {
    const text = draft.trim();
    setEditing(false);
    if (onUpdateContent && text && text !== annotation.content) {
      onUpdateContent(text);
    }
  };

  const expandText = active;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && event.key === "Enter") onClick();
      }}
      className={cn(
        "group/card rounded-lg border p-2.5 text-left transition-all duration-150",
        onClick && "cursor-pointer",

        expandText &&
          "max-h-[60vh] overflow-y-auto scrollbar-none overscroll-contain",
        compact
          ? cn(
              "ring-1 ring-black/5 backdrop-blur-[2px]",
              active
                ? "z-10 scale-[1.03] shadow-(--shadow-elevated) ring-2"
                : "shadow-(--shadow-elevated) hover:scale-[1.01]",
            )
          : active
            ? "shadow-(--shadow-elevated)"
            : "shadow-(--shadow-subtle)",
        deleting && "pointer-events-none opacity-40",
      )}
      style={{
        backgroundColor: `var(--theme-${theme}-bg)`,
        borderColor: active
          ? `var(--theme-${theme}-action)`
          : `var(--theme-${theme}-border)`,
        ...(active && compact
          ? { ["--tw-ring-color" as string]: `var(--theme-${theme}-action)` }
          : {}),
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-micro font-semibold"
          style={{
            backgroundColor: `var(--theme-${theme}-accent)`,
            color: `var(--theme-${theme}-text)`,
          }}
        >
          {label}
          {annotation.auto_highlighted || isAIExplanation ? " · AI" : ""}
        </span>
        <div className="flex items-center gap-0.5">
          {onRegenerate && isAIExplanation && (
            <button
              type="button"
              disabled={regenerating}
              aria-label="Regenerate explanation"
              aria-busy={regenerating || undefined}
              onClick={(event) => {
                event.stopPropagation();
                onRegenerate();
              }}
              className="rounded p-0.5 opacity-0 transition-opacity group-hover/card:opacity-60 group-focus-within/card:opacity-60! hover:opacity-100! disabled:cursor-wait disabled:opacity-60"
              style={{ color: `var(--theme-${theme}-text)` }}
            >
              <RefreshIcon size="xs" className={regenerating ? "animate-pulse" : undefined} />
            </button>
          )}
          {onUpdateContent && !editing && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setDraft(annotation.content);
                setEditing(true);
              }}
              aria-label="Edit note"
              className="rounded p-0.5 opacity-0 transition-opacity group-hover/card:opacity-60 group-focus-within/card:opacity-60! hover:opacity-100!"
              style={{ color: `var(--theme-${theme}-text)` }}
            >
              <EditIcon size="xs" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              aria-label="Delete annotation"
              className="rounded p-0.5 opacity-0 transition-opacity group-hover/card:opacity-60 group-focus-within/card:opacity-60! hover:opacity-100!"
              style={{ color: `var(--theme-${theme}-text)` }}
            >
              <TrashIcon size="xs" />
            </button>
          )}
        </div>
      </div>

      {showQuote && (
        <p
          className={cn(
            "mb-1 border-l-2 pl-1.5 text-micro italic opacity-70",
            expandText
              ? "whitespace-pre-wrap"
              : compact
                ? "line-clamp-2"
                : "line-clamp-3",
          )}
          style={{
            color: `var(--theme-${theme}-text)`,
            borderColor: `var(--theme-${theme}-action)`,
          }}
        >
          {annotation.highlighted_text}
        </p>
      )}

      {editing ? (
        <div onClick={(event) => event.stopPropagation()}>
          <textarea
            ref={editRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            aria-label="Edit note text"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setEditing(false);
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                saveEdit();
              }
            }}
            className="w-full resize-none rounded-lg border border-(--border) bg-(--white) px-2 py-1.5 text-caption outline-none focus:border-(--foreground)"
            style={{ color: "var(--foreground)" }}
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-caption text-(--muted-foreground) hover:bg-(--accent)"
            >
              <CloseIcon size="xs" /> Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="flex items-center gap-1 rounded bg-(--primary) px-2 py-0.5 text-caption font-medium text-(--primary-foreground) hover:opacity-90"
            >
              <CheckIcon size="xs" /> Save
            </button>
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "text-caption leading-relaxed",
            expandText || !compact ? "whitespace-pre-wrap" : "line-clamp-4",
          )}
          style={{ color: `var(--theme-${theme}-text)` }}
        >
          {annotation.content}
        </p>
      )}

      {canRecolor && (
        <div
          className="mt-1.5 flex items-center gap-1.5 border-t pt-1.5"
          style={{ borderColor: `var(--theme-${theme}-border)` }}
          onClick={(event) => event.stopPropagation()}
        >
          {THEME_NAMES.map((name) => {
            const current = name === theme;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onRecolor?.(name)}
                aria-label={`Recolor ${name}`}
                aria-pressed={current}
                className={cn(
                  "size-4 rounded-full border border-(--border) transition-transform hover:scale-125",
                  current && "ring-2 ring-offset-1 ring-(--foreground)",
                )}
                style={{ backgroundColor: `var(--theme-${name}-action)` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
