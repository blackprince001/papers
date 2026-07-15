import { Skeleton as HeroSkeleton } from '@heroui/react';
import { cn } from '@/lib/utils';

/* Lumen facade over the HeroUI v3 Skeleton (shimmer). Shape comes from the
 * caller's className, exactly as before. */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <HeroSkeleton className={cn('rounded-lg motion-reduce:animate-none', className)} />;
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
