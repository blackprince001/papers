import { type HTMLAttributes } from 'react';
import { Chip, type ChipProps } from '@heroui/react';
import { cn } from '@/lib/utils';

/* Lumen facade over the HeroUI v3 Chip. Historical Badge API preserved;
 * status colors come from the intent tokens (no more hardcoded rgba). */

type BadgeVariant = 'default' | 'success' | 'info' | 'warning' | 'secondary';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const chipColor: Record<BadgeVariant, ChipProps['color'] | undefined> = {
  default: 'default',
  secondary: 'default',
  success: 'success',
  warning: 'warning',
  info: undefined, // HeroUI Chip has no info color; styled via tokens below
};

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <Chip
      color={chipColor[variant]}
      className={cn(
        variant === 'info' && 'bg-(--info-soft) text-(--info)',
        className,
      )}
      {...(props as Partial<ChipProps>)}
    >
      {children}
    </Chip>
  );
}
