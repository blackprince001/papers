import { TrashIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { highlightLabel, highlightTheme } from "./highlight-colors";
import type { Annotation } from "@/lib/api/annotations";

export function AnnotationCard({
  annotation,
  active = false,
  compact = false,
  onClick,
  onDelete,
}: {
  annotation: Annotation;
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}) {
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
          {annotation.auto_highlighted ? " · AI" : ""}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            aria-label="Delete annotation"
            className="rounded p-0.5 opacity-0 transition-opacity group-hover/card:opacity-60 hover:opacity-100!"
            style={{ color: `var(--theme-${theme}-text)` }}
          >
            <TrashIcon size="xs" />
          </button>
        )}
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

      <p
        className={cn(
          "text-caption leading-relaxed",
          expandText || !compact ? "whitespace-pre-wrap" : "line-clamp-4",
        )}
        style={{ color: `var(--theme-${theme}-text)` }}
      >
        {annotation.content}
      </p>
    </div>
  );
}
