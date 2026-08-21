import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHighlightDrafts } from '@/components/reader/use-highlight-drafts';

const input = {
  kind: 'highlight' as const,
  page: 3,
  rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.1 }],
  color: 'blue' as const,
  text: 'selected text',
};

describe('useHighlightDrafts', () => {
  it('creates a draft in the draft state', () => {
    const { result } = renderHook(() => useHighlightDrafts());
    let draft: ReturnType<typeof result.current.addDraft> | undefined;
    act(() => {
      draft = result.current.addDraft(input);
    });
    expect(draft).toMatchObject({ ...input, status: 'draft' });
    expect(result.current.drafts).toHaveLength(1);
  });

  it('transitions draft → committing → removed on success', () => {
    const { result } = renderHook(() => useHighlightDrafts());
    let id = '';
    act(() => {
      id = result.current.addDraft(input).id;
    });
    act(() => {
      result.current.setDraftStatus(id, 'committing');
    });
    expect(result.current.drafts[0].status).toBe('committing');
    act(() => {
      result.current.removeDraft(id);
    });
    expect(result.current.drafts).toHaveLength(0);
  });

  it('keeps failed drafts until discarded', () => {
    const { result } = renderHook(() => useHighlightDrafts());
    let id = '';
    act(() => {
      id = result.current.addDraft(input).id;
    });
    act(() => {
      result.current.setDraftStatus(id, 'failed');
    });
    expect(result.current.drafts[0].status).toBe('failed');
    act(() => {
      result.current.removeDraft(id);
    });
    expect(result.current.drafts).toHaveLength(0);
  });

  it('groups drafts by page', () => {
    const { result } = renderHook(() => useHighlightDrafts());
    act(() => {
      result.current.addDraft(input);
      result.current.addDraft({ ...input, page: 5 });
      result.current.addDraft({ ...input, page: 5 });
    });
    expect(result.current.draftsByPage.get(3)).toHaveLength(1);
    expect(result.current.draftsByPage.get(5)).toHaveLength(2);
    expect(result.current.draftsByPage.get(9)).toBeUndefined();
  });
});
