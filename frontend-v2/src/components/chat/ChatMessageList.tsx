import { useRef, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChatIcon,
  CheckCircleIcon,
  CopyIcon,
  SparklesIcon,
} from "@/components/icons";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { MessageThread } from "@/components/MessageThread";
import { StreamingMessage } from "@/components/ai/StreamingMessage";
import { MessageAuthor } from "@/components/ai/MessageAuthor";
import { cn } from "@/lib/utils";
import type { ChatController } from "@/hooks/use-chat-controller";
import type { ChatMessage } from "@/lib/api/chat";

interface ChatMessageListProps {
  controller: ChatController;
  /** Extra classes for the scroll container. */
  className?: string;
  /** Centres and width-caps the message column (used by the full-page view). */
  centered?: boolean;
}

interface MessageTurn {
  user: ChatMessage | null;
  replies: ChatMessage[];
}

function groupIntoTurns(messages: ChatMessage[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      turns.push({ user: msg, replies: [] });
    } else if (turns.length > 0) {
      turns[turns.length - 1].replies.push(msg);
    } else {
      turns.push({ user: null, replies: [msg] });
    }
  }
  return turns;
}

function StickyQuery({ children }: { children: ReactNode }) {
  return <div className="sticky top-0 z-20">{children}</div>;
}


function CollapsibleQueryText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setIsTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <>
      <p
        ref={textRef}
        className={cn(
          "text-code leading-relaxed whitespace-pre-wrap",
          !expanded && "line-clamp-4",
        )}
      >
        {text}
      </p>
      {(isTruncated || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-caption font-medium text-(--muted-foreground) hover:text-(--foreground) transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

export function ChatMessageList({
  controller,
  className,
  centered = false,
}: ChatMessageListProps) {
  const {
    messages,
    stream,
    activeThreadId,
    setActiveThreadId,
    copiedId,
    copyMessage,
    sessionSwitchToken,
    setComposerHidden,
  } = controller;

  const {
    status,
    content,
    displayedContent,
    toolCalls,
    toolResults,
    thoughts,
    currentTool,
    error,
    messageId,
    sessionId: responseSessionId,
    referenceManifest,
    retry,
    reset,
    isActive,
    pendingUserMessage,
    autoRetryAt,
  } = stream;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const pinnedToBottomRef = useRef(true);
  const prevPendingRef = useRef<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showScrollUp, setShowScrollUp] = useState(false);
  const lastScrollTopRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    pinnedToBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  const scrollToTop = useCallback(() => {
    messagesTopRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 80;
    setShowScrollDown(distanceFromBottom > 100);
    setShowScrollUp(scrollTop > 100);

    // Composer auto-hide, keyed on scroll DIRECTION (scrollTop delta), not
    // distance-from-bottom. Toggling the composer resizes this container,
    // which shifts distanceFromBottom by the composer's full height — any
    // distance-based rule feeds back on itself and oscillates (hide → grow
    // → "near bottom" → show → shrink → "far" → hide...). scrollTop is
    // untouched by that resize, so direction is stable.
    const delta = scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;
    if (isActive) return;
    if (Math.abs(delta) < 2) return; // resize-induced event, not user scroll
    if (delta > 0 || distanceFromBottom < 80) {
      // Scrolling down (heading back to the conversation) or at the bottom.
      setComposerHidden(false);
    } else if (distanceFromBottom > 150) {
      // Scrolling up through history.
      setComposerHidden(true);
    }
  }, [isActive, setComposerHidden]);

  useEffect(() => {
    if (isActive) setComposerHidden(false);
  }, [isActive, setComposerHidden]);

  useEffect(() => {
    if (pendingUserMessage && pendingUserMessage !== prevPendingRef.current) {
      pinnedToBottomRef.current = true;
    }
    prevPendingRef.current = pendingUserMessage;
  }, [pendingUserMessage]);

  useEffect(() => {
    if ((isActive || pendingUserMessage) && pinnedToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [displayedContent, pendingUserMessage, isActive]);

  useEffect(() => {
    if (sessionSwitchToken === 0) return;
    messagesTopRef.current?.scrollIntoView({ behavior: "instant" });
  }, [sessionSwitchToken]);

  const inner = centered ? "mx-auto w-full max-w-3xl" : "";
  const turns = groupIntoTurns(messages);

  return (
    <div className={cn("relative flex-1 min-h-0", className)}>
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        data-chat-scroll
        className="h-full overflow-y-auto px-4 pb-4 pt-2"
      >
        <div ref={messagesTopRef} />
        {messages.length === 0 && !isActive && !pendingUserMessage && (
          <div className="flex flex-col items-center justify-center h-full text-center text-(--muted-foreground) opacity-50">
            <SparklesIcon size={32} className="mb-3" />
            <p className="text-code">Start a conversation about this paper</p>
          </div>
        )}

        <div className={cn("space-y-0.5", inner)}>
          {turns.map((turn, turnIdx) => (
            <div key={turn.user?.id ?? `turn-${turnIdx}`}>
              {turn.user && (
                <StickyQuery>
                  <div className="flex justify-start">
                    <div className="group relative w-full px-3.5 py-3 rounded-2xl bg-(--muted)">
                      <MessageAuthor role="user" />
                      <CollapsibleQueryText text={turn.user.content} />
                      <span className="absolute top-3 right-2.5 text-[0.625rem] text-(--muted-foreground) opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
                        {format(new Date(turn.user.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                  </div>
                </StickyQuery>
              )}

              {turn.replies.map((msg) => (
                <div key={msg.id} className="mb-6">
                  <div className="flex justify-start">
                    <div className="group relative w-full px-4 py-4 rounded-xl bg-transparent">
                      <MessageAuthor role="assistant" />
                      <MarkdownMessage
                        content={msg.content}
                        referenceManifest={msg.reference_manifest}
                      />
                      <div className="absolute -bottom-5 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-(--card) border border-(--border) p-1 rounded-lg z-10">
                        <Button
                          variant="icon"
                          size="icon-xs"
                          onClick={() =>
                            copyMessage(msg.content, `${msg.id}-copy`)
                          }
                          title="Copy"
                          aria-label="Copy"
                        >
                          {copiedId === `${msg.id}-copy` ? (
                            <CheckCircleIcon size="xs" className="text-(--success)" />
                          ) : (
                            <CopyIcon size="xs" />
                          )}
                        </Button>
                        <Button
                          variant="icon"
                          size="icon-xs"
                          onClick={() =>
                            setActiveThreadId(
                              activeThreadId === msg.id ? null : msg.id,
                            )
                          }
                          title="Reply in thread"
                          aria-label="Reply in thread"
                        >
                          <ChatIcon size="xs" />
                        </Button>
                      </div>
                      <span className="absolute top-4 right-3 text-[0.625rem] text-(--muted-foreground) opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
                        {format(new Date(msg.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                  </div>

                  {(msg.thread_count > 0 || activeThreadId === msg.id) && (
                    <MessageThread
                      parentMessage={msg}
                      showInput={activeThreadId === msg.id}
                      onCloseInput={() => setActiveThreadId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}

          {(pendingUserMessage || isActive) && (
            <div>
              {pendingUserMessage && (
                <StickyQuery>
                  <div className="flex justify-start">
                    <div className="relative w-full px-3.5 py-3 rounded-2xl bg-(--muted)">
                      <MessageAuthor role="user" />
                      <CollapsibleQueryText text={pendingUserMessage} />
                    </div>
                  </div>
                </StickyQuery>
              )}

              {isActive && (
                <StreamingMessage
                  state={{
                    status,
                    content,
                    displayedContent,
                    toolCalls,
                    toolResults,
                    thoughts,
                    currentTool,
                    error,
                    messageId,
                    sessionId: responseSessionId,
                    referenceManifest,
                    autoRetryAt,
                  }}
                  isStreaming={isActive}
                  onRetry={retry}
                  onDismiss={reset}
                />
              )}
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {showScrollUp && (
        <button
          onClick={scrollToTop}
          className="absolute right-4 top-4 z-30 w-8 h-8 rounded-full bg-(--card) border border-(--border) shadow-(--shadow-subtle) flex items-center justify-center text-(--muted-foreground) hover:text-(--foreground) hover:border-(--foreground)/30 transition-colors"
          title="Scroll to top"
        >
          <ArrowUpIcon size="sm" />
        </button>
      )}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-4 z-30 w-8 h-8 rounded-full bg-(--card) border border-(--border) shadow-(--shadow-subtle) flex items-center justify-center text-(--muted-foreground) hover:text-(--foreground) hover:border-(--foreground)/30 transition-colors"
          title="Scroll to bottom"
        >
          <ArrowDownIcon size="sm" />
        </button>
      )}
    </div>
  );
}
