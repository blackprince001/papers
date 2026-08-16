---
type: API Collection
title: Deep Research API
description: Authenticated deep-research session API with durable generations, outbox dispatch, cancellation, and replayable SSE. Starts and resumes remain locally gated.
resource: backend/app/api/deep_research.py
tags: [backend, api, deep-research, agent, sse]
timestamp: 2026-07-15T00:00:00Z
---

One router (`router = APIRouter()`) mounted in `main.py` at prefix
`/api/v1/deep-research`, tag `deep-research`, with `dependencies=_auth_dep`
(auth required). It is **always mounted — there is no feature flag** (the former
`ENABLE_DEEP_RESEARCH` env var was removed; see
[/features/deep-research.md](/features/deep-research.md)). There is **no per-user
rate limiting** on this collection.

# Endpoints

All routes require authentication. `POST` start and resume remain unavailable
while `DEEP_RESEARCH_MUTATIONS_ENABLED=false`, which is the default.

| Method | Path | Notes |
|---|---|---|
| POST | `/deep-research` | Creates the session, generation, and outbox record in one transaction, then wakes the dispatcher after commit. Send `Idempotency-Key` to make a retried start return the original session; reusing it for another question returns `409`. |
| GET | `/deep-research` | Lists only the caller's sessions. |
| GET | `/deep-research/{id}` | Returns an owned session and its report summary. Checkpoints are never returned. |
| POST | `/deep-research/{id}/cancel` | Records a cooperative cancellation request. The worker writes the terminal event. |
| DELETE | `/deep-research/{id}` | Deletes paused or terminal work. For active work it requests cancellation and preserves history. |
| POST | `/deep-research/{id}/resume` | Starts a new guarded generation from a paused session. |
| GET | `/deep-research/{id}/stream` | Replays the current generation's durable events and then tails it. |

# SSE stream (`/{id}/stream`)

The stream reads Postgres events for the current generation. Each event has a
monotonic sequence and a signed opaque cursor. The client sends the last cursor
in `Last-Event-ID` to replay only missed events. A cursor for another generation
returns `409`; a terminal `done`, `error`, `paused`, or `cancelled` event closes
the stream. Redis is only a compatibility relay, not the replay source.

# Related

- Model & schemas: [/backend/models.md](/backend/models.md)
  (`DeepResearchSession`, `deep_research.py` schemas).
- Task & queue: [/backend/tasks.md](/backend/tasks.md)
  (`run_deep_research_task`, the `research` queue).
- Frontend client/hook: `chatStreamClient.streamDeepResearch` +
  `useDeepResearchStream` — see
  [/frontend/chat-system.md](/frontend/chat-system.md) and
  [/frontend/hooks.md](/frontend/hooks.md).
