import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  id: number | string;
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1 sm:gap-1.5 text-micro sm:text-caption text-(--muted-foreground) select-none min-w-0', className)}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span
            key={item.id}
            className={cn('flex items-center gap-1 sm:gap-1.5 min-w-0', isLast ? 'flex-1 overflow-hidden' : 'shrink-0')}
          >
            {index > 0 && <ChevronRightIcon size="xs" className="sm:size-3 opacity-40 shrink-0" />}
            {isLast ? (
              <span className="text-(--foreground) font-medium truncate text-micro sm:text-caption" title={item.label}>
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                to={item.href}
                className="hover:text-(--foreground) transition-colors duration-150 truncate max-w-24 sm:max-w-none"
              >
                {item.label}
              </Link>
            ) : (
              <span className="truncate max-w-16 sm:max-w-none">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
