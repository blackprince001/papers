import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@/lib/ai/chatStream';
import { useChatStream } from '@/hooks/use-chat-stream';

const { streamMessageMock } = vi.hoisted(() => ({
  streamMessageMock: vi.fn(),
}));

vi.mock('@/lib/ai/chatStream', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/chatStream')>('@/lib/ai/chatStream');
  return {
    ...actual,
    chatStreamClient: {
      ...actual.chatStreamClient,
      streamMessage: streamMessageMock,
    },
  };
});

function streamOf(events: StreamEvent[]) {
  return (async function* () {
    yield* events;
  })();
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useChatStream', () => {
  it('drives paper chat from normalized events and explicit completion', async () => {
    const references = { notes: [], annotations: [], papers: [] };
    streamMessageMock.mockImplementationOnce(() => streamOf([
      { type: 'chunk', content: 'partial ' },
      { type: 'thought', content: 'private reasoning' },
      { type: 'tool_call', tool: 'search_papers', arguments: { query: 'attention' } },
      { type: 'tool_result', tool: 'search_papers', result: 'found papers' },
      {
        type: 'done',
        id: 'done-1',
        content: 'final answer',
        message_id: 101,
        session_id: 9,
        reference_manifest: [{
          kind: 'paper',
          id: 'paper-1',
          label: 'Paper',
          title: 'Paper',
          target: 'javascript:alert(1)',
          internal: true,
        }],
      },
    ]));

    const { result } = renderHook(() => useChatStream());

    act(() => {
      result.current.send(42, 'Explain attention', references, 9, 11);
    });

    await waitFor(() => expect(result.current.status).toBe('done'));
    await waitFor(() => expect(result.current.pendingUserMessage).toBeNull());

    expect(result.current.content).toBe('final answer');
    expect(result.current.activities).toEqual([{
      id: 'activity-1',
      kind: 'tool',
      state: 'complete',
      label: 'Searching your papers',
      detail: 'found papers',
    }]);
    expect(result.current.thoughts).toEqual([]);
    expect(result.current.toolCalls).toEqual([]);
    expect(result.current.toolResults).toEqual([]);
    expect(result.current.referenceManifest?.[0].target).toBeNull();
    expect(result.current.messageId).toBe(101);
    expect(result.current.sessionId).toBe(9);
    expect(result.current.isActive).toBe(false);
    expect(streamMessageMock).toHaveBeenCalledTimes(1);
    expect(streamMessageMock).toHaveBeenCalledWith(
      42,
      'Explain attention',
      references,
      9,
      expect.objectContaining({
        timeoutMs: 60_000,
        maxRetries: 0,
        providerId: 11,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('surfaces an incomplete stream and retries only after an explicit action', async () => {
    streamMessageMock
      .mockImplementationOnce(() => streamOf([{ type: 'chunk', content: 'partial' }]))
      .mockImplementationOnce(() => streamOf([
        { type: 'chunk', content: 'complete ' },
        { type: 'done', content: 'complete answer', message_id: 102, session_id: 10 },
      ]));

    const { result } = renderHook(() => useChatStream());

    act(() => {
      result.current.send(42, 'Try again', undefined, undefined, undefined);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    await waitFor(() => expect(result.current.pendingUserMessage).toBeNull());
    expect(result.current.error).toEqual({
      code: 'network',
      message: 'The connection ended before the response was complete. Try again.',
      recoverable: true,
    });
    expect(streamMessageMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.content).toBe('complete answer');
    expect(streamMessageMock).toHaveBeenCalledTimes(2);
  });
});
