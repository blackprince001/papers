---
type: Component Catalog
title: Frontend Components
description: Component directory layout — HeroUI-backed ui/* facades, in-house icon set, standards primitives, feature components, and the quarantined shadcn Finder island.
resource: frontend-v2/src/components
tags: [frontend, components, catalog, heroui]
timestamp: 2026-07-12T00:00:00Z
---

`frontend-v2/src/components/`. Three primitive layers share the token
system in `index.css`:

1. **`ui/*` — the app's primitives, HeroUI v3 facades.** Call sites use
   Lumen's historical APIs; internals render `@heroui/react` (React Aria)
   components themed by the [styling bridge](styling.md). HeroUI-backed:
   `Button` (variant/size/icon/`loading`; **the `icon` prop is the mobile
   representation — with both icon and children, the label shows from
   `sm:` up and collapses to an icon-only square below; icon+text never
   render together**), `Input`, `Textarea`, `Select` (option children +
   `onChange({target:{value}})`, truncating trigger), `Dialog` (Modal),
   `Badge` (Chip), `Progress`, `SearchInput` (InputGroup), `Skeleton`
   (+`SkeletonText`). Still in-house by choice: `Tooltip`, `Popover`,
   `Accordion`, `Pagination`, `Card`, `Table`, `Tabs` (variants
   `underline | segmented | plain`), plus standards primitives
   `Spinner` (custom glyph, `data-slot="spinner"`), `EmptyState`,
   `ErrorState` (policy: query errors render in place, mutation errors
   toast), `PaperCoverPlaceholder`.
2. **`icons/*` — the in-house icon set** (~109 glyphs). See
   [icon-system](icon-system.md). Import only from `@/components/icons`
   (eslint blocks iconsax/hugeicons/lucide).
3. **`shadcn/*` — quarantined Finder/document-viewer island** (forked
   blocks: pdf/docx/xlsx viewers, file-system, command, dropdown-menu…).
   Uses the in-house icons and spinner glyph but keeps its own primitive
   APIs. Bridged into the app only by `reader/ReaderShell.tsx` and
   `pages/GroupsFinder.tsx`. Its toolbar wraps at phone widths with 40px
   touch targets.

# Layout / shell (`components/layout/`)

`Layout.tsx` — 3-column resizable workspace; panel tab state lives per
paper tab with a local fallback for unregistered papers. `Sidebar.tsx` —
nav + group tree; collapse toggle shows the resulting state
(`PanelLeftClose/OpenIcon`). `Navbar.tsx`, `TabBar.tsx`,
`ChatPanel.tsx` — right rail with 7 pill tabs (count badges on
Notes/Annotations), Insights sub-tabs Summary/Insights/Guide (the former
Highlights tab is now an auto-highlight button in PaperDetails' header).
`PageContainer.tsx` — the page-column convention
(`wide | content | reading`); pages must not hand-roll `max-w-*`
containers.

# Feature components (`components/` root and feature dirs)

Same inventory as before minus `AutoHighlights.tsx` (deleted — its
mutation lives in `PaperDetails` as a header icon button with toasts).
`PaperCard.tsx` also exports `PaperCardSkeleton`. `ExpandedInput`'s
mention overlay is text-only (tint + dotted underline; icons would break
overlay/textarea alignment). All loading/empty/error presentation goes
through the standards primitives — no ad-hoc spinners, pulses, or
"Loading…" text.

# Pages of note

`PapersList` — redesigned mobile-first (PageContainer wide, single
toolbar with segmented scope/view toggles, responsive card grid, table
hidden below `md`). `Settings` — split into `pages/settings/` section
components. Dev-only review routes: `/dev/icons` (icon sheet) and
`/dev/ui` (kitchen sink for the HeroUI bridge + facades).
