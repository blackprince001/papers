import {
  useState,
  useRef,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const PopoverContext = createContext<PopoverContextValue>({ open: false, setOpen: () => {} });
const usePopover = () => useContext(PopoverContext);

type PopoverSide = 'top' | 'bottom' | 'left' | 'right';
type PopoverAlign = 'start' | 'center' | 'end';

interface PopoverProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ children, open: controlledOpen, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <span className="relative inline-flex">{children}</span>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({ className, children, ...props }: HTMLAttributes<HTMLButtonElement>) {
  const { setOpen, open } = usePopover();
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn('inline-flex', className)}
      {...props}
    >
      {children}
    </button>
  );
}

interface PopoverContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: PopoverSide;
  align?: PopoverAlign;
  sideOffset?: number;
}

const sideMap: Record<PopoverSide, Record<PopoverAlign, string>> = {
  bottom: { start: 'top-full left-0 mt-1.5', center: 'top-full left-1/2 -translate-x-1/2 mt-1.5', end: 'top-full right-0 mt-1.5' },
  top: { start: 'bottom-full left-0 mb-1.5', center: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5', end: 'bottom-full right-0 mb-1.5' },
  left: { start: 'right-full top-0 mr-1.5', center: 'right-full top-1/2 -translate-y-1/2 mr-1.5', end: 'right-full bottom-0 mr-1.5' },
  right: { start: 'left-full top-0 ml-1.5', center: 'left-full top-1/2 -translate-y-1/2 ml-1.5', end: 'left-full bottom-0 ml-1.5' },
};

export function PopoverContent({
  side = 'bottom',
  align = 'start',
  className,
  children,
  ...props
}: PopoverContentProps) {
  const { open, setOpen } = usePopover();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-50 min-w-48',
        'bg-(--popover) border border-(--border) rounded-card',
        'p-1',
        sideMap[side][align],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Convenience menu item for use inside PopoverContent */
export function PopoverItem({ className, children, ...props }: HTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = usePopover();
  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 rounded-interactive',
        'text-code text-(--foreground) text-left',
        'hover:bg-(--muted) transition-colors duration-100',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
