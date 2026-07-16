import type { ReactNode } from 'react';
import {
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  ModalRoot,
} from '@heroui/react';
import { cn } from '@/lib/utils';
import { CloseIcon } from '../icons';
import { Button } from './Button';

/* Lumen facade over the HeroUI v3 Modal (React Aria). Historical API kept:
 * open/onClose/title/description/size + DialogFooter. Focus trapping,
 * scroll locking, and Escape/backdrop dismissal come from React Aria. */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Max width tier, defaults to md */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const heroSize = { sm: 'sm', md: 'md', lg: 'lg', xl: 'lg' } as const;

export function Dialog({ open, onClose, title, description, children, className, size = 'md' }: DialogProps) {
  return (
    <ModalRoot isOpen={open} onOpenChange={(o) => !o && onClose()}>
      <ModalBackdrop>
        <ModalContainer placement="center" size={heroSize[size]}>
          <ModalDialog className={cn('relative', size === 'xl' && 'max-w-2xl', className)}>
            {/* Pinned to the corner, out of the header flow — HeroUI's ModalHeader
                lays its children out in a column, so an in-header close button
                lands below the text instead of beside it. */}
            <Button
              variant="icon"
              size="icon-sm"
              aria-label="Close"
              onClick={onClose}
              className="absolute top-3 right-3 z-10"
            >
              <CloseIcon size="sm" />
            </Button>
            {(title || description) && (
              <ModalHeader>
                <div className="flex flex-col gap-0.5 pr-8">
                  {title && <ModalHeading className="text-body font-semibold">{title}</ModalHeading>}
                  {description && (
                    <p className="text-caption text-(--muted-foreground)">{description}</p>
                  )}
                </div>
              </ModalHeader>
            )}
            <ModalBody>{children}</ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

/** Convenience row for dialog footer actions */
export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-2 pt-4', className)}>{children}</div>
  );
}
