import { Badge } from '@/components/ui/badge';

interface ReadingStatusBadgeProps {
  status: 'not_started' | 'in_progress' | 'read' | 'archived';
  className?: string;
}

export function ReadingStatusBadge({ status, className }: ReadingStatusBadgeProps) {
  const statusConfig = {
    not_started: { label: 'Not Started', variant: 'secondary' as const, className: 'bg-green-4 text-green-34' },
    in_progress: { label: 'In Progress', variant: 'default' as const, className: 'bg-blue-14 text-blue-43' },
    read: { label: 'Read', variant: 'default' as const, className: 'bg-green-12 text-green-22' },
    archived: { label: 'Archived', variant: 'secondary' as const, className: 'bg-green-5 text-green-28' },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={`${config.className} ${className || ''}`}>
      {config.label}
    </Badge>
  );
}

