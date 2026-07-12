import { cn } from '@/lib/utils';
import { SpinnerIcon } from '../icons';

const SPINNER_SIZES = { xs: 12, sm: 16, md: 20, lg: 24 } as const;
export type SpinnerSize = keyof typeof SPINNER_SIZES;

interface SpinnerProps {
  /** Preset (xs 12 / sm 16 / md 20 / lg 24) or px for odd embeds. */
  size?: SpinnerSize | number;
  /** Announced to assistive tech via aria-label. */
  label?: string;
  /** Color via text-* utilities; the glyph inherits currentColor. */
  className?: string;
  /** Pass true when a parent (e.g. a loading Button) owns the announcement. */
  'aria-hidden'?: boolean;
}

export function Spinner({
  size = 'sm',
  label = 'Loading',
  className,
  'aria-hidden': ariaHidden,
}: SpinnerProps) {
  const px = typeof size === 'number' ? size : SPINNER_SIZES[size];
  return (
    <span
      role={ariaHidden ? undefined : 'status'}
      aria-label={ariaHidden ? undefined : label}
      aria-hidden={ariaHidden || undefined}
      data-slot="spinner"
      className={cn('inline-flex animate-spin', className)}
    >
      <SpinnerIcon size={px} />
    </span>
  );
}
