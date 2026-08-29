import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '@/components/ui/Dialog';

afterEach(cleanup);

describe('Dialog controlled facade', () => {
  it('does not mount an unbound HeroUI PressResponder', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      render(
        <Dialog open={false} onClose={() => {}} title="Share paper">
          <p>Dialog content</p>
        </Dialog>,
      );

      await new Promise((resolve) => window.setTimeout(resolve, 0));

      expect(
        warn.mock.calls.some(([message]) =>
          String(message).includes('A PressResponder was rendered without a pressable child'),
        ),
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
