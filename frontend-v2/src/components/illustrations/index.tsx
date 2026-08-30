import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/utils';

export const ILLUSTRATION_SIZES = {
  sm: 96,
  md: 144,
  lg: 192,
} as const;

export type IllustrationSize = keyof typeof ILLUSTRATION_SIZES;

export interface IllustrationProps
  extends Omit<SVGProps<SVGSVGElement>, 'height' | 'title' | 'width'> {
  /** Preset scale for empty-state contexts, or an explicit pixel size. */
  size?: IllustrationSize | number;
  /** Only provide a title when the artwork carries meaning not present in nearby copy. */
  title?: string;
}

export type IllustrationComponent = ComponentType<IllustrationProps>;

type IllustrationFrameProps = IllustrationProps & {
  name: string;
  children: ReactNode;
};

const stroke = 'currentColor';
const accent = 'var(--illustration-accent)';
const secondary = 'var(--illustration-secondary)';
const warm = 'var(--illustration-warm)';

function IllustrationFrame({
  name,
  children,
  size = 'md',
  title,
  className,
  ...props
}: IllustrationFrameProps) {
  const px = typeof size === 'number' ? size : ILLUSTRATION_SIZES[size];

  return (
    <svg
      viewBox="0 0 160 120"
      width={px}
      height={px * 0.75}
      fill="none"
      stroke={stroke}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      data-illustration={name}
      className={cn('shrink-0 text-(--illustration-line)', className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** A small stack of papers for an empty or growing research library. */
export function LibraryIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame name="library" {...props}>
      <path d="M31 89h91" opacity=".18" />
      <rect x="38" y="29" width="74" height="48" rx="5" fill="var(--illustration-surface)" opacity=".32" />
      <path d="M45 43h44M45 53h54M45 63h37" opacity=".55" />
      <path d="m38 77 8 7h61l5-7" opacity=".65" />
      <path d="M53 23h54a5 5 0 0 1 5 5v49" opacity=".35" />
      <circle cx="116" cy="31" r="12" fill={accent} opacity=".16" stroke={accent} />
      <path d="M116 24v14M109 31h14" stroke={accent} />
    </IllustrationFrame>
  );
}

/** A magnifier over a few paper cards for search and no-result states. */
export function SearchIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame name="search" {...props}>
      <rect x="28" y="28" width="61" height="48" rx="5" fill="var(--illustration-surface)" opacity=".24" />
      <path d="M38 42h34M38 52h27M38 62h18" opacity=".55" />
      <path d="m73 78 12 10" opacity=".35" />
      <circle cx="95" cy="67" r="21" fill={secondary} opacity=".14" stroke={secondary} />
      <path d="m110 82 17 17" stroke={secondary} strokeWidth="4" />
      <circle cx="95" cy="67" r="8" stroke={secondary} opacity=".72" />
    </IllustrationFrame>
  );
}

/** A marked-up page for notes, highlights, and annotation surfaces. */
export function AnnotationIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame name="annotation" {...props}>
      <path d="M44 20h50l22 22v57a5 5 0 0 1-5 5H44a5 5 0 0 1-5-5V25a5 5 0 0 1 5-5Z" fill="var(--illustration-surface)" opacity=".24" />
      <path d="M94 20v22h22" opacity=".5" />
      <path d="M53 55h45M53 65h33M53 75h39" opacity=".38" />
      <path d="M52 47h48" stroke={accent} strokeWidth="7" opacity=".25" />
      <path d="m101 71 15-15 10 10-15 15-14 4Z" fill={accent} opacity=".22" stroke={accent} />
      <path d="m112 60 10 10" stroke={accent} />
    </IllustrationFrame>
  );
}

/** Connected paper nodes for citation and relationship views. */
export function CitationIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame name="citation" {...props}>
      <path d="M48 38 79 59M111 38 81 59M49 83l29-20M110 83 82 63" opacity=".38" />
      <rect x="28" y="25" width="38" height="26" rx="6" fill={secondary} opacity=".16" stroke={secondary} />
      <rect x="94" y="25" width="38" height="26" rx="6" fill={secondary} opacity=".16" stroke={secondary} />
      <rect x="61" y="50" width="38" height="28" rx="6" fill={accent} opacity=".2" stroke={accent} />
      <rect x="28" y="76" width="38" height="20" rx="6" fill="var(--illustration-surface)" opacity=".3" />
      <rect x="94" y="76" width="38" height="20" rx="6" fill="var(--illustration-surface)" opacity=".3" />
      <path d="M38 37h18M104 37h18M71 63h18M38 86h18M104 86h18" opacity=".58" />
    </IllustrationFrame>
  );
}

/** A quiet chart motif for activity, recommendations, and archive states. */
export function ActivityIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame name="activity" {...props}>
      <path d="M27 93h106" opacity=".22" />
      <path d="M39 84V62M62 84V47M85 84V69M108 84V34" stroke={secondary} opacity=".42" />
      <path d="M39 62h0M62 47h0M85 69h0M108 34h0" stroke={accent} strokeWidth="8" />
      <path d="m35 46 24-17 24 15 26-26" stroke={accent} opacity=".58" />
      <circle cx="35" cy="46" r="4" fill={accent} stroke="none" />
      <circle cx="59" cy="29" r="4" fill={accent} stroke="none" />
      <circle cx="83" cy="44" r="4" fill={accent} stroke="none" />
      <circle cx="109" cy="18" r="4" fill={accent} stroke="none" />
      <path d="M109 18v16" stroke={warm} opacity=".8" />
    </IllustrationFrame>
  );
}

/** A gentle setup motif for states that need a provider, group, or first action. */
export function SetupIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame name="setup" {...props}>
      <rect x="31" y="39" width="69" height="47" rx="6" fill="var(--illustration-surface)" opacity=".25" />
      <path d="M31 48h69M43 39v-7h25l8 7" opacity=".5" />
      <path d="M45 64h27M45 74h17" opacity=".42" />
      <circle cx="112" cy="55" r="21" fill={accent} opacity=".15" stroke={accent} />
      <path d="M112 43v24M100 55h24" stroke={accent} />
      <path d="M106 91h37" opacity=".18" />
      <circle cx="112" cy="91" r="3" fill={secondary} stroke="none" />
    </IllustrationFrame>
  );
}
