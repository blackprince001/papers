import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createIcon } from '@/components/icons/create-icon';

const DemoIcon = createIcon({
  name: 'demo',
  path: <path data-testid="primary-path" d="M4 12h16" />,
  secondaryPath: <path data-testid="secondary-path" d="M7 7h10v10H7z" />,
  filledPath: <path data-testid="filled-path" d="M4 4h16v16H4z" />,
});

function getSvg(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('Expected an SVG icon');
  return svg;
}

describe('createIcon', () => {
  it('keeps the shared size, stroke, color, and accessibility defaults', () => {
    const { container } = render(<DemoIcon size="lg" className="text-primary" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-width', '1.5');
    expect(svg).toHaveAttribute('data-icon', 'demo');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('shrink-0', 'text-primary');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('supports numeric sizing, explicit stroke width, and a labeled icon', () => {
    const { container } = render(<DemoIcon size={48} strokeWidth={2} title="Demo icon" />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg).not.toHaveAttribute('aria-hidden');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAccessibleName('Demo icon');
  });

  it('renders factory-owned secondary geometry behind the primary path', () => {
    const { container } = render(<DemoIcon duotone secondaryColor="var(--info)" />);
    const svg = getSvg(container);
    const secondary = svg.querySelector('[data-icon-secondary]');

    expect(secondary).toBeInTheDocument();
    expect(secondary).toHaveAttribute('fill', 'currentColor');
    expect(secondary).toHaveAttribute('stroke', 'none');
    expect(secondary).toHaveAttribute('color', 'var(--info)');
    expect(secondary).toHaveAttribute('opacity', 'var(--icon-secondary-opacity, 0.34)');
    expect(secondary?.querySelector('[data-testid="secondary-path"]')).toBeInTheDocument();
    expect(svg.querySelector('[data-testid="primary-path"]')).toBeInTheDocument();
  });

  it('can turn off the optional secondary layer without changing the primary path', () => {
    const { container } = render(<DemoIcon duotone={false} />);
    const svg = getSvg(container);

    expect(svg.querySelector('[data-icon-secondary]')).not.toBeInTheDocument();
    expect(svg.querySelector('[data-testid="primary-path"]')).toBeInTheDocument();
  });

  it('lets the filled variant take precedence over duotone geometry', () => {
    const { container } = render(<DemoIcon filled duotone />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('stroke', 'none');
    expect(svg.querySelector('[data-testid="filled-path"]')).toBeInTheDocument();
    expect(svg.querySelector('[data-icon-secondary]')).not.toBeInTheDocument();
    expect(svg.querySelector('[data-testid="primary-path"]')).not.toBeInTheDocument();
  });

  it('falls back to the outline and still supports the secondary layer without a filled path', () => {
    const OutlineOnlyIcon = createIcon({
      name: 'outline-only',
      path: <path d="M4 12h16" />,
      secondaryPath: <path d="M7 7h10v10H7z" />,
    });
    const { container } = render(<OutlineOnlyIcon filled duotone />);
    const svg = getSvg(container);

    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg.querySelector('[data-icon-secondary]')).toBeInTheDocument();
  });
});
