import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const widths = {
  /** Full workspace width — grids, tables, dashboards. */
  wide: 'max-w-(--width-content-max)',
  /** Default page column. */
  content: 'max-w-(--width-main-content)',
  /** Long-form reading column. */
  reading: 'max-w-(--width-reading)',
} as const;

interface PageContainerProps {
  width?: keyof typeof widths;
  className?: string;
  children: ReactNode;
}

/** The one page-column convention: centered, tokenized max-width, uniform
 * gutters. Pages should not hand-roll max-w-* containers. */
export function PageContainer({ width = 'content', className, children }: PageContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-4 md:px-6 pt-6 pb-16', widths[width], className)}>
      {children}
    </div>
  );
}
