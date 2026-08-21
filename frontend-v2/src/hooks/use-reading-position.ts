import { useCallback, useMemo, useRef } from 'react';
import {
  loadReadingPosition,
  saveReadingPosition,
} from '@/lib/reading-position';

/**
 * Restores a paper's last reading position safely.
 *
 * - An explicit deep-link page always wins over the stored position.
 * - The stored position is resolved once per paper; the caller restores it
 *   only once the viewer signals readiness.
 * - Page reports are recorded only while ready, and the viewer's initial
 *   page-one signal can never overwrite a valid stored/restored position —
 *   page 1 counts as progress only after another page was recorded first.
 */
export function useReadingPosition({
  paperId,
  explicitPage,
  ready,
}: {
  paperId?: number
  /** Deep-linked page (?page=N); takes precedence over storage. */
  explicitPage?: number
  /** Viewer readiness gate: nothing is recorded until this is true. */
  ready: boolean
}) {
  // Resolved once per paper so late re-renders can't change the target.
  const initialPage = useMemo(() => {
    if (!paperId || paperId < 1) return undefined;
    if (explicitPage && explicitPage >= 1) return explicitPage;
    return loadReadingPosition(paperId)?.page;
  }, [paperId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastRecordedRef = useRef<number | null>(null);

  const recordPage = useCallback(
    (page: number) => {
      if (!paperId || paperId < 1 || !ready || !Number.isInteger(page))
        return;
      if (page < 1) return;
      // Before any other page has been seen, a page-one report is the
      // viewer's starting signal, not reading progress.
      if (
        page === 1 &&
        lastRecordedRef.current === null &&
        initialPage !== 1
      )
        return;
      if (lastRecordedRef.current === page) return;
      lastRecordedRef.current = page;
      saveReadingPosition(paperId, page);
    },
    [paperId, ready, initialPage],
  );

  return { initialPage, recordPage };
}
