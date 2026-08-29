import type { ReferenceManifestEntry } from '@/lib/api/references';
import type { SSEEvent } from '@/lib/ai/parseSSE';
import { toolLabel } from '@/lib/ai/reasoning';
import {
  AI_STREAM_LIMITS,
  type AIActivity,
  type AIError,
  type AIErrorCode,
  type AIStreamEvent,
  type AISource,
} from '@/lib/ai/events';

const KNOWN_TOOL_NAMES = new Set([
  'search_discovery',
  'web_search',
  'get_recommendations',
  'discovery_get_paper_details',
  'discovery_get_citations',
  'search_authors',
  'get_author_works',
  'get_references',
  'semantic_search',
  'search_papers',
  'get_paper_content',
  'get_paper_metadata',
  'get_citations',
  'get_annotations',
  'get_notes',
  'get_chat_history',
  'get_chat_sessions',
  'view_figures',
]);

const PHASE_LABELS: Record<string, string> = {
  planning: 'Planning the research',
  searching: 'Searching academic sources',
  reading: 'Reading relevant papers',
  synthesizing: 'Synthesizing the findings',
  verifying: 'Checking the evidence',
  running: 'Working through sources',
};

const ERROR_CODES = new Set<AIErrorCode>([
  'rate_limit',
  'auth',
  'provider_unavailable',
  'timeout',
  'tool_error',
  'internal',
  'max_turns',
  'network',
  'no_provider',
  'cancelled',
  'paused',
]);

const ERROR_MESSAGES: Record<AIErrorCode, string> = {
  rate_limit: 'The AI service is busy. Try again in a moment.',
  auth: 'Your AI connection needs attention. Check AI settings.',
  provider_unavailable: 'The AI service is unavailable right now.',
  timeout: 'The response took too long. Try again.',
  tool_error: 'A research step failed. You can try again.',
  internal: 'Something went wrong while generating the response.',
  max_turns: 'The response took too many steps. Try a shorter request.',
  network: 'The connection was interrupted. Check your network and try again.',
  no_provider: 'Add an AI provider in Settings to continue.',
  cancelled: 'Response cancelled.',
  paused: 'This research run is paused and needs your attention.',
  unknown: 'Something went wrong while generating the response.',
};

const DEFAULT_RECOVERABLE: Record<AIErrorCode, boolean> = {
  rate_limit: true,
  auth: false,
  provider_unavailable: true,
  timeout: true,
  tool_error: true,
  internal: true,
  max_turns: true,
  network: true,
  no_provider: false,
  cancelled: false,
  paused: true,
  unknown: true,
};

const TOOL_ERROR = /^error\b/i;
const SAFE_TOOL_ARGUMENT_KEYS = [
  'query', 'q', 'search_query', 'question', 'term', 'name',
  'title', 'author', 'external_id', 'paper_id', 'id',
] as const;

export interface NormalizationContext {
  nextActivityId: number;
  pendingToolIds: Map<string, string[]>;
}

export function createNormalizationContext(): NormalizationContext {
  return { nextActivityId: 0, pendingToolIds: new Map() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let cleaned = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isControl =
      code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    if (!isControl) cleaned += character;
  }
  return cleaned || undefined;
}

function boundedText(value: unknown, limit: number): string | undefined {
  const cleaned = cleanText(value);
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function boundedTrimmedText(value: unknown, limit: number): string | undefined {
  const cleaned = boundedText(value, limit)?.trim();
  return cleaned || undefined;
}

function positiveInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return undefined;
  return Math.min(number, max);
}

function nonNegativeInt(value: unknown, max: number): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return undefined;
  return Math.min(number, max);
}

function cursorFrom(raw: Record<string, unknown>): string | undefined {
  return boundedTrimmedText(raw.id, 256);
}

function eventWithCursor<T extends AIStreamEvent>(event: T, cursor: string | undefined): T {
  return cursor ? ({ ...event, cursor } as T) : event;
}

function errorCode(value: unknown, fallback: AIErrorCode = 'internal'): AIErrorCode {
  const candidate = typeof value === 'string' ? value : '';
  return ERROR_CODES.has(candidate as AIErrorCode)
    ? (candidate as AIErrorCode)
    : fallback;
}

function normalizedError(
  raw: Record<string, unknown>,
  forcedCode?: AIErrorCode,
): AIError {
  const code = forcedCode ?? errorCode(raw.error_code, 'unknown');
  const rawRecoverable = raw.recoverable;
  const recoverable =
    (code === 'auth' || code === 'no_provider' || code === 'cancelled')
      ? false
      : typeof rawRecoverable === 'boolean'
        ? rawRecoverable
        : DEFAULT_RECOVERABLE[code];
  return { code, message: ERROR_MESSAGES[code], recoverable };
}

function safeToolName(value: unknown): string | undefined {
  const name = boundedTrimmedText(value, 64);
  return name && /^[a-z0-9:_-]+$/i.test(name) ? name : undefined;
}

function safeToolLabel(name: string | undefined): string {
  if (!name || !KNOWN_TOOL_NAMES.has(name)) return 'Working with sources';
  return boundedText(toolLabel(name), 96) ?? 'Working with sources';
}

function nextActivityId(context: NormalizationContext): string {
  context.nextActivityId += 1;
  return `activity-${context.nextActivityId}`;
}

function toolKey(name: string | undefined): string {
  return name ?? 'unknown';
}

function rememberTool(context: NormalizationContext, name: string | undefined, id: string) {
  const key = toolKey(name);
  const ids = context.pendingToolIds.get(key) ?? [];
  ids.push(id);
  context.pendingToolIds.set(key, ids);
}

function takeTool(context: NormalizationContext, name: string | undefined): string | undefined {
  const key = toolKey(name);
  const ids = context.pendingToolIds.get(key);
  if (!ids?.length) return undefined;
  const id = ids.shift();
  if (ids.length === 0) context.pendingToolIds.delete(key);
  return id;
}

function toolDetail(args: unknown): string | undefined {
  if (!isRecord(args)) return undefined;
  for (const key of SAFE_TOOL_ARGUMENT_KEYS) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) {
      return boundedTrimmedText(value, AI_STREAM_LIMITS.maxActivityDetailChars);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function resultDetail(result: unknown): string | undefined {
  const text = cleanText(result)?.trim();
  if (!text) return undefined;
  const firstLine = text.split(/\r?\n/, 1)[0];
  return boundedTrimmedText(firstLine, AI_STREAM_LIMITS.maxActivityDetailChars);
}

function validTarget(value: unknown): string | null {
  const target = boundedTrimmedText(value, AI_STREAM_LIMITS.maxFieldChars);
  if (!target) return null;
  if (/^ref:[a-z0-9_-]+\/[a-z0-9:._-]+$/i.test(target)) return target;
  if (target.startsWith('/') && !target.startsWith('//')) return target;
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeManifest(value: unknown): ReferenceManifestEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: ReferenceManifestEntry[] = [];
  for (const item of value.slice(0, AI_STREAM_LIMITS.maxReferenceItems)) {
    if (!isRecord(item)) continue;
    const kind = boundedTrimmedText(item.kind, 64);
    const id = boundedTrimmedText(item.id, 256);
    const label = boundedTrimmedText(item.label, AI_STREAM_LIMITS.maxFieldChars);
    if (!kind || !id || !label) continue;
    entries.push({
      kind,
      id,
      label,
      title: boundedTrimmedText(item.title, AI_STREAM_LIMITS.maxFieldChars) ?? label,
      subtitle: boundedText(item.subtitle, AI_STREAM_LIMITS.maxFieldChars) ?? '',
      snippet: boundedText(item.snippet, AI_STREAM_LIMITS.maxActivityDetailChars) ?? '',
      thumbnail_url: validTarget(item.thumbnail_url),
      internal: item.internal === true,
      target: validTarget(item.target),
    });
  }
  return entries;
}

function normalizeSource(value: unknown): AISource | null {
  if (!isRecord(value)) return null;
  const title = boundedTrimmedText(value.title, AI_STREAM_LIMITS.maxFieldChars);
  const label = boundedTrimmedText(value.label, AI_STREAM_LIMITS.maxFieldChars) ?? title;
  const kind = boundedTrimmedText(value.kind ?? value.source ?? value.type, 64);
  const url = validTarget(value.url);
  const externalId = boundedTrimmedText(value.external_id ?? value.externalId, 256);
  const id = boundedTrimmedText(value.id, 256) ?? externalId ?? url ?? title;
  if (!id || !kind || !label) return null;
  return {
    id,
    kind,
    label,
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(externalId ? { externalId } : {}),
  };
}

function activityFromToolCall(
  raw: Record<string, unknown>,
  context: NormalizationContext,
): AIActivity {
  const name = safeToolName(raw.tool);
  const id = nextActivityId(context);
  rememberTool(context, name, id);
  const detail = toolDetail(raw.arguments);
  return {
    id,
    kind: 'tool',
    state: 'running',
    label: safeToolLabel(name),
    ...(detail ? { detail } : {}),
  };
}

function activityFromToolResult(
  raw: Record<string, unknown>,
  context: NormalizationContext,
): AIActivity {
  const name = safeToolName(raw.tool);
  const id = takeTool(context, name) ?? nextActivityId(context);
  const detail = resultDetail(raw.result);
  const resultText = cleanText(raw.result)?.trim() ?? '';
  return {
    id,
    kind: 'tool',
    state: TOOL_ERROR.test(resultText) ? 'error' : 'complete',
    label: safeToolLabel(name),
    ...(detail ? { detail } : {}),
  };
}

function activityFromPhase(
  raw: Record<string, unknown>,
  context: NormalizationContext,
): AIActivity {
  const phase = boundedTrimmedText(raw.phase ?? raw.status, 64)?.toLowerCase();
  const state = raw.state === 'complete' || raw.state === 'error' ? raw.state : 'running';
  return {
    id: nextActivityId(context),
    kind: 'phase',
    state,
    label: (phase && PHASE_LABELS[phase]) ?? 'Working through sources',
  };
}

function normalizeEvent(
  raw: Record<string, unknown>,
  context: NormalizationContext,
): AIStreamEvent | null {
  const type = boundedTrimmedText(raw.type, 64);
  const cursor = cursorFrom(raw);
  if (!type) return null;

  switch (type) {
    case 'chunk': {
      const delta = boundedText(raw.content, AI_STREAM_LIMITS.maxDeltaChars);
      return delta ? eventWithCursor({ type: 'content_delta', delta }, cursor) : null;
    }
    case 'tool_call':
      return eventWithCursor(
        { type: 'activity', activity: activityFromToolCall(raw, context) },
        cursor,
      );
    case 'tool_result':
      return eventWithCursor(
        { type: 'activity', activity: activityFromToolResult(raw, context) },
        cursor,
      );
    case 'phase':
      return eventWithCursor(
        { type: 'activity', activity: activityFromPhase(raw, context) },
        cursor,
      );
    case 'thought':
      // Raw chain-of-thought is never a UI event.
      return null;
    case 'provider_switched':
      return eventWithCursor(
        {
          type: 'warning',
          warning: {
            code: 'provider_switched',
            message: 'The response provider changed automatically.',
          },
        },
        cursor,
      );
    case 'source': {
      const source = normalizeSource(raw.source ?? raw);
      return source ? eventWithCursor({ type: 'source', source }, cursor) : null;
    }
    case 'retrying': {
      const attempt = nonNegativeInt(raw.attempt, 100) ?? 1;
      const maxAttempts = nonNegativeInt(raw.max_attempts ?? raw.maxAttempts, 100);
      const retryAfterMs = nonNegativeInt(raw.retry_after_ms ?? raw.retryAfterMs, 300_000);
      return eventWithCursor(
        {
          type: 'retrying',
          retry: {
            attempt,
            ...(maxAttempts !== undefined ? { maxAttempts } : {}),
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
          },
        },
        cursor,
      );
    }
    case 'done':
      return eventWithCursor(
        {
          type: 'complete',
          content: boundedText(raw.content, AI_STREAM_LIMITS.maxContentChars),
          messageId: positiveInt(raw.message_id, Number.MAX_SAFE_INTEGER),
          sessionId: positiveInt(raw.session_id, Number.MAX_SAFE_INTEGER),
          parentMessageId: positiveInt(raw.parent_message_id, Number.MAX_SAFE_INTEGER),
          referenceManifest: normalizeManifest(raw.reference_manifest),
        },
        cursor,
      );
    case 'error':
      return eventWithCursor({ type: 'error', error: normalizedError(raw) }, cursor);
    case 'paused':
      return eventWithCursor(
        { type: 'paused', error: normalizedError(raw, 'paused') },
        cursor,
      );
    case 'cancelled':
      return eventWithCursor(
        { type: 'cancelled', error: normalizedError(raw, 'cancelled') },
        cursor,
      );
    case 'end': {
      const status = raw.status;
      const normalizedStatus =
        status === 'completed' || status === 'failed' || status === 'paused' || status === 'cancelled'
          ? status
          : undefined;
      return eventWithCursor({ type: 'stream_end', ...(normalizedStatus ? { status: normalizedStatus } : {}) }, cursor);
    }
    case 'keepalive':
      return eventWithCursor({ type: 'keepalive' }, cursor);
    default:
      return null;
  }
}

/**
 * Normalize one untrusted wire event. Unknown and malformed events are ignored
 * so a provider payload cannot crash a stream renderer.
 */
export function normalizeStreamEvent(
  input: unknown,
  context: NormalizationContext = createNormalizationContext(),
): AIStreamEvent | null {
  if (!isRecord(input)) return null;
  return normalizeEvent(input, context);
}

/** Normalize a stream while retaining correlation between tool calls/results. */
export async function* normalizeStreamEvents(
  source: AsyncIterable<SSEEvent | unknown> | Iterable<SSEEvent | unknown>,
  context: NormalizationContext = createNormalizationContext(),
): AsyncGenerator<AIStreamEvent, void, unknown> {
  for await (const raw of source) {
    const event = normalizeStreamEvent(raw, context);
    if (event) yield event;
  }
}
