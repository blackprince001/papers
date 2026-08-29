import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentStatus } from '@/components/ai/AgentStatus';
import { AISourceList } from '@/components/ai/AISourceList';
import { ThinkingOrb } from '@/components/ai/ThinkingOrb';
import { ReasoningTrace } from '@/components/ai/ReasoningTrace';

afterEach(cleanup);

describe('AI presentation primitives', () => {
  it('announces a safe text status', () => {
    render(<AgentStatus status="retrying" />);

    expect(screen.getByRole('status')).toHaveTextContent('Retrying connection');
    expect(screen.getByRole('status')).toHaveAttribute('data-ai-status', 'retrying');
  });

  it('renders only normalized source destinations as links', () => {
    render(
      <AISourceList
        sources={[
          { id: 'paper-1', kind: 'academic', label: 'Library paper', title: 'A paper', url: 'https://example.com/paper' },
          { id: 'paper-2', kind: 'academic', label: 'Saved paper' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /A paper/ })).toHaveAttribute(
      'href',
      'https://example.com/paper',
    );
    expect(screen.getByText('Saved paper')).toBeInTheDocument();
  });

  it('exposes the orb state without requiring animation', () => {
    render(<ThinkingOrb status="streaming" decorative />);

    expect(screen.getByTestId('ai-thinking-orb')).toHaveAttribute('data-state', 'streaming');
    expect(screen.getByTestId('ai-thinking-orb')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses accessible disclosure state for safe activity details', async () => {
    render(
      <ReasoningTrace
        activity={[
          { id: 'phase-1', kind: 'phase', state: 'complete', label: 'Searching academic sources' },
          { id: 'tool-1', kind: 'tool', state: 'complete', label: 'Searching your papers', detail: 'attention' },
        ]}
        running={false}
        thinkingMs={null}
        hasReport={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-expanded', 'true');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Searching academic sources' }));
    expect(screen.getByRole('button', { name: /Searching your papers/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
