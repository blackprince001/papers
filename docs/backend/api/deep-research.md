---
type: API Collection
title: Deep Research API
description: Start, list, fetch, delete, and resume long-running deep-research sessions, plus a resumable SSE stream that replays the run to a reconnecting browser. Always mounted — no feature flag.
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

| Method | Path | Notes |
|---|---|---|
| POST | `/deep-research` | Start a run. Body `DeepResearchSessionCreate(question)`. Creates the `DeepResearchSession` row (`status=running`) and dispatches `run_deep_research_task` with `queue="research"`. Returns the session. |
| GET | `/deep-research` | List the caller's sessions (`DeepResearchSession` list view — no `report`/`cited_sources`/`run_state`). |
| GET | `/deep-research/{id}` | Detail (`DeepResearchSessionDetail` — adds `report` + `cited_sources`). `run_state` is never serialized. |
| DELETE | `/deep-research/{id}` | Delete a session. |
| POST | `/deep-research/{id}/resume` | Re-dispatch a run from its checkpoint. **409** unless `status == paused`. |
| GET | `/deep-research/{id}/stream` | **SSE** — resumable live stream (see below). |

# SSE stream (`/{id}/stream`)

Returns `StreamingResponse` (`text/event-stream`). Unlike the chat streams, the
generator opens its **own `AsyncSessionLocal`** inside the generator body rather
than using `stream_db_session()` as a dependency. It:

1. **Replays** the persisted run non-destructively — `LRANGE` over the Redis
   list `deepresearch:{id}:events` from an offset, so a browser that reconnects
   mid-run receives everything emitted so far (the worker `RPUSH`es every event;
   TTL 1800s).
2. **Tails live** for new events pushed by the running task.
3. **Closes** on a terminal stream event (`done`/`end`/`error`) or a terminal DB
   status (`completed`/`failed`), or when a `paused` state is reached.

The two-layer persistence (Redis event relay + `run_state` checkpoint) that
makes this replay/resume possible is described in
[/features/deep-research.md](/features/deep-research.md) and the
[resumable long-running agent runs ADR](/decisions/resumable-agent-runs.md).

# Related

- Model & schemas: [/backend/models.md](/backend/models.md)
  (`DeepResearchSession`, `deep_research.py` schemas).
- Task & queue: [/backend/tasks.md](/backend/tasks.md)
  (`run_deep_research_task`, the `research` queue).
- Frontend client/hook: `chatStreamClient.streamDeepResearch` +
  `useDeepResearchStream` — see
  [/frontend/chat-system.md](/frontend/chat-system.md) and
  [/frontend/hooks.md](/frontend/hooks.md).
