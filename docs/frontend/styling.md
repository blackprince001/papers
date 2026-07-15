---
type: Reference
title: Frontend Styling — Tailwind v4 + HeroUI v3
description: CSS-based token system, HeroUI theme bridge, status intents, radius policy, reduced motion, 8 paper themes, dark mode.
resource: frontend-v2/src/index.css
tags: [frontend, styling, tailwind, heroui, design-tokens, dark-mode]
timestamp: 2026-07-12T00:00:00Z
---

# Setup

Tailwind v4 via `@tailwindcss/vite` — config is entirely CSS-based in
`src/index.css`. **HeroUI v3** (`@heroui/styles`) is imported immediately
after `tailwindcss` and themed through CSS variables (see the bridge
below). `tw-animate-css` provides `animate-*` utilities.

# Token system (`src/index.css`)

- **Type scale** in `@theme`: `--text-micro … --text-display` with baked
  line-heights/weights. Base `h1–h4` rules reference these tokens (single
  source of truth).
- **Palette**: near-monochrome + forest green (`--forest-black`,
  `--deep-forest`, accents `--mint-green`, `--sky-blue`, `--coral-red`),
  neutral scale, surfaces. `.dark` (on `<html>`, mirrored by
  `data-theme`) redefines the primitives; everything derived flips free.
- **Status intents**: `--danger / --warning / --success / --info` plus
  derived `-soft` (9% color-mix over background) and `-border` (28%)
  surfaces. Utilities: `text-danger`, `bg-warning-soft`,
  `border-info-border`, etc. Raw Tailwind palette classes
  (`bg-red-50`…) are banned in app code (audit-enforced).
- **Radius policy**: badges `rounded` · controls `rounded-lg`
  (=`--radius-interactive`) · banners `rounded-xl` · cards/panels/dialogs
  `rounded-2xl` · pills `rounded-full`. `rounded-md` is banned.
- **Charts**: `--chart-1..4` (sky-blue, success-green, coral-red,
  mid-gray) — Recharts consumes `var()` directly.
- **Layout**: `--width-content-max` (72.5rem, PageContainer "wide"),
  `--width-main-content` (58.75rem, "content"), `--width-reading`
  (43.75rem), `--header-h`, `--overlay-scrim`.
- **Reduced motion**: global `prefers-reduced-motion` block kills
  animations/transitions; `[data-slot='spinner']` keeps rotating slowed
  (WCAG 2.3.3).

# HeroUI v3 theme bridge

HeroUI reads a CSS-var contract; the bridge in `:root` maps every
contract var onto Lumen primitives so both themes come from one palette:
`--surface`→card-surface, `--overlay`→white, `--default`→light-gray,
`--accent`→forest-black (**not** mint — accent is HeroUI's action color;
mint stays `--mint-green`), `--field-*` (incl.
**`--field-border-width: 1px`** — HeroUI defaults fields borderless; the
user requires visible outlines), `--separator`, `--focus`, `--link`,
`--radius: 0.5rem`, status `-foreground` pairs. `.dark` overrides only
non-deriving values. BEM-level overrides: `.button` radius pinned to
`--radius-interactive` (HeroUI defaults to pills) and popover-family
surfaces flattened — **border only, no drop shadow** (user preference).

# Paper themes & misc

8 per-paper themes (`--theme-{olive…sand}-{bg,border,text,accent,action}`)
unchanged, assigned by `lib/paper-themes.ts`. Sonner toasts themed via CSS
(intent colors from the status tokens; the custom "balance" toast is
gone). Hidden scrollbars; `[data-reader-dark]` inverts only PDF canvases.

# Enforcement

`frontend-v2/scripts/audit-standards.mjs` counts violations (icon-library
imports, ad-hoc spinners, `!` size overrides, raw status palette, hex in
tsx, `rounded-md`, "Loading…" literals, non-token page widths). Keep it
at zero outside `components/shadcn/` (quarantined island).
