import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface ErrorBannerProps {
  message: string;
  code: string;
  recoverable: boolean;
  /** Epoch ms of a scheduled automatic retry — shows a live countdown. */
  retryingAt?: number | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  onSettings?: () => void;
}

const ERROR_STYLES: Record<string, { bg: string; border: string; text: string; icon: string; action: string }> = {
  rate_limit: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-200',
    icon: '⚠',
    action: 'Retry',
  },
  auth: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: '✕',
    action: 'Settings',
  },
  provider_unavailable: {
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-800 dark:text-orange-200',
    icon: '⚠',
    action: 'Retry',
  },
  timeout: {
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-800 dark:text-orange-200',
    icon: '⏱',
    action: 'Retry',
  },
  network: {
    bg: 'bg-gray-50 dark:bg-gray-950/20',
    border: 'border-gray-200 dark:border-gray-800',
    text: 'text-gray-800 dark:text-gray-200',
    icon: '⇄',
    action: 'Retry',
  },
  tool_error: {
    bg: 'bg-amber-50/50 dark:bg-amber-950/10',
    border: 'border-amber-200/50 dark:border-amber-800/50',
    text: 'text-amber-700 dark:text-amber-300',
    icon: '⚙',
    action: 'Dismiss',
  },
  no_provider: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: '✕',
    action: 'Settings',
  },
  internal: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: '✕',
    action: 'Retry',
  },
};

function styleForCode(code: string) {
  return ERROR_STYLES[code] || ERROR_STYLES.internal;
}

function useCountdownSeconds(target: number | null | undefined): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!target) {
      setSeconds(null);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return seconds;
}

export function ErrorBanner({
  message,
  code,
  recoverable,
  retryingAt,
  onRetry,
  onDismiss,
  onSettings,
}: ErrorBannerProps) {
  const s = styleForCode(code);
  const retrySeconds = useCountdownSeconds(retryingAt);

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-2 rounded-lg border text-caption',
        s.bg,
        s.border,
      )}
    >
      <span className="mt-0.5 shrink-0 text-sm">{s.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium', s.text)}>{message}</p>
        {retrySeconds !== null && (
          <p className="text-(--muted-foreground) mt-0.5 text-[0.6875rem]">
            Retrying automatically in {retrySeconds}s…
          </p>
        )}
        {!recoverable && (
          <p className="text-(--muted-foreground) mt-0.5 text-[0.6875rem]">
            This error cannot be automatically retried.
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {recoverable && onRetry && code !== 'tool_error' && (
          <Button variant="ghost" className="h-6! text-caption!" onClick={onRetry}>
            {s.action}
          </Button>
        )}
        {!recoverable && onSettings && (
          <Button variant="ghost" className="h-6! text-caption!" onClick={onSettings}>
            {s.action}
          </Button>
        )}
        {(recoverable || code === 'tool_error') && onDismiss && (
          <Button variant="ghost" className="h-6! w-6! p-0!" onClick={onDismiss}>
            ✕
          </Button>
        )}
      </div>
    </div>
  );
}

export default ErrorBanner;
