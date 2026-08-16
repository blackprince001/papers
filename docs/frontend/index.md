# Frontend — React 19 SPA "Lumen" (TypeScript, Vite 7, Tailwind v4)

`frontend-v2/` is the main single-page reader / library application. React 19 +
Vite 7 + TypeScript (strict), Tailwind v4 (CSS-based config, no JS config),
TanStack Query for server state, React Context for client state (no
Zustand/Redux), PWA via `vite-plugin-pwa`. Package manager: Bun; `frontend-v2/bun.lock` is canonical for new changes.

# Concepts

* [Entry point](entry-point.md) - provider stack + router mount (`main.tsx`, no `App.tsx`).
* [Routing](routing.md) - `createBrowserRouter` (React Router v7), protected vs public routes, lazy GroupsFinder.
* [API layer](api-layer.md) - `fetchApi` REST client, silent refresh, 20 `*Api` modules, streaming layer.
* [Auth flow](auth-flow.md) - Google OAuth + JWT in localStorage + httpOnly refresh cookie + route protection.
* [Chat system](chat-system.md) - SSE streaming, `chatStream.ts`, `parseSSE.ts`, chat hooks.
* [PDF reader & annotations](pdf-reader.md) - forked virtualized `react-pdf` viewer, annotation overlay, selection capture.
* [State management](state-management.md) - TanStack Query + 4 React contexts (Auth, Tab, Reader, ChatController).
* [Components](components.md) - directory layout by category; in-house `ui/` + shadcn `shadcn/` layers share CSS vars.
* [Hooks](hooks.md) - 11 custom hooks.
* [Styling](styling.md) - Tailwind v4 `@theme` tokens, near-monochrome + forest-green palette, 8 paper themes, dark mode.
* [Icon system](icon-system.md) - in-house hand-drawn icon set (109 glyphs), createIcon factory, sizing/naming conventions.
* [Build & config](build-config.md) - Vite + PWA, strict tsconfig, ESLint, env vars.
* [Testing](testing.md) - Vitest component tests, Playwright browser smoke tests, and Bun commands.