import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchApi } from '@/lib/api/client';
import type { Paper } from '@/lib/api/papers';
import { usePaperFile } from '@/components/reader/use-paper-file';

vi.mock('@/lib/api/client', () => ({
  fetchApi: vi.fn(),
}));

function paper(fileUrl: string): Paper {
  return {
    id: 1,
    title: 'Test paper',
    file_url: fileUrl,
    created_at: '',
    updated_at: '',
  };
}

describe('usePaperFile', () => {
  it('aborts the previous PDF request when the paper changes', () => {
    const signals: AbortSignal[] = [];

    vi.mocked(fetchApi).mockImplementation((_endpoint, options) => {
      if (options?.signal) signals.push(options.signal);
      return new Promise<Blob>(() => {});
    });

    const { rerender } = renderHook(
      ({ fileUrl }: { fileUrl: string }) => usePaperFile(paper(fileUrl)),
      { initialProps: { fileUrl: '/papers/1/file' } },
    );

    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);

    rerender({ fileUrl: '/papers/2/file' });

    expect(signals[0]?.aborted).toBe(true);
  });
});
