import type { AISource } from '@/lib/ai/events';
import { cn } from '@/lib/utils';

export interface AISourceListProps {
  sources: AISource[];
  className?: string;
}

/** Bounded, normalized source links for an AI response. */
export function AISourceList({ sources, className }: AISourceListProps) {
  if (sources.length === 0) return null;

  return (
    <section
      aria-label="Sources"
      className={cn('mt-4 border-t border-(--border) pt-3', className)}
    >
      <h3 className="mb-2 text-caption font-medium text-(--muted-foreground)">Sources</h3>
      <ul className="space-y-1.5">
        {sources.map((source) => {
          const title = source.title || source.label;
          const content = (
            <>
              <span className="block truncate text-code text-(--foreground)">{title}</span>
              {source.title && source.label !== source.title && (
                <span className="block truncate text-micro text-(--muted-foreground)">
                  {source.label}
                </span>
              )}
            </>
          );

          return (
            <li key={`${source.kind}:${source.id}`}>
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md px-1.5 py-1 hover:bg-(--muted)/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
                >
                  {content}
                </a>
              ) : (
                <div className="rounded-md px-1.5 py-1">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default AISourceList;
