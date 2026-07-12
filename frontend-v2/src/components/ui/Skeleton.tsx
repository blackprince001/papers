import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse motion-reduce:animate-none rounded-lg bg-(--muted)',
        className,
      )}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  /** Width utility for the trailing line, e.g. 'w-2/3'. */
  lastLineWidth?: string;
  className?: string;
}

/** Text-block placeholder: n full-width lines, the last one short. */
export function SkeletonText({ lines = 3, lastLineWidth = 'w-2/3', className }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? lastLineWidth : 'w-full')} />
      ))}
    </div>
  );
}
