import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeferredDelete } from '@/hooks/use-deferred-delete';

describe('useDeferredDelete', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commits only after the delay elapses', () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() =>
      useDeferredDelete<number>({ onDelete }),
    );
    act(() => result.current.schedule(42));
    expect(result.current.pendingItem).toBe(42);
    act(() => vi.advanceTimersByTime(4999));
    expect(onDelete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDelete).toHaveBeenCalledWith(42);
    expect(result.current.pendingItem).toBeNull();
  });

  it('undo cancels the request before the deadline', () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() =>
      useDeferredDelete<number>({ onDelete }),
    );
    act(() => result.current.schedule(42));
    act(() => result.current.undo());
    expect(result.current.pendingItem).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('unmount commits the pending delete', () => {
    const onDelete = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDeferredDelete<number>({ onDelete }),
    );
    act(() => result.current.schedule(7));
    unmount();
    expect(onDelete).toHaveBeenCalledWith(7);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('undo after unmount commit is a no-op (request already sent)', () => {
    const onDelete = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDeferredDelete<number>({ onDelete }),
    );
    act(() => result.current.schedule(7));
    unmount();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('scheduling a second item commits the first immediately', () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() =>
      useDeferredDelete<number>({ onDelete }),
    );
    act(() => result.current.schedule(1));
    act(() => result.current.schedule(2));
    expect(onDelete).toHaveBeenCalledWith(1);
    expect(result.current.pendingItem).toBe(2);
    act(() => vi.advanceTimersByTime(5000));
    expect(onDelete).toHaveBeenCalledWith(2);
    expect(onDelete).toHaveBeenCalledTimes(2);
  });
});
