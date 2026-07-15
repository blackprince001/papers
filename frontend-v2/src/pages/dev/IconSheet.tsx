import { useMemo, useState, type ComponentType } from 'react';
import * as icons from '../../components/icons';
import { ICON_SIZES, type IconProps, type IconSize } from '../../components/icons';

/* Dev-only review surface for the icon set. Renders through the real
 * createIcon pipeline (stroke correction, presets, filled variants) inside
 * the app's actual CSS vars, so what's approved here is what ships. */

const PRESETS = Object.keys(ICON_SIZES) as IconSize[];

function isIconExport(name: string, value: unknown): value is ComponentType<IconProps> {
  return name.endsWith('Icon') && typeof value === 'function';
}

export default function IconSheet() {
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [filled, setFilled] = useState(false);

  const entries = useMemo(
    () =>
      Object.entries(icons)
        .filter(([name, value]) => isIconExport(name, value))
        .sort(([a], [b]) => a.localeCompare(b)) as [string, ComponentType<IconProps>][],
    [],
  );

  const visible = entries.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()));

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setDark(document.documentElement.classList.contains('dark'));
  };

  return (
    <div className="min-h-dvh bg-(--background) text-(--foreground) px-8 py-10">
      <div className="mx-auto max-w-(--width-content-max)">
        <header className="flex flex-wrap items-center gap-4">
          <div>
            <h1>Lumen Icons</h1>
            <p className="text-code text-(--muted-foreground)">
              {entries.length} glyphs · rounded outline · 1.5u stroke · 24 grid
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter icons…"
              className="h-9 w-56 rounded-lg border border-(--border) bg-(--white) px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-(--ring)/20"
            />
            <button
              onClick={() => setFilled((f) => !f)}
              className="h-9 rounded-lg border border-(--border) px-3 text-btn-sm hover:bg-(--muted)"
            >
              {filled ? 'Filled' : 'Outline'}
            </button>
            <button
              onClick={toggleDark}
              className="h-9 rounded-lg border border-(--border) px-3 text-btn-sm hover:bg-(--muted)"
            >
              {dark ? 'Dark' : 'Light'}
            </button>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
          {visible.map(([name, Glyph]) => (
            <div
              key={name}
              className="rounded-2xl border border-(--border) bg-(--card) p-4 flex flex-col items-center gap-3"
            >
              <Glyph size={96 as number} filled={filled} strokeWidth={1.5} />
              <div className="flex items-end gap-2">
                {PRESETS.map((p) => (
                  <span key={p} title={`${p} · ${ICON_SIZES[p]}px`} className="inline-flex">
                    <Glyph size={p} filled={filled} />
                  </span>
                ))}
              </div>
              <code className="text-micro text-(--muted-foreground)">{name}</code>
            </div>
          ))}
        </div>

        {visible.length === 0 && (
          <p className="mt-16 text-center text-body text-(--muted-foreground)">
            No icons match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
