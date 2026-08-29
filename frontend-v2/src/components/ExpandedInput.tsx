import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ComponentType,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { annotationsApi } from "@/lib/api/annotations";
import { papersApi } from "@/lib/api/papers";
import {
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  LibraryIcon,
  NoteIcon,
  type IconProps,
} from "@/components/icons";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

interface MentionItem {
  id: number;
  type: "note" | "annotation" | "paper";
  display: string;
  content?: string;
  title?: string;
}

interface SuggestionPrompt {
  icon: ComponentType<IconProps>;
  text: string;
  prompt: string;
}

export interface PromptGroup {
  label: string;
  icon: ComponentType<IconProps>;
  prompts: SuggestionPrompt[];
}

export interface ExpandedInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  size?: "default" | "compact";
  bordered?: boolean;
  submitLabel?: string;
  submitIcon?: ReactNode;
  suggestions?: SuggestionPrompt[];
  onSuggestionClick?: (prompt: string) => void;
  promptsCollapsible?: boolean;
  promptGroups?: PromptGroup[];
  mentionPaperId?: number;
  onMentionSelect?: (mention: MentionItem) => void;
  children?: ReactNode;
  className?: string;
}

// Same tint convention as ReferenceChip, so an in-progress mention reads
// as the same "reference" affordance once it's sent and rendered.
const MENTION_TINT: Record<string, string> = {
  note: "text-(--coral-red)",
  annotation: "text-rose-600",
  paper: "text-sky-600",
};

// Order matters: mention | bold | inline-code | link | heading-line.
const HIGHLIGHT_RE =
  /(@(?:note|annotation|paper)\{\d+\})|(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\n]+\))|(^#{1,6} .*$)/gm;

function highlightContent(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(HIGHLIGHT_RE);
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) nodes.push(value.slice(last, m.index));
    const [full, mention, bold, code, link, heading] = m;
    if (mention) {
      const type = full.slice(1, full.indexOf("{")) as
        | "note"
        | "annotation"
        | "paper";
      // No icon in the overlay: the highlight must stay character-for-
      // character identical to the invisible textarea value, and a hanging
      // icon overlaps whatever precedes the token. Tint + underline are
      // enough to mark the mention.
      nodes.push(
        <span
          key={key++}
          className={cn("border-b border-dotted border-(--border)", MENTION_TINT[type])}
        >
          {full}
        </span>,
      );
    } else if (bold) {
      nodes.push(
        <span key={key++} className="text-violet-600">
          {full}
        </span>,
      );
    } else if (code) {
      nodes.push(
        <span key={key++} className="text-emerald-700">
          {full}
        </span>,
      );
    } else if (link) {
      nodes.push(
        <span key={key++} className="text-(--sky-blue)">
          {full}
        </span>,
      );
    } else if (heading) {
      nodes.push(
        <span key={key++} className="text-(--warning)">
          {full}
        </span>,
      );
    }
    last = m.index + full.length;
  }
  if (last < value.length) nodes.push(value.slice(last));
  // Trailing zero-width char keeps the final (possibly empty) line measured.
  nodes.push("​");
  return nodes;
}

export function ExpandedInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask anything",
  disabled,
  loading,
  autoFocus,
  size = "default",
  bordered = true,
  submitLabel,
  submitIcon,
  suggestions,
  onSuggestionClick,
  promptsCollapsible,
  promptGroups,
  mentionPaperId,
  onMentionSelect,
  children,
  className,
}: ExpandedInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keep the highlight overlay scrolled in lockstep with the textarea.
  const syncScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // @mention state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ start: 0, end: 0 });
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  // Debounced so the paper search below doesn't fire a request per keystroke.
  const [debouncedMentionQuery, setDebouncedMentionQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMentionQuery(mentionQuery), 250);
    return () => clearTimeout(timer);
  }, [mentionQuery]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Fetch mention data when paperId is provided
  const { data: annotations } = useQuery({
    queryKey: ["annotations", mentionPaperId],
    queryFn: () => annotationsApi.list(mentionPaperId!),
    enabled: !!mentionPaperId,
  });

  // Searches the whole library server-side (title + content) rather than
  // filtering a fixed local batch — otherwise a paper outside the first page
  // just never shows up here no matter what you type.
  const { data: papersData } = useQuery({
    queryKey: ["papers", "mention-search", debouncedMentionQuery],
    queryFn: () => papersApi.list(1, 20, debouncedMentionQuery || undefined),
    enabled: !!mentionPaperId,
  });

  // Notes/annotations have no server-side search, so they're filtered
  // client-side against the current paper's full (usually small) list.
  const buildNoteAndAnnotationItems = useCallback((): MentionItem[] => {
    if (!mentionPaperId || !annotations) return [];
    const items: MentionItem[] = [];

    annotations
      .filter((a) => a.type === "note")
      .forEach((note) => {
        const page = note.coordinate_data?.page;
        items.push({
          id: note.id,
          type: "note",
          display: `Note ${note.id}${page ? ` (Page ${page})` : ""}`,
          content: note.content,
        });
      });

    annotations
      .filter((a) => a.type === "annotation")
      .forEach((ann) => {
        const page = ann.coordinate_data?.page;
        const preview = ann.highlighted_text || ann.content?.substring(0, 50);
        items.push({
          id: ann.id,
          type: "annotation",
          display: `Annotation ${ann.id}${page ? ` (Page ${page})` : ""}: ${preview}...`,
          content: ann.content,
        });
      });

    return items;
  }, [annotations, mentionPaperId]);

  const noteAndAnnotationItems = buildNoteAndAnnotationItems();
  const filteredNoteAndAnnotationItems = mentionQuery
    ? noteAndAnnotationItems.filter((item) =>
        item.display.toLowerCase().includes(mentionQuery.toLowerCase()),
      )
    : noteAndAnnotationItems;

  // Papers are already server-filtered by the search query above (title +
  // content), so they're used as-is — re-filtering by `display` client-side
  // would incorrectly drop matches that only hit in the paper's content.
  const paperItems: MentionItem[] = !mentionPaperId
    ? []
    : (papersData?.papers ?? [])
        .filter((p) => p.id !== mentionPaperId)
        .map((paper) => ({
          id: paper.id,
          type: "paper" as const,
          display: `Paper: ${paper.title}`,
          title: paper.title,
        }));

  const filteredMentionItems = [...filteredNoteAndAnnotationItems, ...paperItems];

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (!mentionPaperId) return;

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionQuery(textAfterAt);
        setMentionPosition({ start: lastAtIndex, end: cursorPos });
        setShowMentionDropdown(true);
        setSelectedMentionIndex(0);
        return;
      }
    }

    setShowMentionDropdown(false);
    setMentionQuery("");
  };

  const handleMentionSelect = (item: MentionItem) => {
    const beforeMention = value.substring(0, mentionPosition.start);
    const afterMention = value.substring(mentionPosition.end);
    const mentionText = `@${item.type}{${item.id}}`;
    const newValue = beforeMention + mentionText + afterMention;

    onChange(newValue);
    setShowMentionDropdown(false);
    setMentionQuery("");

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + mentionText.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);

    onMentionSelect?.(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showMentionDropdown && filteredMentionItems.length > 0) {
        handleMentionSelect(filteredMentionItems[selectedMentionIndex]);
      } else {
        onSubmit();
      }
      return;
    }

    if (showMentionDropdown && filteredMentionItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex(
          (prev) => (prev + 1) % filteredMentionItems.length,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex(
          (prev) =>
            (prev - 1 + filteredMentionItems.length) %
            filteredMentionItems.length,
        );
      } else if (e.key === "Escape") {
        setShowMentionDropdown(false);
        setMentionQuery("");
      }
    }
  };

  const handlePromptClick = (prompt: string) => {
    onChange(prompt);
    onSuggestionClick?.(prompt);
    textareaRef.current?.focus();
  };

  // Close mention dropdown on outside click
  useEffect(() => {
    if (!showMentionDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    };
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMentionDropdown]);

  // Scroll selected mention into view
  useEffect(() => {
    if (showMentionDropdown && mentionDropdownRef.current) {
      const selected = mentionDropdownRef.current.querySelector(
        `[data-index="${selectedMentionIndex}"]`,
      );
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedMentionIndex, showMentionDropdown]);

  const getMentionIcon = (type: MentionItem["type"]) => {
    switch (type) {
      case "note":
        return <NoteIcon size="sm" />;
      case "annotation":
        return <FileTextIcon size="sm" />;
      case "paper":
        return <LibraryIcon size="sm" />;
    }
  };

  const isCompact = size === "compact";

  const SHARED_BOX = cn(
    "w-full whitespace-pre-wrap wrap-break-word text-code",
    isCompact
      ? "p-3 min-h-[2.25rem] rounded-xl"
      : "p-4 min-h-[3.025rem] max-h-[16.125rem] leading-[1.75]",
  );

  const renderSuggestions = () => {
    const hasPrompts = (suggestions?.length || promptGroups?.length) ?? false;
    if (!hasPrompts) return null;

    // Collapsible mode — prompts show in a Popover from the toolbar, not inline
    if (promptsCollapsible) return null;

    return (
      <div className="flex flex-wrap justify-center gap-2">
        {promptGroups && promptGroups.length > 0
          ? promptGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.label} className="w-full">
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <GroupIcon
                      size="xs"
                      className="text-(--muted-foreground) shrink-0"
                    />
                    <span className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.prompts.map((suggestion) => {
                      const IconComponent = suggestion.icon;
                      return (
                        <button
                          key={suggestion.text}
                          type="button"
                          disabled={disabled}
                          onClick={() => handlePromptClick(suggestion.prompt)}
                          className="group flex items-center gap-2 rounded-full border border-(--border) px-3 py-1.5 text-sm text-(--foreground) transition-all duration-200 ease-out hover:bg-(--muted)/30 hover:shadow-(--shadow-subtle) active:translate-y-px active:bg-(--muted)/50 h-auto bg-transparent disabled:opacity-40"
                        >
                          <IconComponent
                            size="sm"
                            className="text-(--muted-foreground) transition-colors group-hover:text-(--foreground) shrink-0"
                          />
                          <span>{suggestion.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          : (suggestions ?? []).map((suggestion) => {
              const IconComponent = suggestion.icon;
              return (
                <button
                  key={suggestion.text}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePromptClick(suggestion.prompt)}
                  className="group flex items-center gap-2 rounded-full border border-(--border) px-3 py-2 text-sm text-(--foreground) transition-all duration-200 ease-out hover:bg-(--muted)/30 hover:shadow-(--shadow-subtle) active:translate-y-px active:bg-(--muted)/50 h-auto bg-transparent disabled:opacity-40"
                >
                  <IconComponent
                    size={16}
                    className="text-(--muted-foreground) transition-colors group-hover:text-(--foreground) shrink-0"
                  />
                  <span>{suggestion.text}</span>
                </button>
              );
            })}
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col gap-4 w-full", className)}>
      <div
        className={cn(
          "flex flex-col bg-(--card) transition-colors",
          bordered &&
            "border border-(--border) hover:border-(--foreground)/20 focus-within:border-(--foreground)/30",
          isCompact ? "rounded-xl" : "min-h-[7.5rem] rounded-2xl",
        )}
      >
        <div className={cn("relative flex-1", isCompact ? "" : "")}>
          <div
            ref={overlayRef}
            aria-hidden
            className={cn(
              SHARED_BOX,
              "absolute inset-0 overflow-hidden pointer-events-none select-none text-(--foreground)",
            )}
          >
            {highlightContent(value)}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            className={cn(
              SHARED_BOX,
              "relative border-0 outline-none resize-none shadow-none bg-transparent text-transparent caret-(--foreground) placeholder:text-(--muted-foreground) disabled:opacity-50",
              isCompact ? "" : "overflow-y-auto scrollbar-none",
            )}
          />

          {/* @mention dropdown */}
          {showMentionDropdown && filteredMentionItems.length > 0 && (
            <div
              ref={mentionDropdownRef}
              className="absolute z-100 left-3 right-3 bg-(--white) border border-(--border) rounded-xl max-h-60 overflow-y-auto"
              style={{ bottom: "calc(100% + 0.5rem)" }}
            >
              {filteredMentionItems.map((item, index) => (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  data-index={index}
                  onClick={() => handleMentionSelect(item)}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-center gap-2 transition-colors",
                    index === selectedMentionIndex
                      ? "bg-(--muted) border-l-2 border-(--primary)"
                      : "hover:bg-(--muted)/50",
                  )}
                >
                  <div className="shrink-0 text-(--muted-foreground)">
                    {getMentionIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-caption font-medium text-(--foreground) truncate">
                      {item.display}
                    </div>
                    {item.content && (
                      <div className="text-caption text-(--muted-foreground) truncate mt-0.5">
                        {item.content.substring(0, 60)}...
                      </div>
                    )}
                  </div>
                  {index === selectedMentionIndex && (
                    <CheckIcon size="xs" className="shrink-0 text-(--primary)" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Toolbar — before children so submit button appears above filters */}
        <div
          className={cn(
            "flex items-center gap-2",
            isCompact ? "min-h-[2rem] p-2 pb-1" : "min-h-[2.5rem] p-3 pb-2",
          )}
        >
          <div className="flex items-center gap-2 ml-auto">
            {isCompact ? (
              <button
                type="button"
                disabled={!value.trim() || disabled || loading}
                onClick={onSubmit}
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center transition-colors duration-150 shrink-0",
                  value.trim() && !disabled
                    ? "border border-(--primary) text-(--primary) bg-transparent hover:bg-(--primary) hover:text-(--primary-foreground)"
                    : "border border-(--border) text-(--muted-foreground)",
                )}
              >
                {submitIcon}
              </button>
            ) : (
              <button
                type="button"
                disabled={!value.trim() || disabled || loading}
                onClick={onSubmit}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 cursor-pointer shrink-0",
                  "text-code h-9 px-4",
                  "rounded-full",
                  value.trim() && !disabled
                    ? "border-2 border-(--primary) text-(--primary) bg-transparent hover:bg-(--primary) hover:text-(--primary-foreground)"
                    : "border border-(--border) text-(--muted-foreground)",
                )}
              >
                {submitIcon && <span className="shrink-0">{submitIcon}</span>}
                {submitLabel}
              </button>
            )}

            {/* Prompts trigger — pops over from toolbar via Popover */}
            {!isCompact &&
              promptsCollapsible &&
              (suggestions?.length || promptGroups?.length) && (
                <Popover>
                  <PopoverTrigger className="inline-flex items-center gap-1 text-caption text-(--muted-foreground) hover:text-(--foreground) transition-colors px-2 py-1 rounded-lg hover:bg-(--muted)">
                    <span>Prompts</span>
                    <ChevronDownIcon size="xs" />
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    className="w-[calc(100vw-2rem)] sm:w-88 p-3 max-h-72 overflow-y-auto wrap-break-word"
                  >
                    <div className="space-y-3">
                      {promptGroups && promptGroups.length > 0 ? (
                        promptGroups.map((group) => {
                          const GroupIcon = group.icon;
                          return (
                            <div key={group.label}>
                              <div className="flex items-center gap-1.5 mb-2">
                                <GroupIcon
                                  size="xs"
                                  className="text-(--muted-foreground) shrink-0"
                                />
                                <span className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider">
                                  {group.label}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {group.prompts.map((suggestion) => {
                                  const IconComponent = suggestion.icon;
                                  return (
                                    <button
                                      key={suggestion.text}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => {
                                        handlePromptClick(suggestion.prompt);
                                      }}
                                      className="group flex items-center gap-1.5 rounded-full border border-(--border) px-2.5 py-1 text-sm text-(--foreground) transition-all duration-200 ease-out hover:bg-(--muted)/30 hover:shadow-(--shadow-subtle) active:translate-y-px active:bg-(--muted)/50 bg-transparent disabled:opacity-40"
                                    >
                                      <IconComponent
                                        size="xs"
                                        className="text-(--muted-foreground) shrink-0"
                                      />
                                      <span>{suggestion.text}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions!.map((suggestion) => {
                            const IconComponent = suggestion.icon;
                            return (
                              <button
                                key={suggestion.text}
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                  handlePromptClick(suggestion.prompt);
                                }}
                                className="group flex items-center gap-1.5 rounded-full border border-(--border) px-2.5 py-1 text-sm text-(--foreground) transition-colors duration-200 ease-out hover:bg-(--muted)/30 bg-transparent disabled:opacity-40"
                              >
                                <IconComponent
                                  size="xs"
                                  className="text-(--muted-foreground) shrink-0"
                                />
                                <span className="whitespace-nowrap">
                                  {suggestion.text}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
          </div>
        </div>

        {/* Children slot — after toolbar so submit appears before filters */}
        {!isCompact && children && <div className="px-5 pb-2">{children}</div>}
      </div>

      {/* Suggestion prompts — hidden in compact mode */}
      {!isCompact && renderSuggestions()}
    </div>
  );
}
