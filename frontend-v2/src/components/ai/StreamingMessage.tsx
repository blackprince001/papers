import { useMemo } from 'react';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { ErrorBanner } from '@/components/ai/ErrorBanner';
import { MessageAuthor } from '@/components/ai/MessageAuthor';
import { ReasoningTrace } from '@/components/ai/ReasoningTrace';
import { buildChatActivity } from '@/lib/ai/reasoning';
import { cn } from '@/lib/utils';
import type { ChatStreamState } from '@/hooks/use-chat-stream';

export interface StreamingMessageProps {
  state: ChatStreamState & { displayedContent: string; autoRetryAt?: number | null };
  isStreaming: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
  onSettings?: () => void;
  className?: string;
}

export function StreamingMessage({
  state,
  isStreaming,
  onRetry,
  onDismiss,
  onSettings,
  className,
}: StreamingMessageProps) {
  // Normalize chat's separate thought/tool arrays into the shared reasoning
  // trace so chat and deep research render the exact same "thinking" UI.
  const activity = useMemo(
    () => buildChatActivity(state.thoughts, state.toolCalls, state.toolResults),
    [state.thoughts, state.toolCalls, state.toolResults],
  );

  // If done or idle with no content, don't render.
  if (
    state.status === 'idle' &&
    !state.content &&
    state.thoughts.length === 0 &&
    state.toolCalls.length === 0
  ) {
    return null;
  }

  return (
    <div className={cn('relative w-full px-4 py-4 rounded-xl bg-transparent', className)}>
      <MessageAuthor role="assistant" />

      {/* Agent reasoning + tools — shared with deep research */}
      <ReasoningTrace
        activity={activity}
        running={isStreaming}
        thinkingMs={null}
        hasReport={!!state.displayedContent}
      />

      {/* Text content */}
      {(state.displayedContent || isStreaming) && (
        <div className="mt-2">
          {state.displayedContent ? (
            <MarkdownMessage
              content={state.displayedContent}
              referenceManifest={state.referenceManifest}
            />
          ) : (
            <div className="space-y-2.5 w-72">
              <div className="flex flex-wrap gap-1.5">
                {[{ w: 12 }, { w: 16 }, { w: 8 }, { w: 20 }, { w: 14 }, { w: 10 }, { w: 24 }].map(
                  (s, i) => (
                    <div
                      key={i}
                      className="h-3 bg-(--muted) rounded animate-pulse"
                      style={{ width: `${s.w * 4}px` }}
                    />
                  ),
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[{ w: 20 }, { w: 8 }, { w: 16 }, { w: 12 }, { w: 10 }].map((s, i) => (
                  <div
                    key={i}
                    className="h-3 bg-(--muted) rounded animate-pulse"
                    style={{ width: `${s.w * 4}px` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cursor blink during streaming */}
      {isStreaming && state.displayedContent && (
        <span className="inline-block w-[0.125rem] h-4 bg-(--foreground) ml-0.5 animate-pulse" />
      )}

      {/* Error banner */}
      {state.error && (
        <div className="mt-2">
          <ErrorBanner
            message={state.error.message}
            code={state.error.code}
            recoverable={state.error.recoverable}
            retryingAt={state.autoRetryAt}
            onRetry={onRetry}
            onDismiss={onDismiss}
            onSettings={onSettings}
          />
        </div>
      )}
    </div>
  );
}

export default StreamingMessage;
