import { ProgressBarFill, ProgressBarRoot, ProgressBarTrack } from '@heroui/react';
import { cn } from '@/lib/utils';

/* Lumen facade over the HeroUI v3 ProgressBar (React Aria). */

interface ProgressProps {
  value: number; // 0–100
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
}

export function Progress({ value, className, trackClassName, fillClassName }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <ProgressBarRoot value={clamped} minValue={0} maxValue={100} className={cn('w-full', className)}>
      <ProgressBarTrack className={cn('h-1 bg-(--muted)', trackClassName)}>
        <ProgressBarFill className={cn('bg-(--primary)', fillClassName)} />
      </ProgressBarTrack>
    </ProgressBarRoot>
  );
}
