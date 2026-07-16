---
type: Reference
title: Frontend Hooks
description: The 12 custom hooks — chat controller/sessions/stream, AI-search stream, deep-research stream, typewriter, reading session, paper thumbnail, PDF dark mode, overflow, pagination, confirm dialog.
resource: frontend-v2/src/hooks
tags: [frontend, hooks]
timestamp: 2026-06-28T00:00:00Z
---

Chat/AI hooks are covered in [chat-system.md](chat-system.md); the rest:

| Hook | File | Purpose |
|---|---|---|
| `useReadingSession` | `hooks/use-reading-session.ts:16` | Starts/ends server reading sessions, computes active minutes excluding pauses |
| `usePaperThumbnail` | `hooks/use-paper-thumbnail.ts:11` | Resolves a paper's cover thumbnail URL (loads via `lib/finder/thumbnails.ts`) |
| `usePdfDarkMode` | `hooks/use-pdf-dark-mode.ts:22` | Clips/inverts PDF canvas image regions for dark reading (paired with the `[data-reader-dark]` CSS filter, `index.css:674`) |
| `useOverflow` | `hooks/use-overflow.ts:22` | Detects whether a text node overflows its box (drives tooltip visibility) |
| `usePagination` | `hooks/use-pagination.ts:13` | Generic list pagination state |
| `useConfirmDialog` | `hooks/use-confirm-dialog.ts:26` | Imperative confirm-dialog (`confirm({title, description, …})` → `Promise<boolean>`); also exposed by `components/ConfirmDialog.tsx` |

# Chat/AI hooks (recap — see [chat-system.md](chat-system.md))

`useChatController`, `useChatSessions`, `useChatStream`, `useTypewriter`,
`useAISearchStream`, `useDeepResearchStream` (deep-research run streaming +
reconnect — see [/features/deep-research.md](/features/deep-research.md)).