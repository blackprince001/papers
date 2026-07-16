import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowUpRightIcon, BookOpenIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { CitedSource } from '@/lib/api/deepResearch';
import type { ReferenceManifestEntry } from '@/lib/api/references';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Category = 'library' | 'academic' | 'web';

const CATEGORY_LABEL: Record<Category, string> = {
  library: 'Library',
  academic: 'Academic',
  web: 'Web',
};

// One normalized shape for every citation — a library paper cited inline, an
// academic paper from discovery, or a web/OpenAlex result — so the panel renders
// them all as one dense, scannable list.
interface CitationItem {
  key: string;
  category: Category;
  title: string;
  meta: string | null;
  target: string | null;
  addUrl: string | null;
  internal: boolean;
}

function authorsLabel(a: CitedSource['authors']): string {
  if (!a) return '';
  if (Array.isArray(a)) {
    const names = a.filter(Boolean);
    if (names.length === 0) return '';
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
  }
  return String(a);
}

const isWeb = (s: CitedSource) => s.type === 'web';

function toItems(
  references: ReferenceManifestEntry[],
  sources: CitedSource[],
): CitationItem[] {
  const items: CitationItem[] = [];

  // Library citations first — they're what the report leans on most.
  references.forEach((e, i) => {
    items.push({
      key: `ref-${e.kind}/${e.id}-${i}`,
      category: 'library',
      title: e.title || e.label || `${e.kind} ${e.id}`,
      meta: e.subtitle || null,
      target: e.target,
      addUrl: null,
      internal: e.internal,
    });
  });

  sources.forEach((s, i) => {
    const web = isWeb(s);
    const authors = authorsLabel(s.authors);
    const meta =
      [authors, s.year != null ? String(s.year) : ''].filter(Boolean).join(' · ') || null;
    items.push({
      key: `src-${s.url ?? s.title}-${i}`,
      category: web ? 'web' : 'academic',
      title: s.title,
      meta,
      target: s.url ?? null,
      addUrl: s.url ?? null,
      internal: false,
    });
  });

  return items;
}

export function CitationsPanel({
  sources,
  references = [],
  onAdd,
  addingUrl,
}: {
  sources: CitedSource[];
  references?: ReferenceManifestEntry[];
  onAdd: (url: string) => void;
  addingUrl: string | null;
}) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const items = useMemo(() => toItems(references, sources), [references, sources]);
  const [tab, setTab] = useState<'all' | Category>('all');

  const counts = {
    library: items.filter((i) => i.category === 'library').length,
    academic: items.filter((i) => i.category === 'academic').length,
    web: items.filter((i) => i.category === 'web').length,
  };

  const tabs = [
    { id: 'all' as const, label: 'All', n: items.length },
    { id: 'library' as const, label: 'Library', n: counts.library },
    { id: 'academic' as const, label: 'Academic', n: counts.academic },
    { id: 'web' as const, label: 'Web', n: counts.web },
  ].filter((t) => t.id === 'all' || t.n > 0);

  // Only tag rows with their category when the list actually mixes types —
  // stamping "Library" on 36 library rows is noise the tab already conveys.
  const multiCategory = new Set(items.map((i) => i.category)).size > 1;
  const shown = tab === 'all' ? items : items.filter((i) => i.category === tab);

  const openTarget = (target: string | null) => {
    if (!target) return;
    if (/^https?:\/\//.test(target)) window.open(target, '_blank', 'noopener,noreferrer');
    else navigate(target);
  };

  return (
    <div className="rounded-xl border border-(--border) bg-(--card) overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-(--border) text-code font-medium text-(--foreground)">
        <BookOpenIcon size={15} className="text-(--muted-foreground)" />
        Citations <span className="text-(--muted-foreground)">({items.length})</span>
      </div>

      {/* Segmented tabs */}
      {tabs.length > 1 && (
        <div className="px-3 pt-2.5">
          <div className="inline-flex rounded-full bg-(--muted) p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 h-7 rounded-full text-caption font-medium transition-colors',
                  tab === t.id
                    ? 'bg-(--card) text-(--foreground) shadow-(--shadow-subtle)'
                    : 'text-(--muted-foreground) hover:text-(--foreground)',
                )}
              >
                {t.label}
                {t.id !== 'all' && <span className="text-(--muted-foreground)"> ({t.n})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dense, scrollable list — never lets a long bibliography swallow the page. */}
      <AnimatePresence initial={false} mode="wait">
        <motion.ul
          key={tab}
          initial={reduce ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: EASE_OUT }}
          className="max-h-80 overflow-y-auto py-1"
        >
          {shown.map((it) => (
            <li key={it.key}>
              <div
                role="button"
                tabIndex={it.target ? 0 : -1}
                onClick={() => openTarget(it.target)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && it.target) {
                    e.preventDefault();
                    openTarget(it.target);
                  }
                }}
                title={it.meta ? `${it.title} — ${it.meta}` : it.title}
                className={cn(
                  'group flex items-center gap-3 px-4 py-1.5 transition-colors',
                  it.target ? 'cursor-pointer hover:bg-(--muted)/50' : 'cursor-default',
                )}
              >
                <span className="flex-1 min-w-0 text-code text-(--foreground) truncate">
                  {it.title}
                </span>
                {multiCategory && (
                  <span className="shrink-0 text-[0.625rem] uppercase tracking-wider text-(--muted-foreground)">
                    {CATEGORY_LABEL[it.category]}
                  </span>
                )}
                {it.addUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(it.addUrl as string);
                    }}
                    disabled={addingUrl === it.addUrl}
                    className="shrink-0 text-caption font-medium text-(--muted-foreground) hover:text-(--foreground) opacity-0 group-hover:opacity-100 focus:opacity-100 transition disabled:opacity-50"
                  >
                    {addingUrl === it.addUrl ? 'Adding…' : 'Add'}
                  </button>
                )}
                {it.target && (
                  <ArrowUpRightIcon
                    size={14}
                    className="shrink-0 text-(--muted-foreground) opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                )}
              </div>
            </li>
          ))}
        </motion.ul>
      </AnimatePresence>
    </div>
  );
}

export default CitationsPanel;
