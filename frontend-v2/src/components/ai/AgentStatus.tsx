import type { AIStreamStatus } from '@/lib/ai/streamState';
import { cn } from '@/lib/utils';

export type AgentStatusValue =
  | AIStreamStatus
  | 'thinking'
  | 'using_tool'
  | 'running'
  | 'done'
  | 'error';

const STATUS_LABELS: Record<AgentStatusValue, string> = {
  idle: 'Ready',
  connecting: 'Connecting',
  streaming: 'Generating an answer',
  retrying: 'Retrying connection',
  reconciling: 'Checking the saved result',
  completed: 'Complete',
  failed: 'Unable to finish',
  paused: 'Paused',
  cancelled: 'Cancelled',
  thinking: 'Thinking',
  using_tool: 'Working with sources',
  running: 'Working with sources',
  done: 'Complete',
  error: 'Unable to finish',
};

const ACTIVE_STATUSES = new Set<AgentStatusValue>([
  'connecting',
  'streaming',
  'retrying',
  'reconciling',
  'thinking',
  'using_tool',
  'running',
]);

export interface AgentStatusProps {
  status: AgentStatusValue;
  label?: string;
  className?: string;
}

/** Text-first status feedback for an AI response. */
export function AgentStatus({ status, label, className }: AgentStatusProps) {
  const text = label || STATUS_LABELS[status];
  const active = ACTIVE_STATUSES.has(status);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-ai-status={status}
      className={cn(
        'inline-flex items-center gap-2 text-caption text-(--muted-foreground)',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full bg-(--muted-foreground)',
          active && 'animate-pulse',
          status === 'failed' && 'bg-(--destructive)',
          status === 'completed' && 'bg-(--success)',
        )}
      />
      <span>{text}</span>
    </div>
  );
}

export default AgentStatus;
