import { Badge } from '@/components/ui/badge';

interface PriorityBadgeProps {
  priority: 'low' | 'medium' | 'high' | 'critical';
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const priorityConfig = {
    low: { label: 'Low', variant: 'secondary' as const, className: 'bg-green-4 text-green-34' },
    medium: { label: 'Medium', variant: 'default' as const, className: 'bg-yellow-2 text-yellow-5' },
    high: { label: 'High', variant: 'default' as const, className: 'bg-yellow-3 text-yellow-5' },
    critical: { label: 'Critical', variant: 'destructive' as const, className: 'bg-red-4 text-red-17' },
  };

  const config = priorityConfig[priority];

  return (
    <Badge variant={config.variant} className={`${config.className} ${className || ''}`}>
      {config.label}
    </Badge>
  );
}

