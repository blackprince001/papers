import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionPopover } from '@/components/reader/SelectionPopover';

afterEach(cleanup);

describe('SelectionPopover AI interruption', () => {
  it('offers cancellation while an AI action is pending', async () => {
    const onCancelAction = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectionPopover
        selection={{
          page: 1,
          text: 'A selected passage',
          rects: [{ left: 0.1, top: 0.1, width: 0.2, height: 0.05 }],
          clientX: 100,
          clientY: 100,
        }}
        pendingAction="explain"
        onAIAction={() => {}}
        onCancelAction={onCancelAction}
        onHighlight={() => {}}
        onComment={() => {}}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel AI action' }));
    expect(onCancelAction).toHaveBeenCalledOnce();
  });
});
