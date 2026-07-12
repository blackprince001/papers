import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { WarningIcon } from '../icons';
import { Button } from './Button';

type ErrorStateSize = 'page' | 'panel' | 'row';

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Wire to TanStack Query's refetch; renders a secondary "Try again". */
  onRetry?: () => void;
  /** Wire to isRefetching for a loading retry button. */
  retrying?: boolean;
  retryLabel?: string;
  /** Extra CTAs alongside retry (e.g. a "Go to Library" link). */
  actions?: ReactNode;
  size?: ErrorStateSize;
  className?: string;
}

/** Inline error block for failed data fetches. Policy: query errors render
 * this in place (never toast); mutation errors toast (never render blocks). */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retrying = false,
  retryLabel = 'Try again',
  actions,
  size = 'page',
  className,
}: ErrorStateProps) {
  if (size === 'row') {
    return (
      <div role="alert" className={cn('flex items-center justify-center gap-2 py-4', className)}>
        <WarningIcon size="sm" className="text-(--danger)" />
        <span className="text-code text-(--muted-foreground)">{title}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-code font-medium text-(--foreground) underline underline-offset-2 hover:opacity-80"
          >
            {retryLabel}
          </button>
        )}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center text-center',
        size === 'page' ? 'py-16' : 'py-8',
        className,
      )}
    >
      <span
        className={cn(
          'grid place-items-center rounded-xl bg-(--danger-soft)',
          size === 'page' ? 'p-3' : 'p-2.5',
        )}
      >
        <WarningIcon size={size === 'page' ? 28 : 20} className="text-(--danger)" />
      </span>
      <p className={cn('font-semibold text-(--foreground)', size === 'page' ? 'mt-4 text-body-lg' : 'mt-3 text-body')}>
        {title}
      </p>
      {description && (
        <div className="mt-1.5 max-w-md text-code text-(--muted-foreground)">{description}</div>
      )}
      {(onRetry || actions) && (
        <div className="mt-5 flex items-center justify-center gap-3">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry} loading={retrying}>
              {retryLabel}
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
