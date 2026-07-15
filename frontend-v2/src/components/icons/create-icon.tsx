/* eslint-disable react-refresh/only-export-components -- factory module:
 * exports the icon factory + size constants, not a component boundary. */
import type { ReactNode, SVGProps } from 'react';
import { cn } from '../../lib/utils';

export const ICON_SIZES = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 } as const;
export type IconSize = keyof typeof ICON_SIZES;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Preset scale (xs 12 / sm 14 / md 16 / lg 20 / xl 24). Numeric values are
   * reserved for hero art >= 32px — anything smaller must use a preset. */
  size?: IconSize | number;
  /** Override the optical-correction default (viewBox units on the 24 grid). */
  strokeWidth?: number;
  /** Solid emphasis variant; falls back to outline when the glyph has none. */
  filled?: boolean;
  /** Accessible label; when present the icon is exposed to AT (role="img"). */
  title?: string;
}

interface IconDef {
  /** kebab-case semantic name; becomes data-icon and the displayName. */
  name: string;
  /** Outline artwork: shapes drawn on a 24x24 grid, stroke-only — no fill,
   * stroke, or stroke-width attributes; the factory owns all of those. */
  path: ReactNode;
  /** Optional solid variant: fill-only geometry. */
  filledPath?: ReactNode;
}

/* Artwork is drawn at 1.5 units on the 24 grid; smaller renders would thin
 * the stroke below legibility. Hold ~1.5px effective stroke down to 16px,
 * then cap at 2.25 units so counters don't close up at 12px. */
const strokeFor = (px: number) => Math.min(2.25, Math.max(1.5, (1.5 * 24) / px));

export function createIcon({ name, path, filledPath }: IconDef) {
  function Icon({
    size = 'sm',
    strokeWidth,
    filled = false,
    title,
    className,
    ...props
  }: IconProps) {
    const px = typeof size === 'number' ? size : ICON_SIZES[size];
    const solid = filled && filledPath != null;
    return (
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        fill={solid ? 'currentColor' : 'none'}
        stroke={solid ? 'none' : 'currentColor'}
        strokeWidth={solid ? undefined : (strokeWidth ?? strokeFor(px))}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        data-icon={name}
        className={cn('shrink-0', className)}
        {...props}
      >
        {title ? <title>{title}</title> : null}
        {solid ? filledPath : path}
      </svg>
    );
  }
  Icon.displayName = `${name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}Icon`;
  return Icon;
}
