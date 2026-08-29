import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationCard } from '@/components/reader/AnnotationCard';
import { UndoNotice } from '@/components/ui/UndoNotice';

const annotation = {
  id: 7,
  paper_id: 1,
  type: 'annotation',
  content: 'original note',
  highlighted_text: 'chosen words',
  selection_data: {
    rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.1 }],
    color: 'blue',
  },
  coordinate_data: { page: 1, x: 0.25, y: 0.2 },
  highlight_type: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('AnnotationCard at-mark actions', () => {
  afterEach(cleanup);

  it('edits the note inline and reports the new content', async () => {
    const onUpdateContent = vi.fn();
    const user = userEvent.setup();
    render(
      <AnnotationCard
        annotation={annotation as never}
        active
        onUpdateContent={onUpdateContent}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit note' }));
    const editor = screen.getByLabelText('Edit note text');
    await user.clear(editor);
    await user.type(editor, 'revised note');
    await user.click(screen.getByRole('button', { name: /Save/ }));
    expect(onUpdateContent).toHaveBeenCalledWith('revised note');
  });

  it('cancel leaves the content untouched', async () => {
    const onUpdateContent = vi.fn();
    const user = userEvent.setup();
    render(
      <AnnotationCard
        annotation={annotation as never}
        active
        onUpdateContent={onUpdateContent}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit note' }));
    await user.type(screen.getByLabelText('Edit note text'), 'typed but');
    await user.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(screen.getByText('original note')).toBeInTheDocument();
    expect(onUpdateContent).not.toHaveBeenCalled();
  });

  it('offers a recolor row when active and calls back with the theme', async () => {
    const onRecolor = vi.fn();
    const user = userEvent.setup();
    render(<AnnotationCard annotation={annotation as never} active onRecolor={onRecolor} />);

    expect(screen.getByRole('button', { name: 'Recolor blue' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Recolor sage' }));
    expect(onRecolor).toHaveBeenCalledWith('sage');
  });

  it('hides recolor for notes and inactive cards', () => {
    render(
      <AnnotationCard
        annotation={{ ...(annotation as object), type: 'note' } as never}
        active
        onRecolor={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Recolor/ })).not.toBeInTheDocument();

    cleanup();
    render(<AnnotationCard annotation={annotation as never} onRecolor={() => {}} />);
    expect(screen.queryByRole('button', { name: /Recolor/ })).not.toBeInTheDocument();
  });

  it('fades while the delete is pending behind the undo window', () => {
    render(<AnnotationCard annotation={annotation as never} deleting onDelete={() => {}} />);
    const card = screen.getByLabelText('Delete annotation').closest('.group\\/card');
    expect(card).toHaveClass('opacity-40', 'pointer-events-none');
  });

  it('offers explicit regeneration for a saved AI explanation', async () => {
    const onRegenerate = vi.fn();
    const user = userEvent.setup();
    render(
      <AnnotationCard
        annotation={{
          ...annotation,
          content: 'AI explanation',
          highlight_type: 'explain',
          selection_data: { ...annotation.selection_data, source: 'ai_action' },
        } as never}
        onRegenerate={onRegenerate}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Regenerate explanation' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });
});

describe('UndoNotice', () => {
  afterEach(cleanup);

  it('announces the message and wires Undo', async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup();
    render(<UndoNotice message="Highlight deleted" onUndo={onUndo} />);

    expect(screen.getByRole('status')).toHaveTextContent('Highlight deleted');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
