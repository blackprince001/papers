import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

/* Lumen facade over the HeroUI v3 Button. Call sites keep the historical
 * Lumen API (variant/size/icon/loading, onClick, ButtonHTMLAttributes);
 * HeroUI (React Aria) provides behavior and base styling; the theme bridge
 * in index.css provides the Lumen look. */

type ButtonVariant = 'primary' | 'primary-lg' | 'secondary' | 'ghost' | 'outlined' | 'destructive' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon-xs' | 'icon-sm' | 'icon' | 'icon-lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** The button's mobile representation. Buttons never render icon AND
   * label together: with both `icon` and `children`, the label shows from
   * `sm:` up and collapses to the icon alone below it. */
  icon?: ReactNode;
  /** Disables the button and overlays a centered spinner; the label stays
   * mounted (invisible) so the button keeps its width. */
  loading?: boolean;
}

const heroVariant: Record<ButtonVariant, NonNullable<HeroButtonProps['variant']>> = {
  primary: 'primary',
  'primary-lg': 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  outlined: 'outline',
  destructive: 'danger',
  icon: 'ghost',
};

const sizeConfig: Record<
  ButtonSize,
  { size: NonNullable<HeroButtonProps['size']>; iconOnly: boolean; className?: string }
> = {
  sm: { size: 'sm', iconOnly: false },
  md: { size: 'md', iconOnly: false },
  lg: { size: 'lg', iconOnly: false },
  'icon-xs': { size: 'sm', iconOnly: true, className: 'h-6 w-6 min-w-0' },
  'icon-sm': { size: 'sm', iconOnly: true, className: 'h-7 w-7 min-w-0' },
  icon: { size: 'sm', iconOnly: true },
  'icon-lg': { size: 'md', iconOnly: true },
};

const spinnerPx: Record<ButtonSize, number> = {
  sm: 12,
  'icon-xs': 12,
  'icon-sm': 12,
  md: 16,
  icon: 16,
  lg: 20,
  'icon-lg': 20,
};

/* Below sm, an icon+label button collapses to a square icon button. */
const collapsedSquare: Record<ButtonSize, string> = {
  sm: 'max-sm:w-7 max-sm:min-w-0 max-sm:px-0',
  md: 'max-sm:w-8 max-sm:min-w-0 max-sm:px-0',
  lg: 'max-sm:w-10 max-sm:min-w-0 max-sm:px-0',
  'icon-xs': '',
  'icon-sm': '',
  icon: '',
  'icon-lg': '',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size, icon, loading = false, className, children, disabled, type, ...props },
    ref,
  ) => {
    const resolvedSize: ButtonSize =
      size ?? (variant === 'icon' ? 'icon' : variant === 'primary-lg' ? 'lg' : 'md');
    const sz = sizeConfig[resolvedSize];
    const responsive = Boolean(icon && children);
    // The label leaves the accessibility tree when hidden below sm; a
    // string label doubles as the accessible name for the icon-only state.
    const accessibleName =
      props['aria-label'] ?? (responsive && typeof children === 'string' ? children : undefined);
    return (
      <HeroButton
        ref={ref}
        variant={heroVariant[variant]}
        size={sz.size}
        isIconOnly={sz.iconOnly}
        isDisabled={disabled || loading}
        type={type ?? 'button'}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        className={cn(
          'relative shrink-0',
          sz.className,
          responsive && collapsedSquare[resolvedSize],
          className,
        )}
        {...(props as Partial<HeroButtonProps>)}
        aria-label={accessibleName}
      >
        {loading && (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner size={spinnerPx[resolvedSize]} aria-hidden />
          </span>
        )}
        {responsive ? (
          <span className={cn('contents', loading && 'invisible')}>
            <span className="inline-flex shrink-0 sm:hidden">{icon}</span>
            <span className="hidden sm:inline-flex items-center justify-center gap-1.5">
              {children}
            </span>
          </span>
        ) : (
          <span className={cn('inline-flex items-center justify-center gap-1.5', loading && 'invisible')}>
            {icon ? <span className="shrink-0">{icon}</span> : children}
          </span>
        )}
      </HeroButton>
    );
  },
);

Button.displayName = 'Button';
