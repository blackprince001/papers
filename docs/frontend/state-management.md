---
type: Reference
title: Frontend State Management
description: TanStack Query for server state plus four React Contexts (Auth, Tab, Reader, ChatController). No Zustand/Redux/Jotai. Toasts via sonner.
resource: frontend-v2/src/contexts
tags: [frontend, state, tanstack-query, context]
timestamp: 2026-06-28T00:00:00Z
---

**Server state: TanStack Query v5** is the primary store. One `QueryClient`
at the root (`main.tsx:13`) with `staleTime: 5min`, `retry:1`,
`refetchOnWindowFocus:false`. Standard keys: `['papers', …]`, `['paper', id]`,
`['annotations', paperId]`, `['groups']`, `['chat', 'session', id]`,
`['chat', 'sessions', paperId]`, `['discovery-sessions']`. Mutations
invalidate these keys (e.g. `ReaderShell.tsx:206`,
`GroupsFinder.tsx:200-204`). The chat controller also does **optimistic
cache writes** via `queryClient.setQueryData` (`use-chat-controller.ts:80-102`).

# Client state — React Context only

No Zustand / Redux / Jotai / Valtio / MobX (verified: none in `package.json`,
no imports in `src/`). Four contexts:

| Context | File | Holds |
|---|---|---|
| `AuthContext` | `contexts/AuthContext.tsx:53` | `user`, `accessToken`, `isAuthenticated`, `isAdmin`, `isLoading`; actions `loginWithGoogle`, `loginAsAdmin`, `logout`, `updateProfile` — see [auth-flow.md](auth-flow.md) |
| `ThemeContext` | `lib/theme.tsx:15` | `theme: 'light'\|'dark'`, `toggle` |
| `TabContext` | `contexts/TabContext.tsx:40` | open-paper tabs, persisted to `localStorage` key `nexus-tabs` (max 10 tabs, saves last 5) (`TabContext.tsx:27-53`); each `Tab` also carries `panelTab` — which right-side panel (Details/Insights/Chat/...) was last shown for that paper, read/written by `Layout.tsx` so switching tabs doesn't reset the panel |
| `ReaderContext` | `contexts/ReaderContext.tsx:19` | bridge for annotation scroll/focus + `activeAnnotationId` between side panel and PDF overlay |
| `ChatControllerContext` | `contexts/ChatControllerContext.tsx:9` | scoped per-paper chat controller (instantiated in `Layout.tsx:225`) |

# Persistence

- Auth session → `localStorage` `auth_session` (`AuthContext.tsx:6`)
- Theme → `localStorage` `papers-theme` (`theme.tsx:30`)
- Tabs → `localStorage` `nexus-tabs` (`TabContext.tsx:29`)

# Toasts

`sonner` via `components/AppToaster.tsx:8` + thin wrappers in
`lib/utils/toast.ts`. Positioned top-right, compact sizing, no close
buttons, spring animations. Custom `toastInsufficientBalance` +
`toastProcessingFailed` helpers fire automatically when the processing
pipeline finishes with quota/balance errors (`hooks/use-processing-progress.ts:100`).
See the [processing hook source](../../frontend-v2/src/hooks/use-processing-progress.ts).