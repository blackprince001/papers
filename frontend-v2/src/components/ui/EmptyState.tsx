import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { IconProps } from '../icons';

type EmptyStateSize = 'page' | 'panel' | 'row';

interface EmptyStateProps {
  /** Icon component from components/icons; sized by the density tier. */
  icon?: ComponentType<IconProps>;
  title: string;
  description?: ReactNode;
  /** Compose Buttons/Links; rendered in a centered gap-3 row. */
  actions?: ReactNode;
  size?: EmptyStateSize;
  /** Panels must not break the page heading outline — default 'p'. */
  titleAs?: 'h2' | 'h3' | 'p';
  className?: string;
}

const iconPx: Record<EmptyStateSize, number> = { page: 48, panel: 32, row: 0 };

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  size = 'page',
  titleAs: TitleTag = 'p',
  className,
}: EmptyStateProps) {
  if (size === 'row') {
    return (
      <p className={cn('py-4 text-center text-code text-(--muted-foreground)', className)}>
        {title}
      </p>
    );
  }
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        size === 'page' ? 'py-16' : 'py-8',
        className,
      )}
    >
      {Icon && (
        <Icon
          size={iconPx[size]}
          strokeWidth={1.5}
          className="text-(--muted-foreground) opacity-80"
        />
      )}
      <TitleTag className={cn('font-semibold text-(--foreground)', size === 'page' ? 'mt-4 text-body-lg' : 'mt-3 text-body')}>
        {title}
      </TitleTag>
      {description && (
        <div className="mt-1.5 max-w-md text-code text-(--muted-foreground)">{description}</div>
      )}
      {actions && <div className="mt-5 flex items-center justify-center gap-3">{actions}</div>}
    </div>
  );
}
