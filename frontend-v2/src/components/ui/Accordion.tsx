import { createContext, useContext, useState, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from '../icons';

// ── Context ────────────────────────────────────────────────────────────────

interface AccordionContextValue {
  openItems: string[];
  toggle: (value: string) => void;
}

const AccordionContext = createContext<AccordionContextValue>({ openItems: [], toggle: () => {} });
const useAccordion = () => useContext(AccordionContext);

const AccordionItemContext = createContext<string>('');
const useAccordionItem = () => useContext(AccordionItemContext);

// ── Components ─────────────────────────────────────────────────────────────

interface AccordionProps extends HTMLAttributes<HTMLDivElement> {
  type?: 'single' | 'multiple';
  defaultValue?: string | string[];
}

export function Accordion({ type = 'single', defaultValue, className, children, ...props }: AccordionProps) {
  const initial = defaultValue
    ? Array.isArray(defaultValue) ? defaultValue : [defaultValue]
    : [];

  const [openItems, setOpenItems] = useState<string[]>(initial);

  const toggle = (value: string) => {
    setOpenItems((prev) => {
      const isOpen = prev.includes(value);
      if (type === 'single') return isOpen ? [] : [value];
      return isOpen ? prev.filter((v) => v !== value) : [...prev, value];
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className={cn('divide-y divide-(--border)', className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function AccordionItem({ value, className, children, ...props }: AccordionItemProps) {
  return (
    <AccordionItemContext.Provider value={value}>
      <div className={cn('py-0', className)} {...props}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

interface AccordionTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function AccordionTrigger({ className, children, ...props }: AccordionTriggerProps) {
  const { openItems, toggle } = useAccordion();
  const value = useAccordionItem();
  const isOpen = openItems.includes(value);

  return (
    <button
      onClick={() => toggle(value)}
      aria-expanded={isOpen}
      className={cn(
        'flex w-full items-center justify-between py-3',
        'text-code font-medium text-(--foreground) text-left',
        'hover:opacity-70 transition-opacity duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)/20 rounded-sm',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon
        size="sm"
        className={cn(
          'text-(--muted-foreground) transition-transform duration-200',
          isOpen && 'rotate-180',
        )}
      />
    </button>
  );
}

interface AccordionContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function AccordionContent({ className, children, ...props }: AccordionContentProps) {
  const { openItems } = useAccordion();
  const value = useAccordionItem();
  if (!openItems.includes(value)) return null;

  return (
    <div className={cn('pb-3 text-code text-(--muted-foreground)', className)} {...props}>
      {children}
    </div>
  );
}
