import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Delays a destructive action behind an undo window. `schedule` opens the
 * window, `undo` cancels before the deadline, and unmount commits anything
 * still pending so the request is never silently dropped. Scheduling a
 * second item while one is open commits the first immediately — only one
 * undo window runs at a time.
 */
export function useDeferredDelete<T>({
  delayMs = 5000,
  onDelete,
}: {
  delayMs?: number
  onDelete: (item: T) => void
}) {
  const [pendingItem, setPendingItem] = useState<T | null>(null);
  const pendingRef = useRef<T | null>(null);
  const timerRef = useRef(0);
  const onDeleteRef = useRef(onDelete);
  // Keep the latest callback without re-arming the unmount cleanup.
  useEffect(() => {
    onDeleteRef.current = onDelete;
  });

  /** Fire the pending delete now (timer deadline, replacement, or flush). */
  const flush = useCallback(() => {
    const item = pendingRef.current;
    if (item === null) return;
    pendingRef.current = null;
    setPendingItem(null);
    window.clearTimeout(timerRef.current);
    onDeleteRef.current(item);
  }, []);

  const schedule = useCallback(
    (item: T) => {
      flush();
      pendingRef.current = item;
      setPendingItem(item);
      timerRef.current = window.setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  const undo = useCallback(() => {
    window.clearTimeout(timerRef.current);
    pendingRef.current = null;
    setPendingItem(null);
  }, []);

  useEffect(
    () => () => {
      // Unmount with a delete still pending: send the request rather than
      // losing the user's intent.
      window.clearTimeout(timerRef.current);
      if (pendingRef.current !== null) onDeleteRef.current(pendingRef.current);
      pendingRef.current = null;
    },
    [],
  );

  return { pendingItem, schedule, undo };
}
