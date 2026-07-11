---
type: Reference
title: Landing App
description: A single scrolled marketing page built from 9 stacked section components; no router; the only link to the main Lumen SPA is the VITE_APP_URL env var driving CTAs.
resource: landing/src/App.tsx
tags: [landing, marketing, react]
timestamp: 2026-06-28T00:00:00Z
---

`landing/src/App.tsx` renders one scrolling marketing page by
stacking 9 section components in order (no React Router). The tree is wrapped
in `<MotionConfig reducedMotion="user">` so every `motion/react` animation
respects `prefers-reduced-motion`; inside it the root wrapper is
`<div className="min-h-screen overflow-x-clip bg-off-white text-forest">`.
CSS-side reduced-motion (marquee keyframes, smooth scroll) is handled in
`landing/src/index.css` via a `prefers-reduced-motion` media query and the
`.marquee-row` / `.marquee-row-reverse` utility classes used by
`SourcesMarquee`.

# Sections (in render order)

| # | Component | Source |
|---|---|---|
| 1 | `Navbar` | `@/components/sections/Navbar` |
| 2 | `Hero` | `@/components/sections/Hero` |
| 3 | `SourcesMarquee` | `@/components/sections/SourcesMarquee` |
| 4 | `AboutSection2` | `@/components/ui/about-section-2` |
| 5 | `Features` | `@/components/sections/Features` |
| 6 | `AiReading` | `@/components/sections/AiReading` |
| 7 | `HowItWorks` | `@/components/sections/HowItWorks` |
| 8 | `Providers` | `@/components/sections/Providers` |
| 9 | `FinalCta` | `@/components/sections/FinalCta` |
| footer | `Footer` | `@/components/sections/Footer` |

All files exist under `landing/src/components/sections/`.

# Entry

`landing/src/main.tsx` — standard React 19 bootstrap:
`createRoot(...).render(<StrictMode><App /></StrictMode>)` (`:1-10`). Imports
`./index.css` and `./App`. No providers beyond `StrictMode`.

# Relationship to the main app

**No code-level imports** from `frontend-v2/`. Every import uses the `@` alias
which resolves to `landing/src` (`vite.config.ts:10`), so the landing app is
fully self-contained.

The **only link** to the main app is via an environment variable:
`landing/.env.example:1` defines `VITE_APP_URL=https://app.lumen.example` —
"URL of the deployed Lumen web app — drives all 'Open Lumen' / login CTAs."