import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { TextArea as HeroTextArea, type TextAreaProps as HeroTextAreaProps } from '@heroui/react';
import { cn } from '@/lib/utils';

/* Lumen facade over the HeroUI v3 TextArea (React Aria). */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => (
    <HeroTextArea
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'w-full resize-none',
        error && 'border-(--danger) focus:border-(--danger) focus-visible:border-(--danger)',
        className,
      )}
      {...(props as Partial<HeroTextAreaProps>)}
    />
  ),
);
Textarea.displayName = 'Textarea';
