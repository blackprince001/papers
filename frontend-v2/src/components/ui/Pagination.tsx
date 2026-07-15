import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from '../icons';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsToShow?: number;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, itemsToShow = 5, className }: PaginationProps) {
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({ currentPage, totalPages, itemsToShow });

  if (totalPages <= 1) return null;

  const btnBase = cn(
    'inline-flex items-center justify-center h-8 w-8 rounded-lg text-code font-medium',
    'border border-(--border) transition-all duration-150',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)/20',
    'disabled:opacity-40 disabled:cursor-not-allowed',
  );

  const btnIdle = 'bg-(--card) text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)';
  const btnActive = 'bg-(--primary) text-(--primary-foreground) border-(--primary)';

  return (
    <nav role="navigation" aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        className={cn(btnBase, btnIdle)}
      >
        <ChevronLeftIcon size="sm" />
      </button>

      {showLeftEllipsis && (
        <>
          <PageBtn page={1} active={false} onClick={onPageChange} btnBase={btnBase} btnIdle={btnIdle} btnActive={btnActive} />
          <span className="inline-flex items-center justify-center h-8 w-8 text-(--muted-foreground)">
            <MoreHorizontalIcon size="sm" />
          </span>
        </>
      )}

      {pages.map((page) => (
        <PageBtn
          key={page}
          page={page}
          active={page === currentPage}
          onClick={onPageChange}
          btnBase={btnBase}
          btnIdle={btnIdle}
          btnActive={btnActive}
        />
      ))}

      {showRightEllipsis && (
        <>
          <span className="inline-flex items-center justify-center h-8 w-8 text-(--muted-foreground)">
            <MoreHorizontalIcon size="sm" />
          </span>
          <PageBtn page={totalPages} active={false} onClick={onPageChange} btnBase={btnBase} btnIdle={btnIdle} btnActive={btnActive} />
        </>
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        className={cn(btnBase, btnIdle)}
      >
        <ChevronRightIcon size="sm" />
      </button>
    </nav>
  );
}

interface PageBtnProps {
  page: number;
  active: boolean;
  onClick: (page: number) => void;
  btnBase: string;
  btnIdle: string;
  btnActive: string;
}

function PageBtn({ page, active, onClick, btnBase, btnIdle, btnActive }: PageBtnProps) {
  return (
    <button
      onClick={() => onClick(page)}
      aria-current={active ? 'page' : undefined}
      className={cn(btnBase, active ? btnActive : btnIdle)}
    >
      {page}
    </button>
  );
}
