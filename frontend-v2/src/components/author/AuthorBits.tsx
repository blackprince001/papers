import type { ComponentType } from 'react';
import type { IconProps } from '@/components/icons';
import { cn } from '@/lib/utils';

/** Theme tints that have CSS variables defined in index.css (light + dark). */
const TINTS = ['olive', 'blue', 'green', 'terracotta', 'sage', 'slate', 'sand', 'beige'] as const;

function tintFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Initials avatar with a deterministic per-author tint. */
export function AuthorAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const tint = tintFor(name);
  const dimensions = size === 'lg' ? 'size-14 text-body-lg' : size === 'sm' ? 'size-9 text-caption' : 'size-11 text-body';
  return (
    <div
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', dimensions)}
      style={{
        backgroundColor: `var(--theme-${tint}-accent)`,
        color: `var(--theme-${tint}-text)`,
        border: `1px solid var(--theme-${tint}-border)`,
      }}
    >
      {initials(name)}
    </div>
  );
}

/** Compact stat tile used in the author header. */
export function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  value?: number | null;
}) {
  return (
    <div className="rounded-card border border-(--border) bg-(--card) px-4 py-3 transition-colors hover:border-(--foreground)/20">
      <div className="mb-1 flex items-center gap-1.5 text-(--muted-foreground)">
        <Icon size="xs" />
        <span className="text-micro uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-stat leading-none tabular-nums text-(--foreground)">
        {value != null ? value.toLocaleString() : '—'}
      </p>
    </div>
  );
}

/** Research-topic chip. */
export function TopicChip({ label }: { label: string }) {
  return (
    <span className="rounded-pill border border-(--border) bg-(--muted)/40 px-2.5 py-1 text-caption text-(--foreground)">
      {label}
    </span>
  );
}
