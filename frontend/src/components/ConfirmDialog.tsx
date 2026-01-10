import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook for easier usage
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => void;
  } | null>(null);

  const confirm = (
    title: string,
    description: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      cancelLabel?: string;
      variant?: 'default' | 'destructive';
    }
  ) => {
    setConfig({
      title,
      description,
      onConfirm,
      confirmLabel: options?.confirmLabel,
      cancelLabel: options?.cancelLabel,
      variant: options?.variant,
    });
    setOpen(true);
  };

  const dialog = config ? (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title={config.title}
      description={config.description}
      confirmLabel={config.confirmLabel}
      cancelLabel={config.cancelLabel}
      variant={config.variant}
      onConfirm={config.onConfirm}
    />
  ) : null;

  return { confirm, dialog };
}

