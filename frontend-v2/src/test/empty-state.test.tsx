import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AnnotationIllustration,
  LibraryIllustration,
  SearchIllustration,
} from '@/components/illustrations';

function getSvg(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('Expected an illustration SVG');
  return svg;
}

describe('empty-state illustrations', () => {
  it('is decorative by default and follows the shared scale contract', () => {
    const { container } = render(<LibraryIllustration size="lg" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('width', '192');
    expect(svg).toHaveAttribute('height', '144');
    expect(svg).toHaveAttribute('viewBox', '0 0 160 120');
    expect(svg).toHaveAttribute('data-illustration', 'library');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('exposes a meaningful label only when one is provided', () => {
    const { container } = render(<SearchIllustration title="Search illustration" />);
    const svg = getSvg(container);

    expect(svg).not.toHaveAttribute('aria-hidden');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAccessibleName('Search illustration');
  });

  it('lets product states replace legacy icons without rendering both', () => {
    const { container } = render(
      <EmptyState
        size="panel"
        icon={SearchIcon}
        illustration={AnnotationIllustration}
        title="No annotations yet"
      />,
    );

    expect(container.querySelector('[data-illustration="annotation"]')).toBeInTheDocument();
    expect(container.querySelector('[data-icon]')).not.toBeInTheDocument();
  });

  it('keeps row states compact even if a caller supplies artwork', () => {
    const { container } = render(
      <EmptyState size="row" illustration={LibraryIllustration} title="No papers yet" />,
    );

    expect(container.querySelector('[data-illustration]')).not.toBeInTheDocument();
    expect(container.querySelector('p')).toHaveTextContent('No papers yet');
  });
});
