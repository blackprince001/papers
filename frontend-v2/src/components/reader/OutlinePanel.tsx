import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { cn } from '@/lib/utils';
import { SkeletonText } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { LibraryIllustration } from '@/components/illustrations';
import { extractTOC, type TOCItem } from './toc';

function OutlineList({
  items,
  depth,
  activePage,
  onNavigate,
}: {
  items: TOCItem[];
  depth: number;
  activePage: number;
  onNavigate: (page: number) => void;
}) {
  return (
    <ul className={cn(depth > 0 && 'ml-3 border-l border-(--border) pl-2')}>
      {items.map((item, i) => (
        <li key={`${item.title}-${i}`}>
          <button
            type="button"
            onClick={() => onNavigate(item.page)}
            className={cn(
              'flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-left text-caption transition-colors hover:bg-(--secondary)',
              activePage === item.page
                ? 'font-semibold text-(--foreground)'
                : 'text-(--muted-foreground)',
            )}
          >
            <span className="line-clamp-2">{item.title}</span>
            <span className="shrink-0 text-micro opacity-60">{item.page}</span>
          </button>
          {item.items && (
            <OutlineList
              items={item.items}
              depth={depth + 1}
              activePage={activePage}
              onNavigate={onNavigate}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function OutlinePanel({
  pdf,
  activePage,
  onNavigate,
}: {
  pdf: PDFDocumentProxy | null;
  activePage: number;
  onNavigate: (page: number) => void;
}) {
  // Keyed by the proxy the TOC was computed for, so a document change
  // shows "loading" again without a synchronous reset in the effect.
  const [result, setResult] = useState<{
    pdf: PDFDocumentProxy;
    toc: TOCItem[] | null;
  } | null>(null);

  useEffect(() => {
    if (!pdf) return;
    let current = true;
    void extractTOC(pdf).then((toc) => {
      if (current) setResult({ pdf, toc });
    });
    return () => {
      current = false;
    };
  }, [pdf]);

  const items = result && result.pdf === pdf ? result.toc : 'loading';

  if (items === 'loading') {
    return (
      <div className="px-3 py-4">
        <SkeletonText lines={6} lastLineWidth="w-1/2" />
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <EmptyState
        size="panel"
        illustration={LibraryIllustration}
        title="This document has no outline"
        description="The paper does not include a navigable table of contents."
        className="px-3 py-6"
      />
    );
  }
  return (
    <div className="p-2">
      <OutlineList items={items} depth={0} activePage={activePage} onNavigate={onNavigate} />
    </div>
  );
}
