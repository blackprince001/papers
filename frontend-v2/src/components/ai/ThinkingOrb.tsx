import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { AgentStatusValue } from './AgentStatus';
import { cn } from '@/lib/utils';

const ACTIVE_STATUSES = new Set<AgentStatusValue>([
  'connecting',
  'streaming',
  'retrying',
  'reconciling',
  'thinking',
  'using_tool',
  'running',
]);

const SIZE_CLASSES = {
  sm: 'size-6',
  md: 'size-9',
  lg: 'size-14',
} as const;

export interface ThinkingOrbProps {
  status: AgentStatusValue;
  size?: keyof typeof SIZE_CLASSES;
  label?: string;
  decorative?: boolean;
  className?: string;
}

/** Optional visual companion to AgentStatus; it stops moving when hidden or reduced. */
export function ThinkingOrb({
  status,
  size = 'md',
  label = 'AI is working',
  decorative = false,
  className,
}: ThinkingOrbProps) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  useEffect(() => {
    const handleVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const animated = ACTIVE_STATUSES.has(status) && !reduce && visible;

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      data-ai-thinking-orb
      data-testid="ai-thinking-orb"
      data-state={status}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-(--border) bg-(--muted)/50',
        SIZE_CLASSES[size],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-full bg-(--foreground)/70 transition-transform',
          size === 'sm' ? 'size-2' : size === 'md' ? 'size-3' : 'size-5',
          animated && 'animate-pulse scale-110',
        )}
      />
    </span>
  );
}

export default ThinkingOrb;
