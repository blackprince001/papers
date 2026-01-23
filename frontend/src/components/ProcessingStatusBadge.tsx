import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface ProcessingStatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  className?: string;
}

export function ProcessingStatusBadge({ status, className }: ProcessingStatusBadgeProps) {
  const statusConfig = {
    pending: { label: 'Pending', variant: 'secondary' as const, className: 'bg-yellow-100 text-yellow-800', showSpinner: false },
    processing: { label: 'Processing', variant: 'default' as const, className: 'bg-blue-100 text-blue-800', showSpinner: true },
    completed: { label: 'Processed', variant: 'default' as const, className: 'bg-green-100 text-green-800', showSpinner: false },
    failed: { label: 'Failed', variant: 'destructive' as const, className: 'bg-red-100 text-red-800', showSpinner: false },
  };

  const config = statusConfig[status];

  // Don't show badge for completed or pending status
  if (status === 'completed' || status === 'pending') {
    return null;
  }

  return (
    <Badge variant={config.variant} className={`${config.className} ${className || ''}`}>
      {config.showSpinner && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {config.label}
    </Badge>
  );
}
