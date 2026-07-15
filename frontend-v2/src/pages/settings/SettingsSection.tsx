import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* Shared shells for the Settings page: the uniform section card, the
 * uppercase field label, and the ok/err status line used by the form
 * sections. Purely presentational — all behavior stays with callers. */

interface SettingsSectionProps {
  /** Anchor id targeted by the section nav. */
  id: string;
  title: string;
  caption?: string;
  /** Rendered on the right of the header row (e.g. an Add button). */
  actions?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({ id, title, caption, actions, children }: SettingsSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-20 lg:scroll-mt-6 rounded-2xl border border-(--border) bg-(--card) p-4 sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-subheading text-(--foreground)">
            {title}
          </h2>
          {caption && (
            <p className="mt-0.5 text-caption text-(--muted-foreground)">{caption}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-caption font-medium uppercase tracking-wide text-(--muted-foreground)"
    >
      {children}
    </label>
  );
}

export type SectionStatus = { kind: 'ok' | 'err'; text: string } | null;

export function StatusMessage({ status }: { status: SectionStatus }) {
  if (!status) return null;
  return (
    <p
      role="status"
      className={cn(
        'text-caption',
        status.kind === 'ok' ? 'text-(--success)' : 'text-(--danger)',
      )}
    >
      {status.text}
    </p>
  );
}
