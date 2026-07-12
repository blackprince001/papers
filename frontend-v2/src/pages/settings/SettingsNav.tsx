import { useEffect, useState, type MouseEvent } from 'react';
import { UserIcon, ChipIcon, PaletteIcon, ShieldIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'ai', label: 'AI Providers', icon: ChipIcon },
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'security', label: 'Security', icon: ShieldIcon },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

function scrollToSection(id: SectionId, smooth: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
}

/* Anchor nav for the Settings sections: a sticky left rail from lg up and a
 * sticky horizontal pill row below it. Active-section tracking is a single
 * IntersectionObserver over the four section anchors. */
export function SettingsNav() {
  const [active, setActive] = useState<SectionId>(() => {
    const hash = window.location.hash.slice(1);
    return isSectionId(hash) ? hash : 'profile';
  });

  // Honor a deep link (#ai etc.) on mount.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (isSectionId(hash)) scrollToSection(hash, false);
  }, []);

  useEffect(() => {
    const els = SECTIONS
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Topmost visible section wins.
        const current = SECTIONS.find((s) => visible.has(s.id));
        if (current) setActive(current.id);
      },
      { rootMargin: '-80px 0px -40% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleClick = (id: SectionId) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setActive(id);
    scrollToSection(id, true);
    window.history.replaceState(null, '', `#${id}`);
  };

  return (
    <>
      {/* Mobile / tablet: sticky horizontal pill row */}
      <nav
        aria-label="Settings sections"
        className="lg:hidden sticky top-0 z-10 -mx-4 mb-4 flex gap-1.5 overflow-x-auto scrollbar-none bg-(--panel-surface) px-4 py-2 backdrop-blur-sm md:-mx-6 md:px-6"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={handleClick(id)}
            aria-current={active === id ? 'true' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-caption transition-colors',
              active === id
                ? 'border-(--foreground) bg-(--foreground) font-medium text-(--card)'
                : 'border-(--border) bg-(--card) text-(--muted-foreground) hover:border-(--foreground)/30 hover:text-(--foreground)',
            )}
          >
            <Icon size="sm" />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      {/* Desktop: sticky left rail */}
      <aside className="hidden w-44 shrink-0 lg:block">
        <nav aria-label="Settings sections" className="sticky top-6 space-y-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={handleClick(id)}
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-lg px-3 text-code font-medium transition-colors',
                active === id
                  ? 'bg-(--muted) text-(--foreground)'
                  : 'text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)',
              )}
            >
              <Icon size="sm" className="shrink-0" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>
    </>
  );
}
