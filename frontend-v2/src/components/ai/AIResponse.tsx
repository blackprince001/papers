import { AISourceList } from '@/components/ai/AISourceList';
import AgentStatus, { type AgentStatusValue } from '@/components/ai/AgentStatus';
import { ErrorBanner } from '@/components/ai/ErrorBanner';
import { MessageAuthor } from '@/components/ai/MessageAuthor';
import { ReasoningTrace } from '@/components/ai/ReasoningTrace';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import type { AIActivity, AIError, AIRetry, AISource, AIWarning } from '@/lib/ai/events';
import type { ReferenceManifestEntry } from '@/lib/api/references';
import { cn } from '@/lib/utils';

const EMPTY_ACTIVITIES: AIActivity[] = [];
const EMPTY_SOURCES: AISource[] = [];

export interface AIResponseProps {
  status: AgentStatusValue;
  content: string;
  displayedContent: string;
  activities?: AIActivity[];
  sources?: AISource[];
  warning?: AIWarning | null;
  retry?: AIRetry | null;
  error?: AIError | { message: string; code: string; recoverable: boolean } | null;
  referenceManifest?: ReferenceManifestEntry[] | null;
  isStreaming: boolean;
  thinkingMs?: number | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  onSettings?: () => void;
  className?: string;
}

function retryAt(retry: AIRetry | null | undefined): number | null {
  if (!retry?.retryAfterMs) return null;
  return Date.now() + retry.retryAfterMs;
}

function statusLabel(status: AgentStatusValue, activities: AIActivity[]): string | undefined {
  if (!['connecting', 'streaming', 'retrying', 'reconciling', 'thinking', 'using_tool', 'running'].includes(status)) {
    return undefined;
  }
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    if (activities[index].state === 'running') return activities[index].label;
  }
  return undefined;
}

/** Shared safe response renderer for paper chat, threads, groups, and fixtures. */
export function AIResponse({
  status,
  content,
  displayedContent,
  activities = EMPTY_ACTIVITIES,
  sources = EMPTY_SOURCES,
  warning,
  retry,
  error,
  referenceManifest,
  isStreaming,
  thinkingMs = null,
  onRetry,
  onDismiss,
  onSettings,
  className,
}: AIResponseProps) {
  if (status === 'idle' && !content && activities.length === 0 && !error) return null;

  return (
    <div className={cn('relative w-full px-4 py-4 rounded-xl bg-transparent', className)}>
      <MessageAuthor role="assistant" />

      {(isStreaming || error) && (
        <AgentStatus status={status} label={statusLabel(status, activities)} />
      )}

      <ReasoningTrace
        activity={activities}
        running={isStreaming}
        thinkingMs={thinkingMs}
        hasReport={!!displayedContent}
      />

      {warning && (
        <p role="status" className="mt-2 text-micro text-(--muted-foreground)">
          {warning.message}
        </p>
      )}

      {(displayedContent || isStreaming) && (
        <div className="mt-2">
          {displayedContent ? (
            <MarkdownMessage
              content={displayedContent}
              referenceManifest={referenceManifest}
            />
          ) : (
            <div className="space-y-2.5 w-72" aria-label="Generating response">
              <div className="flex flex-wrap gap-1.5">
                {[12, 16, 8, 20, 14, 10, 24].map((width) => (
                  <div
                    key={width}
                    className="h-3 bg-(--muted) rounded animate-pulse"
                    style={{ width: `${width * 4}px` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[20, 8, 16, 12, 10].map((width) => (
                  <div
                    key={width}
                    className="h-3 bg-(--muted) rounded animate-pulse"
                    style={{ width: `${width * 4}px` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isStreaming && displayedContent && (
        <span
          aria-hidden="true"
          className="inline-block w-[0.125rem] h-4 bg-(--foreground) ml-0.5 animate-pulse"
        />
      )}

      <AISourceList sources={sources} />

      {error && (
        <div className="mt-2">
          <ErrorBanner
            message={error.message}
            code={error.code}
            recoverable={error.recoverable}
            retryingAt={retryAt(retry)}
            onRetry={onRetry}
            onDismiss={onDismiss}
            onSettings={onSettings}
          />
        </div>
      )}
    </div>
  );
}

export default AIResponse;
