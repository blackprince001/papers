import { useEffect, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { CloseIcon, InfoCircleIcon, WarningIcon, XCircleIcon, type IconProps } from '@/components/icons';

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

type Intent = 'danger' | 'warning' | 'info';

const INTENT_STYLES: Record<Intent, { surface: string; text: string }> = {
  danger: { surface: 'bg-(--danger-soft) border-(--danger-border)', text: 'text-(--danger)' },
  warning: { surface: 'bg-(--warning-soft) border-(--warning-border)', text: 'text-(--warning)' },
  info: { surface: 'bg-(--info-soft) border-(--info-border)', text: 'text-(--info)' },
};

const ERROR_CONFIG: Record<string, { intent: Intent; Icon: ComponentType<IconProps>; action: string }> = {
  rate_limit: { intent: 'warning', Icon: WarningIcon, action: 'Retry' },
  auth: { intent: 'danger', Icon: XCircleIcon, action: 'Settings' },
  provider_unavailable: { intent: 'warning', Icon: WarningIcon, action: 'Retry' },
  timeout: { intent: 'warning', Icon: WarningIcon, action: 'Retry' },
  network: { intent: 'info', Icon: InfoCircleIcon, action: 'Retry' },
  tool_error: { intent: 'warning', Icon: WarningIcon, action: 'Dismiss' },
  no_provider: { intent: 'danger', Icon: XCircleIcon, action: 'Settings' },
  internal: { intent: 'danger', Icon: XCircleIcon, action: 'Retry' },
};

function configForCode(code: string) {
  return ERROR_CONFIG[code] || ERROR_CONFIG.internal;
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
  const { intent, Icon, action } = configForCode(code);
  const styles = INTENT_STYLES[intent];
  const retrySeconds = useCountdownSeconds(retryingAt);

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 px-3 py-2 rounded-xl border text-caption', styles.surface)}
    >
      <Icon size="sm" filled className={cn('mt-0.5', styles.text)} />
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium', styles.text)}>{message}</p>
        {retrySeconds !== null && (
          <p className="text-(--muted-foreground) mt-0.5 text-micro">
            Retrying automatically in {retrySeconds}s…
          </p>
        )}
        {!recoverable && (
          <p className="text-(--muted-foreground) mt-0.5 text-micro">
            This error cannot be automatically retried.
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {recoverable && onRetry && code !== 'tool_error' && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            {action}
          </Button>
        )}
        {!recoverable && onSettings && (
          <Button variant="ghost" size="sm" onClick={onSettings}>
            {action}
          </Button>
        )}
        {(recoverable || code === 'tool_error') && onDismiss && (
          <Button variant="icon" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}>
            <CloseIcon size="xs" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default ErrorBanner;
