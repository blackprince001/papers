import { createContext, useContext, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * `underline` — the default scholarly look: a bottom border that fills in on
 * the active tab. `segmented` — a muted pill track where the active segment
 * lifts on the background surface (view switchers, mode toggles). `plain` —
 * no built-in borders/padding; the consumer's className fully controls the
 * look (used for the background-pill tabs in the paper view). All variants
 * expose `data-state="active|inactive"` so callers can style with
 * `data-[state=active]:…` utilities.
 */
type TabsVariant = 'underline' | 'segmented' | 'plain';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>');
  return ctx;
}

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
  variant?: TabsVariant;
}

export function Tabs({ value, onValueChange, variant = 'underline', className, children, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange, variant }}>
      <div className={cn('flex flex-col', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { variant } = useTabsContext();
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5',
        variant === 'underline' && 'border-b border-(--border)',
        variant === 'segmented' && 'rounded-(--radius-interactive) bg-(--muted) p-0.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string;
  disabled?: boolean;
}

export function TabsTrigger({ value, disabled, className, children, ...props }: TabsTriggerProps) {
  const { value: activeValue, onValueChange, variant } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-disabled={disabled}
      data-state={isActive ? 'active' : 'inactive'}
      disabled={disabled}
      onClick={() => !disabled && onValueChange(value)}
      className={cn(
        'text-code font-medium leading-5 transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)/20',
        variant === 'underline' && [
          'px-3 py-2 border-b-2 -mb-px rounded-t-sm',
          isActive
            ? 'border-(--foreground) text-(--foreground)'
            : 'border-transparent text-(--muted-foreground) hover:text-(--foreground) hover:border-(--border)',
        ],
        variant === 'segmented' && [
          'px-3 py-1.5 rounded-[calc(var(--radius-interactive)-2px)]',
          isActive
            ? 'bg-(--background) text-(--foreground) shadow-(--shadow-subtle)'
            : 'text-(--muted-foreground) hover:text-(--foreground)',
        ],
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const { value: activeValue } = useTabsContext();
  if (activeValue !== value) return null;

  return (
    <div role="tabpanel" className={cn('flex-1 outline-none', className)} {...props}>
      {children}
    </div>
  );
}

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}
