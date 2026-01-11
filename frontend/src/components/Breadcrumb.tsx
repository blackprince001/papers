import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
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
    <nav className={cn("flex items-center gap-2 text-sm text-anara-light-text-muted select-none", className)} aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span
            key={item.id}
            className={cn(
              "flex items-center gap-2",
              isLast ? "min-w-0 flex-1 overflow-hidden" : "flex-shrink-0"
            )}
          >
            {index > 0 && <ChevronRight size={14} className="text-anara-light-text-muted opacity-50 flex-shrink-0" />}
            {isLast ? (
              <span className="text-anara-light-text font-medium truncate" title={item.label}>
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                to={item.href}
                className="hover:text-anara-light-text transition-colors duration-200 hover:underline whitespace-nowrap"
              >
                {item.label}
              </Link>
            ) : (
              <span className="whitespace-nowrap">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

