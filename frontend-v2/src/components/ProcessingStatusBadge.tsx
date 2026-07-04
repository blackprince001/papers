import { Refresh as Loader2 } from 'iconsax-reactjs';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useProcessingProgress } from '@/hooks/use-processing-progress';

type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface ProcessingStatusBadgeProps {
  status: ProcessingStatus;
  paperId?: number;
  className?: string;
}

const SEGMENT_COLORS: Record<string, string> = {
  completed: 'bg-(--sky-blue)',
  skipped: 'bg-(--muted-foreground) opacity-40',
  failed: 'bg-(--destructive)',
  running: 'bg-(--sky-blue) opacity-50 animate-pulse',
  pending: 'bg-(--muted-foreground) opacity-15',
};

export function ProcessingStatusBadge({ status, paperId, className }: ProcessingStatusBadgeProps) {
  const inFlight = status === 'processing' || status === 'pending';
  const progress = useProcessingProgress(paperId, inFlight);

  if (status === 'completed' || (status === 'pending' && !progress.isActive)) return null;

  if (status === 'failed') {
    const firstError = progress.failureErrors[0];
    return (
      <Badge
        className={cn('bg-[rgba(209,46,62,0.12)] text-(--destructive)', className)}
        title={firstError ? `Failed: ${firstError}` : 'Failed'}
      >
        Failed
      </Badge>
    );
  }

  // No step data (yet, or expired) — fall back to the plain badge.
  if (!progress.isActive) {
    return (
      <Badge className={cn('bg-[rgba(60,145,230,0.12)] text-(--sky-blue)', className)}>
        <Loader2 size={10} className="mr-1 animate-spin" />
        Processing
      </Badge>
    );
  }

  const label = progress.currentStepLabel ?? 'Processing…';

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      title={progress.steps.map((s) => `${s.label}: ${s.status}`).join('\n')}
    >
      <div className="flex items-center gap-0.5" aria-hidden>
        {progress.steps.map((s) => (
          <span
            key={s.name}
            className={cn('h-1 w-3 rounded-full', SEGMENT_COLORS[s.status])}
          />
        ))}
      </div>
      <span className="text-[11px] text-(--sky-blue) whitespace-nowrap">
        {label} {progress.completedCount}/{progress.totalSteps}
      </span>
    </div>
  );
}
