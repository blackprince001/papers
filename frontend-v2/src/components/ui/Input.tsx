import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input as HeroInput, type InputProps as HeroInputProps } from '@heroui/react';
import { cn } from '@/lib/utils';

/* Lumen facade over the HeroUI v3 Input (React Aria). Standalone input —
 * labels/descriptions stay with the caller, as before. */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <HeroInput
        ref={ref}
        aria-invalid={error || undefined}
        className={cn(
          'w-full',
          error && 'border-(--danger) focus:border-(--danger) focus-visible:border-(--danger)',
          className,
        )}
        {...(props as Partial<HeroInputProps>)}
      />
    );
  },
);

Input.displayName = 'Input';
