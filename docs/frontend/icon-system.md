---
type: Reference
title: Icon System
description: In-house hand-drawn icon set — createIcon factory, 109 glyphs, naming and sizing conventions, dev review sheet.
resource: frontend-v2/src/components/icons
tags: [frontend, icons, design-system]
timestamp: 2026-08-29T00:00:00Z
---

Lumen ships its own icon set: ~109 hand-drawn SVG glyphs (rounded outline,
1.5-unit stroke, 24×24 grid), replacing the previous mix of iconsax,
hugeicons, and lucide. One file per glyph under
`frontend-v2/src/components/icons/`; import ONLY from the barrel
(`@/components/icons`).

The current set has 106 duotone-ready glyphs. `grip-vertical`,
`more-horizontal`, and `spinner` remain single-layer exceptions because their
filled dots or motion arc are already the clearest form.

# Schema

- `create-icon.tsx` — the factory. Owns ALL geometry consistency: viewBox,
  `currentColor` stroke, round caps/joins, optical stroke correction
  (`clamp(1.5, 1.5·24/px, 2.25)` — holds ~1.5px effective stroke down to
  16px), `aria-hidden` by default (`title` prop → `role="img"`),
  `data-icon` attribute, baked-in `shrink-0`. An optional `secondaryPath` renders
  behind the outline through the factory's `data-icon-secondary` layer and
  `--icon-secondary-opacity` token. `duotone={false}` hides that layer;
  `secondaryColor` is optional and otherwise inherits `currentColor`.
- `IconProps.size`: preset `'xs'|'sm'|'md'|'lg'|'xl'` = 12/**14
  (default)**/16/20/24 px; numeric values only for hero art ≥ 32px.
  Tailwind `className` sizing (`size-4`) also works — CSS wins over the
  SVG attributes (used by the shadcn island).
- `filled` prop: solid emphasis variant; exists on `check-circle`,
  `x-circle`, `warning`, `info-circle`, `minus-circle`, `annotation`;
  falls back to outline elsewhere.
- Naming: kebab-case semantic-first (`discover`, `citation-graph`, `feed`);
  descriptive names for universal primitives (chevrons, `trash`). One name
  = one meaning — state pairs are distinct icons (`panel-left-open` /
  `panel-left-close`); `spinner` (270° arc) is deliberately distinct from
  `refresh` (two circular arrows).
- Families share master geometry: chevrons one 45° angle, `file-*` one
  page silhouette, `panel-*`/`view-*` one 18×14 frame, status circles Ø18,
  `block-*` one text-line rhythm.

# Examples

```tsx
import { SearchIcon, CheckCircleIcon } from '@/components/icons';

<SearchIcon size="md" className="text-(--muted-foreground)" />
<CheckCircleIcon size="sm" filled className="text-(--success)" />
```

Duotone-capable glyphs keep the same primary color by default. A consumer may set
`secondaryColor` on a migrated glyph without taking ownership of the layer's
opacity. Until a glyph supplies `secondaryPath`, the prop has no visual effect.

Review surface: dev-only route `/dev/icons` renders every glyph through the
real factory at all presets with search and theme toggle. The spinner
primitive `ui/Spinner` ([components](/frontend/components.md)) wraps
`SpinnerIcon` with `animate-spin` + `role="status"` +
`data-slot="spinner"` (exempted, slowed, under `prefers-reduced-motion`).

Adding a glyph: new kebab-case file calling `createIcon`, then a barrel
line in `index.ts`. Draw within the [2.75, 21.25] live area, stroke-only
(no fill/stroke attrs on elements — the factory owns them); dot punctuation
may use small `fill="currentColor"` circles.
