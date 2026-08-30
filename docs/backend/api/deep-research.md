---
type: API Collection
title: Deep Research API
description: Authenticated deep-research sessions with durable generations, evidence verification, cancellation, follow-ups, archive pagination, and cursor-based SSE.
resource: backend/app/api/deep_research.py
tags: [backend, api, deep-research, agent, sse]
timestamp: 2026-08-29T00:00:00Z
---

The router is mounted at `/api/v1/deep-research` and requires authentication.
Every read is scoped to the current user. The API never returns provider keys,
agent input checkpoints, raw tool output, or internal payload JSON.

# Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/deep-research` | Creates the session, generation, initial message, and outbox row in one transaction. `Idempotency-Key` safely retries a start. |
| GET | `/deep-research` | Compact caller-owned list, retained for existing clients. |
| GET | `/deep-research/archive` | Searchable page with `q`, `limit`, `offset`, `total`, and `has_more`. |
| GET | `/deep-research/{id}` | Owned report plus safe current-generation progress/provider metadata. |
| GET | `/deep-research/{id}/messages` | Ordered user/assistant message projections. |
| POST | `/deep-research/{id}/messages` | `mode=ask` answers from stored evidence; `mode=research` queues a new generation. Use `Idempotency-Key`. |
| POST | `/deep-research/{id}/cancel` | Sets a cooperative cancellation request. The worker writes the terminal event. |
| DELETE | `/deep-research/{id}` | Deletes paused/terminal history; active work is cancelled first. |
| POST | `/deep-research/{id}/resume` | Starts a new generation for a normal paused run. A run paused by the legacy migration is read-only and explains why. |
| GET | `/deep-research/{id}/stream` | Replays and tails durable Postgres events. |

# SSE stream

Each stored event has a monotonic sequence. The server signs the generation and
sequence into the SSE `id`; the client sends it back as `Last-Event-ID` after a
disconnect. A cursor for an older generation returns `409`, so a follow-up
cannot accidentally replay the wrong run. The stream closes on one durable
`done`, `error`, `paused`, or `cancelled` event.

# Current-generation metadata

The detail response includes a safe `generation` snapshot with phase, progress,
elapsed timestamps, provider type/model, scope, effort, verified source count,
verification status, and stop reason. Provider credentials, checkpoints, user
identifiers, and raw evidence are excluded.

# Related

- [Deep Research feature](/features/deep-research.md)
- [Deep Research operations runbook](/ops/deep-research.md)
- [Backend models](/backend/models.md)
- [Task and queue guide](/backend/tasks.md)
