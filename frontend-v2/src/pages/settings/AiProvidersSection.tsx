import { useEffect, useState } from 'react';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  CheckCircleIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SetupIllustration } from '@/components/illustrations';
import {
  userAiSettingsApi,
  userAiProvidersApi,
  type ModelInfo,
  type ProviderInfo,
  type UserAiProvider,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { SettingsSection, FieldLabel, StatusMessage, type SectionStatus } from './SettingsSection';

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
    <div className="space-y-4 rounded-xl border border-(--border) bg-(--background) p-4">
      <p className="text-caption font-semibold uppercase tracking-wide text-(--muted-foreground)">
        {editing ? 'Edit provider' : 'Add provider'}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="provider-name">Name</FieldLabel>
          <Input
            id="provider-name"
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="e.g. Personal OpenAI"
          />
        </div>
        <div>
          <FieldLabel htmlFor="provider-type">Provider</FieldLabel>
          <Select
            id="provider-type"
            aria-label="Provider"
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
          <FieldLabel htmlFor="provider-api-key">API key</FieldLabel>
          <Input
            id="provider-api-key"
            type="password"
            value={draft.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={editing ? '•••••••• (leave blank to keep)' : 'Enter API key'}
          />
          <p className="mt-1 text-caption text-(--muted-foreground)">
            Your key is encrypted at rest
          </p>
          {draft.provider === 'gemini' && (
            <div className="mt-2 rounded-lg border border-(--warning-border) bg-(--warning-soft) px-3 py-2 text-caption text-(--warning)">
              Use a Gemini key with billing enabled. Free-tier keys have very low
              quotas and frequently fail with rate-limit / quota errors mid-request —
              a paid (billing-attached) key is strongly recommended for reliable use.
            </div>
          )}
        </div>
      )}

      <div>
        <FieldLabel htmlFor="provider-base-url">Base URL</FieldLabel>
        <Input
          id="provider-base-url"
          value={draft.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder={selectedProvider?.display_name ?? 'https://api.openai.com/v1'}
        />
        <p className="mt-1 text-caption text-(--muted-foreground)">
          Override the default API endpoint (optional)
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="provider-model">Model</FieldLabel>
        {showModelSelect ? (
          <Select
            id="provider-model"
            aria-label="Model"
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
            id="provider-model"
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
            testResult.ok ? 'text-(--success)' : 'text-(--danger)',
          )}>
            {testResult.ok ? '✓' : '✗'} {testResult.msg}
          </span>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-code text-(--foreground)">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(e) => set({ isDefault: e.target.checked })}
          className="accent-(--foreground)"
        />
        Make this my default provider
      </label>

      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="primary"
          onClick={onSave}
          loading={saving}
          disabled={!draft.provider || (needsTest && !testResult?.ok)}
        >
          {editing ? 'Save changes' : 'Add provider'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function AiProvidersSection() {
  const [items, setItems] = useState<UserAiProvider[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SectionStatus>(null);

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

  const providerLabel = (type: string) =>
    providers.find((p) => p.type === type)?.display_name ?? type;

  return (
    <SettingsSection
      id="ai"
      title="AI Providers"
      caption="Save multiple providers and switch between them in chat. The default powers discovery and other AI features."
      actions={
        !loading && editingId === null ? (
          <Button variant="primary" icon={<PlusIcon size="sm" />} onClick={startAdd}>
            Add
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-4">
          <SkeletonText lines={2} />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <StatusMessage status={status} />

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
            <div className="rounded-xl border border-dashed border-(--border)">
              <EmptyState
                size="panel"
                illustration={SetupIllustration}
                title="No providers yet"
                description="Add one to use your own API key, or the server default applies."
              />
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-(--border) bg-(--background) p-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-body font-medium text-(--foreground)">
                        {p.label || providerLabel(p.provider)}
                      </p>
                      {p.is_default && (
                        <span className="inline-flex items-center gap-1 text-caption font-medium text-(--success)">
                          <CheckCircleIcon size="xs" filled /> Default
                        </span>
                      )}
                      {!p.is_active && (
                        <span className="text-caption text-(--muted-foreground)">Inactive</span>
                      )}
                    </div>
                    <p className="truncate text-caption text-(--muted-foreground)">
                      {providerLabel(p.provider)}
                      {p.model ? ` · ${p.model}` : ''}
                      {p.has_api_key ? ' · key set' : ' · no key'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
                      className="text-(--danger) hover:bg-(--danger-soft)"
                      onClick={() => handleDelete(p.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
