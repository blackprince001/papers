import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowUpDown, Trash2, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/Button';
import type { Paper } from '@/lib/api/papers';

interface PaperTableProps {
  papers: Paper[];
  onSort?: (field: string) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onDelete?: (paperId: number) => void;
  inSelectionMode?: boolean;
  selectedIds?: number[];
  onSelect?: (paperId: number) => void;
  // sortBy and sortOrder are for future use when backend sorting is implemented
}

export function PaperTable({ papers, onSort, onDelete, inSelectionMode, selectedIds, onSelect }: PaperTableProps) {
  const getFileType = (paper: Paper): string => {
    if (paper.file_path)
    {
      const ext = paper.file_path.split('.').pop()?.toLowerCase();
      return ext ? ext.toUpperCase() : 'PDF';
    }
    return 'PDF';
  };

  const getContentPreview = (paper: Paper): string => {
    if (paper.content_text)
    {
      return paper.content_text.substring(0, 100) + (paper.content_text.length > 100 ? '...' : '');
    }
    return '—';
  };

  const getSummary = (paper: Paper): string => {
    // For now, use a placeholder. This could be extracted from metadata or generated
    return paper.metadata_json?.summary || '—';
  };

  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => {
    if (!onSort) return <TableHead>{children}</TableHead>;

    return (
      <TableHead>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 p-0 hover:bg-transparent"
          onClick={() => onSort(field)}
        >
          {children}
          <ArrowUpDown size={14} className="ml-2" />
        </Button>
      </TableHead>
    );
  };

  return (
    <div className="overflow-hidden rounded-sm border border-green-6">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader field="title">Title</SortableHeader>
            <TableHead className="hidden md:table-cell">Authors</TableHead>
            <TableHead className="hidden md:table-cell">DOI</TableHead>
            <TableHead className="hidden lg:table-cell">Added</TableHead>
            <TableHead className="hidden xl:table-cell">Full text</TableHead>
            <TableHead className="hidden xl:table-cell">Viewed</TableHead>
            <TableHead className="hidden lg:table-cell">File type</TableHead>
            <TableHead className="hidden lg:table-cell">Tags</TableHead>
            <TableHead className="hidden xl:table-cell">Summary</TableHead>
            {onDelete && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {papers.map((paper) => (
            <TableRow
              key={paper.id}
              className={cn(
                "cursor-pointer",
                inSelectionMode && "cursor-pointer",
                selectedIds?.includes(paper.id) && "bg-muted"
              )}
              onClick={() => {
                if (inSelectionMode && onSelect)
                {
                  onSelect(paper.id);
                }
              }}
            >
              <TableCell className="font-medium max-w-[180px] sm:max-w-[300px] lg:max-w-[400px] truncate" title={paper.title}>
                <div className="flex items-center gap-3">
                  {inSelectionMode && (
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors mr-2 flex-shrink-0",
                        selectedIds?.includes(paper.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"
                      )}
                    >
                      {selectedIds?.includes(paper.id) && <CheckSquare className="w-3 h-3" />}
                    </div>
                  )}
                  {inSelectionMode ? (
                    <span className="truncate">{paper.title}</span>
                  ) : (
                    <Link
                      to={`/papers/${paper.id}`}
                      className="text-green-38 hover:text-blue-43 hover:underline truncate"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {paper.title}
                    </Link>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted max-w-[200px] truncate hidden md:table-cell">
                {paper.metadata_json?.authors_list && Array.isArray(paper.metadata_json.authors_list) && paper.metadata_json.authors_list.length > 0
                  ? paper.metadata_json.authors_list.join(', ')
                  : paper.metadata_json?.author || '—'}
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted max-w-[150px] truncate hidden md:table-cell">
                {paper.doi || '—'}
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted hidden lg:table-cell">
                {format(new Date(paper.created_at), 'MMM d, yyyy')}
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted max-w-xs truncate hidden xl:table-cell">
                {getContentPreview(paper)}
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted hidden xl:table-cell">
                {paper.viewed_count || 0}
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted hidden lg:table-cell">
                {getFileType(paper)}
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted hidden lg:table-cell">
                {paper.tags && paper.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {paper.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        className="px-1.5 py-0.5 bg-green-4 text-green-38 rounded-sm text-xs"
                      >
                        {tag.name}
                      </span>
                    ))}
                    {paper.tags.length > 3 && (
                      <span className="text-xs text-green-28">+{paper.tags.length - 3}</span>
                    )}
                  </div>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-sm text-anara-light-text-muted max-w-xs truncate hidden xl:table-cell">
                {getSummary(paper)}
              </TableCell>
              {onDelete && (
                <TableCell className="text-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(paper.id);
                    }}
                    title="Delete paper"
                  >
                    <Trash2 size={16} />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

