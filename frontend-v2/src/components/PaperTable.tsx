import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckIcon, SortIcon, TrashIcon, UsersIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { ReadingStatusBadge } from '@/components/ReadingStatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ProcessingStatusBadge } from '@/components/ProcessingStatusBadge';
import { getPaperTheme } from '@/lib/paper-themes';
import type { Paper, PaperListFilters } from '@/lib/api/papers';

interface PaperTableProps {
  papers: Paper[];
  sortBy?: PaperListFilters['sort_by'];
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: PaperListFilters['sort_by']) => void;
  onDelete?: (id: number) => void;
  selectionMode?: boolean;
  selectedIds?: number[];
  onSelect?: (id: number) => void;
}

export function PaperTable({ papers, sortBy, sortOrder, onSort, onDelete, selectionMode, selectedIds = [], onSelect }: PaperTableProps) {

  const SortHeader = ({ field, children }: { field: PaperListFilters['sort_by']; children: React.ReactNode }) => {
    const isActive = sortBy === field;
    return (
      <TableHead>
        {onSort ? (
          <button
            onClick={() => onSort(field)}
            className={cn(
              'inline-flex items-center gap-1 text-caption font-medium',
              'transition-colors hover:text-(--foreground)',
              isActive ? 'text-(--foreground)' : 'text-(--muted-foreground)',
            )}
          >
            {children}
            <SortIcon
              size="xs"
              className={cn(
                'transition-opacity',
                isActive ? 'opacity-80' : 'opacity-30',
                isActive && sortOrder === 'desc' && 'rotate-180',
              )}
            />
          </button>
        ) : (
          <>{children}</>
        )}
      </TableHead>
    );
  };

  return (
    <div className="rounded-xl border border-(--border) overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectionMode && <TableHead className="w-10" />}
            <SortHeader field="title">Title</SortHeader>
            <TableHead className="hidden md:table-cell">Status</TableHead>
            <TableHead className="hidden lg:table-cell">Priority</TableHead>
            <TableHead className="hidden md:table-cell">Tags</TableHead>
            <SortHeader field="authors">Authors</SortHeader>
            <SortHeader field="date_added">Added</SortHeader>
            <TableHead className="hidden xl:table-cell">Views</TableHead>
            {onDelete && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {papers.map((paper) => {
            const theme = getPaperTheme(paper.id);
            const isSelected = selectedIds.includes(paper.id);

            return (
              <TableRow
                key={paper.id}
                data-selected={isSelected}
                className={cn(selectionMode && 'cursor-pointer')}
                onClick={selectionMode && onSelect ? () => onSelect(paper.id) : undefined}
              >
                {/* Checkbox cell */}
                {selectionMode && (
                  <TableCell className="pr-0">
                    <div className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      isSelected
                        ? 'bg-(--foreground) border-(--foreground)'
                        : 'border-(--border)',
                    )}>
                      {isSelected && (
                        <CheckIcon size="xs" strokeWidth={3} className="text-(--background)" />
                      )}
                    </div>
                  </TableCell>
                )}

                {/* Title */}
                <TableCell className="max-w-xs">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      {/* Color dot matching paper theme */}
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: theme.accent }} />
                      {selectionMode ? (
                        <span className="text-code font-medium line-clamp-1">{paper.title}</span>
                      ) : (
                        <Link
                          to={`/papers/${paper.id}`}
                          className="text-code font-medium line-clamp-1 hover:underline underline-offset-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {paper.title}
                        </Link>
                      )}
                      {paper.processing_status && paper.processing_status !== 'completed' && (
                        <ProcessingStatusBadge status={paper.processing_status} paperId={paper.id} />
                      )}
                    </div>
                    {paper.doi && (
                      <span className="text-caption text-(--muted-foreground) pl-4">{paper.doi}</span>
                    )}
                  </div>
                </TableCell>

                {/* Reading status */}
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-1.5">
                    {paper.reading_status
                      ? <ReadingStatusBadge status={paper.reading_status} />
                      : <span className="text-(--muted-foreground) text-caption">—</span>
                    }
                    {paper.is_shared && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[0.625rem] font-medium bg-(--sky-blue)/10 text-(--sky-blue)" title="Shared with you">
                        <UsersIcon size="xs" />
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Priority */}
                <TableCell className="hidden lg:table-cell">
                  {paper.priority && paper.priority !== 'low'
                    ? <PriorityBadge priority={paper.priority} />
                    : <span className="text-(--muted-foreground) text-caption">—</span>
                  }
                </TableCell>

                {/* Tags */}
                <TableCell className="hidden md:table-cell">
                  {paper.tags && paper.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {paper.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="px-1.5 py-0.5 rounded text-micro font-semibold"
                          style={{ backgroundColor: theme.accent, color: theme.text }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {paper.tags.length > 3 && (
                        <span className="text-micro text-(--muted-foreground)">+{paper.tags.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-(--muted-foreground) text-caption">—</span>
                  )}
                </TableCell>

                {/* Authors */}
                <TableCell className="max-w-45 truncate text-caption text-(--muted-foreground)">
                  {(paper.metadata_json?.authors_list as string[] | undefined)?.join(', ')
                    ?? (paper.metadata_json?.author as string | undefined)
                    ?? '—'}
                </TableCell>

                {/* Date added */}
                <TableCell className="text-caption text-(--muted-foreground) whitespace-nowrap">
                  {format(new Date(paper.created_at), 'MMM d, yyyy')}
                </TableCell>

                {/* Views */}
                <TableCell className="hidden xl:table-cell text-caption text-(--muted-foreground)">
                  {paper.viewed_count ?? 0}
                </TableCell>

                {/* Delete */}
                {onDelete && (
                  <TableCell>
                    <Button
                      variant="icon"
                      size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); onDelete(paper.id); }}
                      className="opacity-0 group-hover:opacity-100 hover:text-(--destructive) hover:bg-(--destructive)/5"
                      title="Delete paper"
                      aria-label="Delete paper"
                    >
                      <TrashIcon size="sm" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
