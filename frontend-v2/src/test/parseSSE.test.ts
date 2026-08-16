import { describe, expect, it } from 'vitest';
import { parseSSE } from '@/lib/ai/parseSSE';

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body);
}

describe('parseSSE', () => {
  it('preserves ids, event names, multiline data, and chunk boundaries', async () => {
    const events = [];
    for await (const event of parseSSE(
      responseFromChunks(['id: v1:g2:s4\r\nevent: chunk\r\ndata: {"type":"wrong",', '"content":"a\\n\\nb"}\r\n\r\n']),
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'chunk', id: 'v1:g2:s4', content: 'a\n\nb' },
    ]);
  });

  it('ignores comments and malformed JSON without aborting later events', async () => {
    const events = [];
    for await (const event of parseSSE(
      responseFromChunks([': keepalive\n\ndata: not-json\n\n', 'id: c\ndata: {"type":"done"}\n\n']),
    )) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'done', id: 'c' }]);
  });
});
