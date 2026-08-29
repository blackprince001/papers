import { describe, expect, it } from 'vitest';
import { normalizeStreamEvent, normalizeStreamEvents, createNormalizationContext } from '@/lib/ai/normalize';
import {
  INITIAL_AI_STREAM_STATE,
  reduceAIStream,
} from '@/lib/ai/streamState';

async function collect(source: AsyncIterable<unknown> | Iterable<unknown>) {
  const events = [];
  for await (const event of normalizeStreamEvents(source)) events.push(event);
  return events;
}

describe('AI stream contract', () => {
  it('normalizes content and preserves an SSE cursor without exposing wire fields', () => {
    expect(normalizeStreamEvent({ type: 'chunk', id: 'cursor-1', content: 'Hello' })).toEqual({
      type: 'content_delta',
      delta: 'Hello',
      cursor: 'cursor-1',
    });
  });

  it('drops raw reasoning events', () => {
    expect(
      normalizeStreamEvent({ type: 'thought', content: 'private reasoning', secret: 'token' }),
    ).toBeNull();
  });

  it('turns tool calls and results into bounded safe activity with a stable id', async () => {
    const secret = 'x'.repeat(2_000);
    const events = await collect([
      {
        type: 'tool_call',
        tool: 'search_papers',
        arguments: { query: secret },
        raw_provider_payload: { secret: 'do not render' },
      },
      { type: 'tool_result', tool: 'search_papers', result: `${secret}\nsecond line` },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'activity',
      activity: { id: 'activity-1', kind: 'tool', state: 'running', label: 'Searching your papers' },
    });
    expect(events[1]).toMatchObject({
      type: 'activity',
      activity: { id: 'activity-1', kind: 'tool', state: 'complete' },
    });
    expect(JSON.stringify(events)).not.toContain('raw_provider_payload');
    expect((events[0] as { activity: { detail?: string } }).activity.detail?.length).toBeLessThanOrEqual(1_200);
    expect((events[1] as { activity: { detail?: string } }).activity.detail).not.toContain('second line');
  });

  it('does not summarize arbitrary tool arguments into the UI', () => {
    expect(normalizeStreamEvent({
      type: 'tool_call',
      tool: 'search_papers',
      arguments: { token: 'secret-token', password: 'secret-password' },
    })).toEqual({
      type: 'activity',
      activity: {
        id: 'activity-1',
        kind: 'tool',
        state: 'running',
        label: 'Searching your papers',
      },
    });
  });

  it('maps provider switches and errors to safe user-facing contracts', () => {
    expect(normalizeStreamEvent({ type: 'provider_switched', from: 'secret-a', to: 'secret-b' })).toEqual({
      type: 'warning',
      warning: {
        code: 'provider_switched',
        message: 'The response provider changed automatically.',
      },
    });
    expect(normalizeStreamEvent({
      type: 'error',
      error: 'database password=secret stack trace',
      error_code: 'internal',
      recoverable: true,
    })).toEqual({
      type: 'error',
      error: {
        code: 'internal',
        message: 'Something went wrong while generating the response.',
        recoverable: true,
      },
    });
  });

  it('normalizes phases and validated sources without carrying provider payloads', () => {
    expect(normalizeStreamEvent({
      type: 'phase',
      status: 'searching',
      provider_trace: 'private trace',
    })).toMatchObject({
      type: 'activity',
      activity: { kind: 'phase', state: 'running', label: 'Searching academic sources' },
    });
    expect(normalizeStreamEvent({
      type: 'source',
      source: {
        title: 'A paper',
        source: 'academic',
        external_id: 'paper-1',
        url: 'https://example.com/paper#tracking',
        provider_payload: 'private payload',
      },
    })).toEqual({
      type: 'source',
      source: {
        id: 'paper-1',
        kind: 'academic',
        label: 'A paper',
        title: 'A paper',
        url: 'https://example.com/paper#tracking',
        externalId: 'paper-1',
      },
    });
  });

  it('validates manifest targets and ignores malformed or unknown events', () => {
    expect(normalizeStreamEvent({ type: 'future_event', payload: '<script>' })).toBeNull();
    expect(normalizeStreamEvent({ type: 'chunk', content: 42 })).toBeNull();
    expect(normalizeStreamEvent({
      type: 'done',
      reference_manifest: [{
        kind: 'paper',
        id: '1',
        label: 'Paper',
        title: 'Paper',
        target: 'javascript:alert(1)',
        internal: true,
      }],
    })).toMatchObject({
      type: 'complete',
      referenceManifest: [{ kind: 'paper', id: '1', target: null, internal: true }],
    });
  });

  it('rejects protocol-relative manifest targets', () => {
    expect(normalizeStreamEvent({
      type: 'done',
      reference_manifest: [{
        kind: 'paper',
        id: '2',
        label: 'Paper',
        target: '//evil.example/paper',
        internal: false,
      }],
    })).toMatchObject({
      referenceManifest: [{ kind: 'paper', id: '2', target: null }],
    });
  });

  it('rejects URLs containing embedded credentials', () => {
    expect(normalizeStreamEvent({
      type: 'done',
      reference_manifest: [{
        kind: 'paper',
        id: '3',
        label: 'Paper',
        target: 'https://user:password@example.com/paper',
        internal: false,
      }],
    })).toMatchObject({
      referenceManifest: [{ kind: 'paper', id: '3', target: null }],
    });
  });

  it('keeps tool correlation isolated between normalization contexts', () => {
    const first = createNormalizationContext();
    const second = createNormalizationContext();
    const firstCall = normalizeStreamEvent({ type: 'tool_call', tool: 'web_search' }, first);
    const secondResult = normalizeStreamEvent({ type: 'tool_result', tool: 'web_search', result: 'ok' }, second);

    expect(firstCall).toMatchObject({ activity: { id: 'activity-1' } });
    expect(secondResult).toMatchObject({ activity: { id: 'activity-1', state: 'complete' } });
  });
});

describe('AI stream reducer', () => {
  it('does not infer completion when a stream only has content', () => {
    const state = reduceAIStream(INITIAL_AI_STREAM_STATE, {
      type: 'content_delta',
      delta: 'partial',
    });

    expect(state.content).toBe('partial');
    expect(state.status).toBe('streaming');
    expect(state.terminal).toBe(false);
  });

  it('requires an explicit completion event and ignores late events', () => {
    const streaming = reduceAIStream(INITIAL_AI_STREAM_STATE, {
      type: 'content_delta',
      delta: 'partial',
    });
    const completed = reduceAIStream(streaming, {
      type: 'complete',
      content: 'authoritative answer',
      messageId: 7,
      referenceManifest: null,
    });
    const late = reduceAIStream(completed, { type: 'content_delta', delta: 'late token' });

    expect(completed).toMatchObject({ status: 'completed', content: 'authoritative answer', messageId: 7, terminal: true });
    expect(late).toBe(completed);
  });

  it('tracks retrying, cancellation, bounded activities, and cursor state', () => {
    const retrying = reduceAIStream(INITIAL_AI_STREAM_STATE, {
      type: 'retrying',
      retry: { attempt: 1, maxAttempts: 2, retryAfterMs: 1000 },
      cursor: 'c-1',
    });
    const active = reduceAIStream(retrying, {
      type: 'activity',
      activity: { id: 'a-1', kind: 'tool', state: 'running', label: 'Searching' },
    });
    const cancelled = reduceAIStream(active, {
      type: 'cancelled',
      error: { code: 'cancelled', message: 'Response cancelled.', recoverable: false },
    });

    expect(retrying).toMatchObject({ status: 'retrying', lastEventCursor: 'c-1', retry: { attempt: 1 } });
    expect(active.activities).toHaveLength(1);
    expect(cancelled).toMatchObject({ status: 'cancelled', terminal: true });
  });

  it('marks a transport end as reconciliation, not success', () => {
    const state = reduceAIStream(INITIAL_AI_STREAM_STATE, {
      type: 'stream_end',
      status: 'completed',
    });

    expect(state.status).toBe('reconciling');
    expect(state.terminal).toBe(false);
  });
});
