import { Link } from 'react-router-dom';
import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useProcessingProgress, type StepState } from '@/hooks/use-processing-progress';

interface ProcessingProgressPanelProps {
  paperId: number;
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  className?: string;
}

function StepIcon({ status }: { status: StepState['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircleIcon size="sm" filled className="text-(--sky-blue)" />;
    case 'running':
      return <Spinner size={14} className="text-(--sky-blue)" />;
    case 'skipped':
      return <MinusCircleIcon size="sm" className="text-(--muted-foreground) opacity-60" />;
    case 'failed':
      return <XCircleIcon size="sm" filled className="text-(--destructive)" />;
    default:
      return <span className="inline-block size-3.5 rounded-full border border-(--border)" />;
  }
}

export function ProcessingProgressPanel({
  paperId,
  processingStatus,
  className,
}: ProcessingProgressPanelProps) {
  const inFlight = processingStatus === 'processing' || processingStatus === 'pending';
  const progress = useProcessingProgress(paperId, inFlight);

  if (processingStatus !== 'pending' && processingStatus !== 'processing' && !inFlight && !progress.skippedForNoProvider) return null;

  if (progress.skippedForNoProvider && !progress.isActive && !progress.hasFailures) {
    return (
      <div
        className={cn(
          'rounded-lg border border-(--border) bg-(--muted) px-4 py-3 text-caption text-(--muted-foreground)',
          className,
        )}
      >
        AI features were skipped — no AI provider is configured.{' '}
        <Link to="/settings" className="text-(--sky-blue) underline underline-offset-2">
          Add one in Settings
        </Link>
      </div>
    );
  }

  if (processingStatus === 'failed' && progress.done) {
    return (
      <div
        className={cn(
          'rounded-lg border border-(--border) bg-(--white) px-4 py-3',
          className,
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <XCircleIcon size="md" filled className="text-(--destructive)" />
          <span className="text-caption font-medium text-(--destructive)">Processing failed</span>
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {progress.steps.map((step) => (
            <li key={step.name} className="flex items-start gap-2 text-caption">
              <StepIcon status={step.status} />
              <span className="min-w-0">
                <span
                  className={cn(
                    step.status === 'failed' && 'text-(--destructive)',
                  )}
                >
                  {step.label}
                </span>
                {step.error && (
                  <span
                    className="block text-micro text-(--muted-foreground) mt-0.5 truncate max-w-32"
                    title={step.error}
                  >
                    {step.error.slice(0, 60)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {progress.hasBalanceError && (
          <div className="mt-3 pt-3 border-t border-(--border)">
            <p className="text-caption text-(--muted-foreground)">
              <span className="font-medium text-(--foreground)">Insufficient credits.</span>{' '}
              Your AI provider key ran out of credits during processing.{' '}
              <Link
                to="/settings"
                className="text-(--sky-blue) underline underline-offset-2 whitespace-nowrap"
              >
                Configure in Settings
              </Link>
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!inFlight) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-(--border) bg-(--white) px-4 py-3',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-caption font-medium">Preparing this paper</span>
        <span className="text-caption text-(--muted-foreground)">
          {progress.completedCount}/{progress.totalSteps}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {progress.steps.map((step) => (
          <li key={step.name} className="flex items-center gap-2 text-caption">
            <StepIcon status={step.status} />
            <span className="min-w-0">
              <span
                className={cn(
                  step.status === 'pending' && 'text-(--muted-foreground) opacity-70',
                  step.status === 'failed' && 'text-(--destructive)',
                )}
              >
                {step.label}
                {step.count != null && step.status === 'completed' ? ` (${step.count})` : ''}
              </span>
              {step.error && (
                <span
                  className="block text-micro text-(--muted-foreground) mt-0.5 truncate max-w-32"
                  title={step.error}
                >
                  {step.error.slice(0, 60)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
