import { useState } from 'react';
import { MoonIcon, SunIcon, MonitorIcon } from '@/components/icons';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { SettingsSection } from './SettingsSection';

type ThemeMode = 'light' | 'dark' | 'system';

const MODES: Record<ThemeMode, { label: string; icon: React.ElementType }> = {
  light: { label: 'Light', icon: SunIcon },
  dark: { label: 'Dark', icon: MoonIcon },
  system: { label: 'System', icon: MonitorIcon },
};

/* One pane of the mini fake-UI preview, drawn entirely from semantic theme
 * tokens. Wrapping a pane in the `.dark` class re-scopes those tokens to
 * their real dark values (the same mechanism the app root uses), so the
 * swatch never duplicates palette colors. */
function PreviewPane() {
  return (
    <div className="flex h-full w-full flex-col gap-1 bg-(--background) p-2">
      <div className="h-1.5 w-3/4 rounded-full bg-(--muted)" />
      <div className="h-1.5 w-1/2 rounded-full bg-(--border)" />
    </div>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  if (mode === 'system') {
    return (
      <div className="mb-3 grid h-16 w-full grid-cols-2 overflow-hidden rounded-lg border border-(--border)">
        <PreviewPane />
        <div className="dark h-full">
          <PreviewPane />
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'mb-3 h-16 w-full overflow-hidden rounded-lg border border-(--border)',
        mode === 'dark' && 'dark',
      )}
    >
      <PreviewPane />
    </div>
  );
}

function ThemeCard({
  mode, current, onSelect,
}: {
  mode: ThemeMode;
  current: ThemeMode;
  onSelect: (m: ThemeMode) => void;
}) {
  const { label, icon: Icon } = MODES[mode];
  const active = mode === current;

  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      aria-pressed={active}
      className={cn(
        'flex w-full flex-col items-center rounded-xl border-2 p-3 transition-colors',
        active
          ? 'border-(--ring) bg-(--muted)'
          : 'border-(--border) hover:border-(--muted-foreground)',
      )}
    >
      <ThemePreview mode={mode} />
      <div className="flex items-center gap-1.5">
        <Icon size="sm" className={active ? 'text-(--foreground)' : 'text-(--muted-foreground)'} />
        <span
          className={cn(
            'text-code font-medium',
            active ? 'text-(--foreground)' : 'text-(--muted-foreground)',
          )}
        >
          {label}
        </span>
      </div>
    </button>
  );
}

export function AppearanceSection() {
  const { theme, toggle } = useTheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    theme === 'dark' ? 'dark' : 'light',
  );

  const handleTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    const wantDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (
      (wantDark && theme !== 'dark') ||
      (!wantDark && theme !== 'light')
    ) toggle();
  };

  return (
    <SettingsSection id="appearance" title="Appearance" caption="Customise how Lumen looks">
      <p className="mb-3 text-caption font-medium uppercase tracking-wide text-(--muted-foreground)">
        Theme
      </p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
          <ThemeCard key={m} mode={m} current={themeMode} onSelect={handleTheme} />
        ))}
      </div>
    </SettingsSection>
  );
}
