---
type: Module
title: Frontend Chat System
description: The SSE streaming chat stack — chatStream client, parseSSE parser, the chat controller hook, sessions hook, AI-search stream hook, plus the typewriter animation hook.
resource: frontend-v2/src/lib/ai/chatStream.ts
tags: [frontend, chat, sse, streaming, hooks]
timestamp: 2026-06-28T00:00:00Z
---

The chat/discovery streaming stack lives in `frontend-v2/src/lib/ai/` and is
consumed by a family of hooks under `src/hooks/`. It is **separate from the
REST client** in `src/lib/api/` — see [api-layer.md](api-layer.md).

# Streaming clients — `lib/ai/`

- `chatStream.ts:132-231` — `chatStreamClient` async generators:
  `streamMessage` (`/papers/:id/chat/stream`), `streamThreadMessage`,
  `streamGroupMessage`, `streamMultiMessage`. Each runs its own
  401→`attemptSilentRefresh`→retry (`chatStream.ts:75-126`), attaching
  `getAuthHeaders()` and an optional `provider_id` pin (`chatStream.ts:36`, `:148`).
- `parseSSE.ts:1-207` — raw SSE parser over a `Response` body with timeout
  (`DEFAULT_TIMEOUT_MS = 60_000`) and retry/backoff.

# Chat hooks — `src/hooks/`

| Hook | File | Purpose |
|---|---|---|
| `useChatController` | `hooks/use-chat-controller.ts:14` | Master per-paper chat state: composes `useChatSessions` + `useChatStream`; owns composer input/references, provider pin, active thread, optimistic cache patching (`:76-111`), confirm-dialog for session delete. Returns the `ChatController` shape consumed by both `ChatTab` and `PaperChat`. After a turn completes, the optimistic cache write is marked stale via `invalidateQueries({ refetchType: 'none' })` rather than force-refetched — an immediate refetch would swap the temp-id optimistic messages for server ones and remount the visible list (flicker); the session syncs to real ids on the next natural refetch instead. |
| `useChatSessions` | `hooks/use-chat-sessions.ts:22` | Session CRUD (list/get/create/delete/rename/switch) via TanStack Query. |
| `useChatStream` | `hooks/use-chat-stream.ts` | SSE state machine (`status`, `content`, `tool_call`/`tool_result`/`thought` events, typed errors), `send`, `cancel`, `retry`; exposes typewriter content. `rate_limit` errors auto-retry with backoff (2 attempts, 5s/15s) and expose `autoRetryAt` (epoch ms) — `ErrorBanner` renders a live countdown via its `retryingAt` prop, and `useChatController` announces the scheduled retry with an info toast instead of an error toast. |
| `useTypewriter` | `hooks/use-typewriter.ts:3` | Smoothly reveals streamed text character-by-character. |

# Discovery search streaming

| Hook | File | Purpose |
|---|---|---|
| `useAISearchStream` | `hooks/use-ai-search-stream.ts:126` | SSE streaming for AI discovery search: `status`/`timeline`, aggregated `allPapers`, `queryUnderstanding`, `overview`, `clustering`, `relevanceExplanations`. |

# Server side

See [/backend/api/chat.md](/backend/api/chat.md) and
[/backend/services/ai-agent.md](/backend/services/ai-agent.md). The stream
adapter on the server emits the `content`/`tool_call`/`tool_result`/`thought`
events these hooks consume.