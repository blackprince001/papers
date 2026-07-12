import { useEffect, useState } from 'react';
import {
  UserIcon,
  PaletteIcon,
  MoonIcon,
  SunIcon,
  MonitorIcon,
  ChevronRightIcon,
  ShieldIcon,
  LogoutIcon,
  TrashIcon,
  ChipIcon,
  PlusIcon,
  EditIcon,
  CheckCircleIcon,
} from '@/components/icons';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  userAiSettingsApi,
  userAiProvidersApi,
  type ModelInfo,
  type ProviderInfo,
  type UserAiProvider,
} from '@/lib/api';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'ai', label: 'AI', icon: ChipIcon },
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'security', label: 'Security', icon: ShieldIcon },
] as const;

type SectionId = typeof SECTIONS[number]['id'];


type ThemeMode = 'light' | 'dark' | 'system';

function ThemeCard({
  mode, current, onSelect,
}: {
  mode: ThemeMode;
  current: ThemeMode;
  onSelect: (m: ThemeMode) => void;
}) {
  const LABELS: Record<ThemeMode, { label: string; icon: React.ElementType }> = {
    light: { label: 'Light', icon: SunIcon },
    dark: { label: 'Dark', icon: MoonIcon },
    system: { label: 'System', icon: MonitorIcon },
  };
  const { label, icon: Icon } = LABELS[mode];
  const active = mode === current;

  // Tiny preview swatch
  const Preview = () => {
    const bg = mode === 'dark' ? '#111111' : mode === 'light' ? '#ffffff' : 'linear-gradient(135deg,#fff 50%,#111 50%)';
    const border = mode === 'dark' ? '#2e2e2e' : '#e5e5e5';
    return (
      <div
        className="w-full h-16 rounded-lg mb-3 border"
        style={{
          background: typeof bg === 'string' ? bg : bg,
          borderColor: border,
        }}
      >
        {/* Mini fake UI */}
        <div className="p-2 flex flex-col gap-1">
          <div
            className="h-1.5 w-3/4 rounded-full"
            style={{ background: mode === 'dark' ? '#333' : '#e5e5e5' }}
          />
          <div
            className="h-1.5 w-1/2 rounded-full"
            style={{ background: mode === 'dark' ? '#2a2a2a' : '#ebebeb' }}
          />
        </div>
      </div>
    );
  };

  return (
    <button
      onClick={() => onSelect(mode)}
      className={cn(
        'flex flex-col items-center p-3 rounded-xl border-2 transition-all w-full',
        active
          ? 'border-(--foreground) bg-(--muted)'
          : 'border-(--border) hover:border-(--muted-foreground)',
      )}
    >
      <Preview />
      <div className="flex items-center gap-1.5">
        <Icon size="sm" className={active ? 'text-(--foreground)' : 'text-(--muted-foreground)'} />
        <span className={cn('text-code font-medium', active ? 'text-(--foreground)' : 'text-(--muted-foreground)')}>
          {label}
        </span>
      </div>
    </button>
  );
}

function ProfileSection() {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [organization, setOrganization] = useState(user?.organization ?? '');
  const [department, setDepartment] = useState(user?.department ?? '');
  const [researchField, setResearchField] = useState(user?.research_field ?? '');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(user?.display_name ?? '');
    setOrganization(user?.organization ?? '');
    setDepartment(user?.department ?? '');
    setResearchField(user?.research_field ?? '');
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile({
        display_name: displayName || undefined,
        organization: organization || undefined,
        department: department || undefined,
        research_field: researchField || undefined,
        bio: bio || undefined,
      });
      setStatus({ kind: 'ok', text: 'Profile updated' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const initials = (user?.display_name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-subheading font-semibold text-(--foreground) mb-1">Profile</h2>
        <p className="text-code text-(--muted-foreground)">Manage your personal information</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-(--muted) flex items-center justify-center border-2 border-(--border) overflow-hidden">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-subheading font-semibold text-(--muted-foreground)">{initials}</span>
          )}
        </div>
        <div>
          <p className="text-body font-medium text-(--foreground)">{user?.display_name || '—'}</p>
          <p className="text-caption text-(--muted-foreground)">{user?.email || '—'}</p>
          <p className="text-caption text-(--muted-foreground) mt-0.5 uppercase tracking-wide">
            {user?.role === 'admin' ? 'Administrator' : 'Member'}
          </p>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <div>
          <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
            Display name
          </label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
            Email
          </label>
          <Input value={user?.email ?? ''} type="email" disabled />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
              Organization
            </label>
            <Input value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
              Department
            </label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
            Research field
          </label>
          <Input value={researchField} onChange={(e) => setResearchField(e.target.value)} />
        </div>
        <div>
          <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
            Bio
          </label>
          <textarea
            className="w-full bg-(--card) text-(--foreground) text-code px-3 py-2 h-20 rounded-lg border border-(--border) placeholder:text-(--muted-foreground) focus:outline-none focus:border-(--ring) resize-none"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about your research interests"
          />
        </div>
      </div>

      {status && (
        <p
          className={cn(
            'text-caption',
            status.kind === 'ok' ? 'text-(--success-green)' : 'text-(--destructive)',
          )}
        >
          {status.text}
        </p>
      )}

      <Button variant="primary" onClick={handleSave} loading={saving}>
        Save changes
      </Button>
    </div>
  );
}

function AppearanceSection() {
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
    <div className="space-y-6">
      <div>
        <h2 className="text-subheading font-semibold text-(--foreground) mb-1">Appearance</h2>
        <p className="text-code text-(--muted-foreground)">Customise how Lumen looks</p>
      </div>

      <div>
        <p className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-3">Theme</p>
        <div className="grid grid-cols-3 gap-3 sm:gap-3">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
            <ThemeCard key={m} mode={m} current={themeMode} onSelect={handleTheme} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SecuritySection() {
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      window.location.href = '/login';
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-subheading font-semibold text-(--foreground) mb-1">Security</h2>
        <p className="text-code text-(--muted-foreground)">Manage your account security</p>
      </div>

      <div className="border border-(--destructive)/30 rounded-xl p-4">
        <p className="text-caption font-semibold uppercase tracking-widest text-(--destructive) mb-4">
          Danger zone
        </p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-body font-medium text-(--foreground)">Sign out</p>
            <p className="text-caption text-(--muted-foreground)">End this session</p>
          </div>
          <Button
            variant="ghost"
            icon={<LogoutIcon size="sm" />}
            className="text-(--destructive)!"
            onClick={handleSignOut}
            loading={signingOut}
          >
            Sign out
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 opacity-60">
          <div>
            <p className="text-body font-medium text-(--foreground)">Delete account</p>
            <p className="text-caption text-(--muted-foreground)">Contact an administrator</p>
          </div>
          <Button variant="ghost" icon={<TrashIcon size="sm" />} className="text-(--destructive)!" disabled>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

type ProviderDraft = {
  label: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
};

const EMPTY_DRAFT: ProviderDraft = {
  label: '',
  provider: '',
  apiKey: '',
  baseUrl: '',
  model: '',
  isDefault: false,
};

const SELF_HOSTED = new Set(['ollama', 'vllm', 'openai-compatible']);

const KNOWN_PROVIDERS = new Set(['openai', 'anthropic', 'deepseek', 'gemini']);

function ProviderForm({
  draft, setDraft, providers, models, editing, onSave, onCancel, saving,
}: {
  draft: ProviderDraft;
  setDraft: (d: ProviderDraft) => void;
  providers: ProviderInfo[];
  models: ModelInfo[];
  editing: boolean;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const set = (patch: Partial<ProviderDraft>) => {
    const relevant = ['provider', 'apiKey', 'baseUrl', 'model'];
    if (relevant.some((k) => k in patch)) {
      setTestResult(null);
    }
    setDraft({ ...draft, ...patch });
  };
  const selectedProvider = providers.find((p) => p.type === draft.provider);
  const showModelSelect = KNOWN_PROVIDERS.has(draft.provider);
  const hideApiKey = SELF_HOSTED.has(draft.provider);
  const needsTest = !editing;

  const availableModels = models.filter((m) => m.provider === draft.provider);
  const noModels = draft.provider !== '' && showModelSelect && availableModels.length === 0;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await userAiSettingsApi.testConnection({
        provider: draft.provider,
        api_key: draft.apiKey || undefined,
        base_url: draft.baseUrl || null,
        model: draft.model || undefined,
      });
      setTestResult({ ok: res.success, msg: res.message });
    } catch {
      setTestResult({ ok: false, msg: 'Could not reach server' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border border-(--border) rounded-xl p-4 space-y-4 bg-(--card)">
      <p className="text-caption font-semibold uppercase tracking-wide text-(--muted-foreground)">
        {editing ? 'Edit provider' : 'Add provider'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
            Name
          </label>
          <Input
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="e.g. Personal OpenAI"
          />
        </div>
        <div>
          <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
            Provider
          </label>
          <Select
            value={draft.provider}
            onChange={(e) => {
              set({ provider: e.target.value, model: '' });
            }}
            placeholder="Select a provider"
          >
            <option value="">Select a provider</option>
            {providers.map((p) => (
              <option key={p.type} value={p.type}>{p.display_name}</option>
            ))}
          </Select>
        </div>
      </div>

      {!hideApiKey && (
        <div>
          <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
            API key
          </label>
          <Input
            type="password"
            value={draft.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={editing ? '•••••••• (leave blank to keep)' : 'Enter API key'}
          />
          <p className="text-caption text-(--muted-foreground) mt-1">
            Your key is encrypted at rest
          </p>
          {draft.provider === 'gemini' && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-caption text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
              Use a Gemini key with billing enabled. Free-tier keys have very low
              quotas and frequently fail with rate-limit / quota errors mid-request —
              a paid (billing-attached) key is strongly recommended for reliable use.
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
          Base URL
        </label>
        <Input
          value={draft.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder={selectedProvider?.display_name ?? 'https://api.openai.com/v1'}
        />
        <p className="text-caption text-(--muted-foreground) mt-1">
          Override the default API endpoint (optional)
        </p>
      </div>

      <div>
        <label className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wide mb-1.5 block">
          Model
        </label>
        {showModelSelect ? (
          <Select
            value={draft.model}
            onChange={(e) => set({ model: e.target.value })}
            placeholder="Select a model"
          >
            <option value="">{noModels ? 'No models available' : 'Select a model'}</option>
            {availableModels.map((m) => (
              <option key={m.model} value={m.model}>
                {m.name} {m.source === 'self-hosted' ? '(Self-host)' : '(API)'}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            value={draft.model}
            onChange={(e) => set({ model: e.target.value })}
            placeholder={draft.provider === 'gemini' ? 'gemini-2.0-flash'
              : draft.provider === 'anthropic' ? 'claude-sonnet-4-20250514'
                : draft.provider === 'deepseek' ? 'deepseek-chat'
                  : 'gpt-4o'}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={handleTest}
          loading={testing}
          disabled={!draft.provider || !draft.model}
        >
          Test connection
        </Button>
        {testResult && (
          <span className={cn(
            'text-caption',
            testResult.ok ? 'text-(--success-green)' : 'text-(--destructive)',
          )}>
            {testResult.ok ? '✓' : '✗'} {testResult.msg}
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-code text-(--foreground) cursor-pointer">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(e) => set({ isDefault: e.target.checked })}
          className="accent-(--foreground)"
        />
        Make this my default provider
      </label>

      <div className="flex items-center gap-3 pt-1">
        <Button variant="primary" onClick={onSave} loading={saving} disabled={!draft.provider || (needsTest && !testResult?.ok)}>
          {editing ? 'Save changes' : 'Add provider'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function AiSettingsSection() {
  const [items, setItems] = useState<UserAiProvider[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_DRAFT);

  const refresh = async () => {
    const list = await userAiProvidersApi.list();
    setItems(list);
  };

  useEffect(() => {
    (async () => {
      try {
        const [list, provs, modelList] = await Promise.all([
          userAiProvidersApi.list(),
          userAiSettingsApi.listProviders(),
          userAiSettingsApi.listModels(),
        ]);
        setItems(list);
        setProviders(provs);
        setModels(modelList);
      } catch {
        // noop — empty is fine
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startAdd = () => {
    setDraft({ ...EMPTY_DRAFT, isDefault: items.length === 0 });
    setEditingId('new');
    setStatus(null);
  };

  const startEdit = (p: UserAiProvider) => {
    setDraft({
      label: p.label,
      provider: p.provider,
      apiKey: '',
      baseUrl: p.base_url ?? '',
      model: p.model,
      isDefault: p.is_default,
    });
    setEditingId(p.id);
    setStatus(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        label: draft.label,
        provider: draft.provider,
        base_url: draft.baseUrl || null,
        model: draft.model,
        is_default: draft.isDefault,
        ...(draft.apiKey ? { api_key: draft.apiKey } : {}),
      };
      if (editingId === 'new') {
        await userAiProvidersApi.create(payload);
      } else if (typeof editingId === 'number') {
        await userAiProvidersApi.update(editingId, payload);
      }
      await refresh();
      setEditingId(null);
      setStatus({ kind: 'ok', text: 'Provider saved' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setStatus(null);
    try {
      await userAiProvidersApi.delete(id);
      await refresh();
      setStatus({ kind: 'ok', text: 'Provider deleted' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Delete failed' });
    }
  };

  const handleSetDefault = async (id: number) => {
    setStatus(null);
    try {
      await userAiProvidersApi.setDefault(id);
      await refresh();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to set default' });
    }
  };

  if (loading) {
    return <p className="text-code text-(--muted-foreground)">Loading…</p>;
  }

  const providerLabel = (type: string) =>
    providers.find((p) => p.type === type)?.display_name ?? type;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-subheading font-semibold text-(--foreground) mb-1">AI Providers</h2>
          <p className="text-code text-(--muted-foreground)">
            Save multiple providers and switch between them in chat. The default powers
            discovery and other AI features.
          </p>
        </div>
        {editingId === null && (
          <Button variant="primary" icon={<PlusIcon size="sm" />} onClick={startAdd}>
            Add
          </Button>
        )}
      </div>

      {status && (
        <p
          className={cn(
            'text-caption',
            status.kind === 'ok' ? 'text-(--success-green)' : 'text-(--destructive)',
          )}
        >
          {status.text}
        </p>
      )}

      {editingId !== null && (
        <ProviderForm
          draft={draft}
          setDraft={setDraft}
          providers={providers}
          models={models}
          editing={editingId !== 'new'}
          onSave={handleSave}
          onCancel={() => setEditingId(null)}
          saving={saving}
        />
      )}

      {items.length === 0 && editingId === null && (
        <div className="border border-dashed border-(--border) rounded-xl p-8 text-center">
          <p className="text-code text-(--muted-foreground)">
            No providers yet. Add one to use your own API key, or the server default applies.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 border border-(--border) rounded-xl p-3.5 bg-(--card)"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-body font-medium text-(--foreground) truncate">
                  {p.label || providerLabel(p.provider)}
                </p>
                {p.is_default && (
                  <span className="inline-flex items-center gap-1 text-caption text-(--success-green) font-medium">
                    <CheckCircleIcon size="xs" filled /> Default
                  </span>
                )}
                {!p.is_active && (
                  <span className="text-caption text-(--muted-foreground)">Inactive</span>
                )}
              </div>
              <p className="text-caption text-(--muted-foreground) truncate">
                {providerLabel(p.provider)}
                {p.model ? ` · ${p.model}` : ''}
                {p.has_api_key ? ' · key set' : ' · no key'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!p.is_default && (
                <Button variant="ghost" onClick={() => handleSetDefault(p.id)}>
                  Set default
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit provider"
                icon={<EditIcon size="sm" />}
                onClick={() => startEdit(p)}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete provider"
                icon={<TrashIcon size="sm" />}
                className="text-(--destructive)!"
                onClick={() => handleDelete(p.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PANELS: Record<SectionId, React.ComponentType> = {
  profile: ProfileSection,
  ai: AiSettingsSection,
  appearance: AppearanceSection,
  security: SecuritySection,
};

export default function Settings() {
  const [active, setActive] = useState<SectionId>('profile');
  const Panel = PANELS[active];

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-7">
        <h1 className="text-heading">Settings</h1>
        <p className="text-body text-(--muted-foreground) mt-1">
          Manage your account and appearance
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
        {/* Mobile: horizontal scrollable pills */}
        <nav className="sm:hidden flex gap-1 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption transition-all duration-150 border whitespace-nowrap',
                active === id
                  ? 'bg-(--foreground) text-(--card) border-(--foreground) font-medium'
                  : 'bg-(--card) text-(--muted-foreground) border-(--border) hover:text-(--foreground) hover:border-(--foreground)/30',
              )}
            >
              <Icon size="sm" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Desktop: left nav */}
        <nav className="hidden sm:block w-48 shrink-0 space-y-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                'w-full flex items-center gap-2.5 h-9 px-3 rounded-lg text-code font-medium transition-colors text-left',
                active === id
                  ? 'bg-(--muted) text-(--foreground)'
                  : 'text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)',
              )}
            >
              <Icon size="sm" className="shrink-0" />
              <span>{label}</span>
              {active === id && <ChevronRightIcon size="sm" className="ml-auto opacity-50" />}
            </button>
          ))}
        </nav>

        {/* Panel */}
        <div className="flex-1 min-w-0">
          <Panel />
        </div>
      </div>
    </div>
  );
}
