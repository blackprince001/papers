import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearReadingPosition,
  parseStoredPosition,
  loadReadingPosition,
  saveReadingPosition,
} from '@/lib/reading-position';
import { useReadingPosition } from '@/hooks/use-reading-position';

// Clear every paper id the suite touches (the backing store may be an
// in-memory fallback, so clearing goes through the public API).
beforeEach(() => {
  for (let id = 1; id <= 9; id++) clearReadingPosition(id);
});
afterEach(() => {
  for (let id = 1; id <= 9; id++) clearReadingPosition(id);
});

describe('reading-position storage', () => {
  it('round-trips a position', () => {
    saveReadingPosition(9, 4);
    expect(loadReadingPosition(9)).toMatchObject({ page: 4 });
    clearReadingPosition(9);
    expect(loadReadingPosition(9)).toBeNull();
  });

  it('treats corrupt or invalid entries as no stored position', () => {
    expect(parseStoredPosition('not-json')).toBeNull();
    expect(parseStoredPosition(JSON.stringify({ page: -3 }))).toBeNull();
    expect(parseStoredPosition(JSON.stringify({ page: 2.5 }))).toBeNull();
    expect(parseStoredPosition(null)).toBeNull();
  });
});

describe('useReadingPosition', () => {
  it('explicit deep-link page wins over the stored position', () => {
    saveReadingPosition(1, 7);
    const { result } = renderHook(() =>
      useReadingPosition({ paperId: 1, explicitPage: 3, ready: true }),
    );
    expect(result.current.initialPage).toBe(3);
  });

  it('restores the stored page when there is no explicit page', () => {
    saveReadingPosition(2, 12);
    const { result } = renderHook(() =>
      useReadingPosition({ paperId: 2, ready: true }),
    );
    expect(result.current.initialPage).toBe(12);
  });

  it('records nothing before readiness', () => {
    const { result, rerender } = renderHook(() =>
      useReadingPosition({ paperId: 3, ready: false }),
    );
    act(() => result.current.recordPage(5));
    rerender();
    expect(loadReadingPosition(3)).toBeNull();

    rerender(); // same hook instance semantics; flip via new render below
  });

  it('records pages once ready', () => {
    const { result, rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingPosition({ paperId: 4, ready }),
      { initialProps: { ready: false } },
    );
    act(() => result.current.recordPage(5));
    expect(loadReadingPosition(4)).toBeNull();
    rerender({ ready: true });
    act(() => result.current.recordPage(5));
    expect(loadReadingPosition(4)).toMatchObject({ page: 5 });
  });

  it('initial page-one signals cannot overwrite a valid stored position', () => {
    saveReadingPosition(5, 12);
    const { result } = renderHook(() =>
      useReadingPosition({ paperId: 5, ready: true }),
    );
    // Viewer loads at its default page 1 before the restore scroll lands.
    act(() => result.current.recordPage(1));
    expect(loadReadingPosition(5)).toMatchObject({ page: 12 });
    // Real navigation away from the restore target records normally.
    act(() => result.current.recordPage(14));
    expect(loadReadingPosition(5)).toMatchObject({ page: 14 });
    // …and now returning to page 1 is genuine progress.
    act(() => result.current.recordPage(1));
    expect(loadReadingPosition(5)).toMatchObject({ page: 1 });
  });

  it('deduplicates consecutive reports of the same page', () => {
    const { result } = renderHook(() =>
      useReadingPosition({ paperId: 6, ready: true }),
    );
    act(() => result.current.recordPage(3));
    const first = loadReadingPosition(6);
    act(() => result.current.recordPage(3));
    expect(loadReadingPosition(6)?.savedAt).toBe(first?.savedAt);
  });
});
