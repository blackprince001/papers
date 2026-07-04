import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'primary-lg' | 'secondary' | 'ghost' | 'outlined' | 'destructive' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg' | 'icon' | string;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-(--primary) [color:var(--primary-foreground)]',
    'text-btn font-medium h-8 px-5 py-0',
    'rounded-md border border-transparent',
    'shadow-(--shadow-inset)',
    'hover:opacity-90 hover:brightness-95 hover:shadow-(--shadow-inset-hover)',
    'active:translate-y-px active:shadow-(--shadow-inset-hover) active:brightness-90',
  ),
  'primary-lg': cn(
    'bg-(--primary) [color:var(--primary-foreground)]',
    'text-[20px] leading-[28px] font-medium h-10 px-4 py-1',
    'rounded-lg border-0',
    'shadow-(--shadow-inset)',
    'hover:brightness-95 hover:shadow-(--shadow-inset-hover)',
    'active:translate-y-px active:shadow-(--shadow-inset-hover) active:brightness-90',
  ),
  secondary: cn(
    'bg-(--muted) text-(--foreground)',
    'text-btn-sm font-medium h-8 pt-1 pb-1 pr-2 pl-1.5',
    'rounded-lg border border-transparent',
    'hover:bg-(--border)',
    'active:bg-(--border) active:brightness-95',
  ),
  ghost: cn(
    'bg-transparent text-(--foreground)',
    'text-btn-sm font-medium h-8 pt-1 pb-1 pr-2 pl-1.5',
    'rounded-lg border border-transparent',
    'hover:border-(--border) hover:bg-(--foreground)/[2%]',
    'active:bg-(--foreground)/[5%]',
  ),
  outlined: cn(
    'bg-(--white) text-(--foreground)',
    'text-code font-medium h-8 px-3',
    'rounded-lg border border-(--border)',
    'hover:bg-(--muted)',
  ),
  destructive: cn(
    'bg-(--destructive) text-(--white)',
    'text-code font-medium h-8 px-5',
    'rounded-lg border border-transparent',
    'hover:opacity-90',
    'active:translate-y-px',
  ),
  icon: cn(
    'bg-transparent text-(--muted-foreground)',
    'rounded-lg border border-transparent',
    'hover:bg-(--foreground)/[8%]',
    'active:bg-(--foreground)/[12%]',
  ),
};

const sizeStyles: Record<string, string> = {
  sm: 'h-7 px-3 text-caption gap-1',
  md: 'h-8 px-5',
  lg: 'h-10 px-6 text-body',
  icon: 'h-8 w-8 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 cursor-pointer shrink-0',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)/20',
          variantStyles[variant],
          sizeStyles[size as string] || '',
          className,
        )}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
