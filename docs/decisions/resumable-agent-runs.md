---
type: ADR
title: Resumable long-running agent runs (checkpoint + replayable relay)
description: Deep-research runs persist the agent's to_input_list() as a run_state checkpoint and RPUSH every stream event to a Redis relay, so an interrupted run resumes without repeating work and a reconnecting browser replays the whole run; resume is routed by the error-taxonomy recoverable flag, with no throttling.
tags: [adr, deep-research, agent, celery, redis, sse, resumability]
timestamp: 2026-07-15T00:00:00Z
---

# Decision

Deep-research runs (`services/deep_research_service.py`, driven by
`run_deep_research_task` on the `research` queue) use **two independent
persistence layers**:

1. **Agent checkpoint** — the run advances in bounded segments
   (`SEGMENT_MAX_TURNS=8`, up to `MAX_TOTAL_SEGMENTS=30`). After each segment and
   on error, the agent's `to_input_list()` is written to
   `DeepResearchSession.run_state` (JSON). A resumed run rehydrates from this and
   does **not** repeat searches. `run_state` is internal — never in a schema,
   never sent to clients.
2. **UI relay** — every stream event from `adapt_stream` is `RPUSH`ed to the
   Redis list `deepresearch:{id}:events` (TTL 1800s; keepalives skipped). The SSE
   endpoint replays it non-destructively (`LRANGE` from an offset) then tails
   live, so a browser that reconnects mid-run receives everything so far.

Failure handling is **routed by the agent error taxonomy** (`agent/error.py`,
see [structured AI error codes](/decisions/structured-ai-errors.md)):

- **recoverable** (rate_limit / network / timeout / provider_unavailable /
  max_turns) → raise `DeepResearchRetryable`; Celery autoretry resumes from the
  checkpoint. `SoftTimeLimitExceeded` also checkpoints then raises
  `DeepResearchRetryable`.
- **user-actionable** (auth / no_provider) → `status=paused`, awaiting a manual
  `POST /{id}/resume`.
- otherwise → `status=failed` (also when `max_retries=8` is exhausted, via
  `on_failure`).

There is **no throttling** — no per-user rate limit and no daily cap on these
runs.

# Why

- A deep-research run can take minutes and dozens of tool calls; a transient
  provider/network error or a worker restart must not discard completed work.
  Checkpointing `to_input_list()` makes retries cheap and idempotent.
- Browsers disconnect (tab sleep, network blips) during long runs. A replayable
  Redis relay decouples the run's progress from any single SSE connection, so the
  UI reconciles on reconnect instead of losing the stream. This mirrors the
  existing paper-progress relay in `tasks/base.py`.
- Splitting recoverable vs user-actionable failures lets the system auto-heal the
  former and cleanly park the latter for a human to fix (e.g. add a provider
  key) — reusing the taxonomy that already exists for chat.

# Tradeoffs

- + Runs survive worker restarts, retries, and browser reconnects with no
  duplicated searches.
- + The SSE endpoint is stateless w.r.t. connection lifetime — it just replays
  and tails Redis.
- − Two persistence layers to keep coherent (Redis relay TTL vs the durable
  `run_state`); the relay is ephemeral (1800s) while the checkpoint is durable.
- − `run_state` stores raw agent input lists — potentially large JSON on the
  session row.
- − No throttle means a user can start many concurrent runs; mitigated by queue
  isolation rather than a cap (see the
  [dedicated `research` queue ADR](/decisions/deep-research-queue.md)).

# Alternatives considered

- **Single completed artifact (no streaming), like `search_source_task`** —
  rejected; long runs need live progress for engagement and observability.
- **Reuse the request-scoped SSE session only, no relay** — a dropped connection
  would lose all progress; can't replay.
- **Restart the agent from scratch on retry** — wastes tokens and repeats
  searches; the whole point of the checkpoint is to avoid this.
- **Per-user rate limit / daily cap (the earlier plan)** — dropped in favor of
  queue isolation.

# Citations

[1] `backend/app/services/deep_research_service.py` — segment loop, `run_state` checkpoint, Redis relay, failure routing.
[2] `backend/app/tasks/deep_research_tasks.py` — `DeepResearchTask` autoretry/`on_failure`; [/backend/tasks.md](/backend/tasks.md).
[3] `backend/app/api/deep_research.py` — the replaying SSE endpoint; [/backend/api/deep-research.md](/backend/api/deep-research.md).
[4] [/decisions/structured-ai-errors.md](/decisions/structured-ai-errors.md) — the error taxonomy that routes recoverable vs user-actionable.
[5] [/features/deep-research.md](/features/deep-research.md) — the feature overview.
