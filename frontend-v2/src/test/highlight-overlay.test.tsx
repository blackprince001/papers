import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HighlightOverlay } from '@/components/reader/HighlightOverlay';
import type { HighlightDraft } from '@/components/reader/use-highlight-drafts';

const annotation = {
  id: 7,
  paper_id: 1,
  user_id: 1,
  type: 'annotation',
  content: 'body',
  highlighted_text: 'chosen words',
  selection_data: {
    rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.1 }],
    color: 'blue',
  },
  coordinate_data: { page: 1, x: 0.25, y: 0.2 },
  highlight_type: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as never;

const draft = (over: Partial<HighlightDraft> = {}): HighlightDraft => ({
  id: 'draft-1',
  kind: 'highlight',
  page: 1,
  rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.1 }],
  color: 'blue',
  text: 'chosen words',
  status: 'draft',
  ...over,
});

const renderOverlay = (
  drafts: HighlightDraft[],
  handlers: { onRetry?: (id: string) => void; onDiscard?: (id: string) => void } = {},
) =>
  render(
    <HighlightOverlay
      annotations={[annotation]}
      drafts={drafts}
      rotation={0}
      activeAnnotationId={null}
      isDark={false}
      onSelectAnnotation={() => {}}
      onRetryDraft={handlers.onRetry ?? (() => {})}
      onDiscardDraft={handlers.onDiscard ?? (() => {})}
    />,
  );

describe('HighlightOverlay', () => {
  afterEach(cleanup);


  it('renders persisted highlights as buttons', () => {
    renderOverlay([]);
    expect(screen.getByRole('button', { name: 'Annotation highlight' })).toBeInTheDocument();
  });

  it('announces draft and committing states without controls', () => {
    renderOverlay([draft(), draft({ id: 'draft-2', status: 'committing' })]);
    expect(screen.getByLabelText('Highlight pending')).toBeInTheDocument();
    expect(screen.getByLabelText('Saving highlight')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows retry/discard for failed drafts and wires both actions', async () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    renderOverlay([draft({ status: 'failed' })], { onRetry, onDiscard });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onRetry).toHaveBeenCalledWith('draft-1');
    expect(onDiscard).toHaveBeenCalledWith('draft-1');
  });

  it('failed-draft controls are keyboard operable', async () => {
    const onRetry = vi.fn();
    renderOverlay([draft({ status: 'failed' })], { onRetry });

    const user = userEvent.setup();
    await user.tab(); // focus first persisted highlight button
    await user.tab(); // focus Retry
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRetry).toHaveBeenCalledWith('draft-1');
  });
});
