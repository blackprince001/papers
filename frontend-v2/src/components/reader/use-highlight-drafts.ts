import { useCallback, useMemo, useState } from 'react';
import type { ThemeName } from '@/lib/paper-themes';
import type { NormalizedRect } from './annotation-geometry';

/**
 * Lifecycle of a highlight draft: created optimistically on selection, flipped
 * to `committing` while the API call is in flight, then either removed (the
 * persisted annotation replaces it) or left `failed` with retry/discard.
 */
export type DraftStatus = 'draft' | 'committing' | 'failed';

export interface HighlightDraft {
  id: string
  kind: 'highlight' | 'comment'
  page: number
  /** Canonical-space rects (unrotated page fractions). */
  rects: NormalizedRect[]
  color?: ThemeName
  text: string
  status: DraftStatus
}

export interface HighlightDraftInput {
  kind: HighlightDraft['kind']
  page: number
  rects: NormalizedRect[]
  color?: ThemeName
  text: string
}

let nextDraftId = 1;

/**
 * Client-side draft state for in-flight highlight/comment creation. Drafts
 * render immediately in the overlay so the reader sees their selection take
 * effect before the network round-trip completes.
 */
export function useHighlightDrafts() {
  const [drafts, setDrafts] = useState<HighlightDraft[]>([]);

  const addDraft = useCallback((input: HighlightDraftInput): HighlightDraft => {
    const draft: HighlightDraft = {
      ...input,
      id: `draft-${nextDraftId++}`,
      status: 'draft',
    };
    setDrafts((current) => [...current, draft]);
    return draft;
  }, []);

  const setDraftStatus = useCallback(
    (id: string, status: DraftStatus) => {
      setDrafts((current) =>
        current.map((draft) => (draft.id === id ? { ...draft, status } : draft)),
      );
    },
    [],
  );

  const removeDraft = useCallback((id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }, []);

  const draftsByPage = useMemo(() => {
    const map = new Map<number, HighlightDraft[]>();
    for (const draft of drafts) {
      if (!map.has(draft.page)) map.set(draft.page, []);
      map.get(draft.page)!.push(draft);
    }
    return map;
  }, [drafts]);

  return { drafts, draftsByPage, addDraft, setDraftStatus, removeDraft };
}
