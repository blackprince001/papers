---
type: ADR
title: Dedicated `research` queue; deep research always-on with no env flag
description: Deep research runs on its own Celery `research` queue (own exchange + DLQ) for isolation instead of a per-user rate limit or daily cap, and the feature ships always-on — the ENABLE_DEEP_RESEARCH flag and all DEEP_RESEARCH_* env vars were removed.
tags: [adr, deep-research, celery, queue, config, feature-flag]
timestamp: 2026-07-15T00:00:00Z
---

# Decision

Two related choices:

1. **Isolation by queue, not by throttle.** Deep-research tasks run on a
   dedicated Celery **`research`** queue (`celery_app.py`: a `research_exchange`,
   a `Queue("research", …)` with DLQ routing, and `task_routes` for
   `app.tasks.deep_research_tasks.*` and `research.*`). The worker `-Q` list in
   both compose files is now `ai,processing,discovery,research,dead_letter`. There
   is **no per-user rate limit and no daily cap** on deep research — long runs are
   kept off the shared `ai`/`processing` lanes by queue separation instead.
2. **Always-on, zero config.** Deep research ships enabled for everyone. The
   `ENABLE_DEEP_RESEARCH` feature flag — the last deep-research env var — was
   removed from `backend/app/core/config.py`, the root `.env.example`, and both
   `docker-compose.dev.yml` / `docker-compose.prod.yml`. The router is
   unconditionally mounted at `/api/v1/deep-research`. (The earlier
   `DEEP_RESEARCH_DAILY_CAP` / `_MODEL` / `_MCP_URL` / `_MCP_TOKEN` vars were
   already removed on 2026-07-01.)

# Why

- Long, minutes-scale agent runs on the shared `ai` queue would starve
  interactive chat/feature tasks (which are rate-limited `10/m`). A separate queue
  gives deep research its own concurrency lane and long time limits
  (`soft_time_limit=1500`, `time_limit=1560`) without touching the shared limits.
- A Redis token-bucket daily cap (the original plan) added config, an extra error
  code, and per-user accounting for little benefit once runs are isolated and
  resumable. Isolation solves the actual resource-contention problem; a cap only
  limits usage.
- A per-deployment feature flag is a liability for a self-hosted app: it adds a
  config path most operators would leave at the default, and the feature is now
  complete. Removing the flag deletes dead config and one more thing to get wrong.

# Tradeoffs

- + Interactive work is protected from long research runs; deep research gets its
  own limits and DLQ.
- + Zero configuration — nothing to flip on; no env drift between
  `config.py`/`.env.example`/compose.
- − Operators must include `research` in the worker `-Q` list, or research tasks
  queue up unconsumed (documented in [/infra/docker.md](/infra/docker.md) and
  [/infra/env-config.md](/infra/env-config.md)).
- − No cap means a user can enqueue many concurrent runs; bounded only by worker
  concurrency and each run's own segment budget. Acceptable for the self-hosted,
  BYO-provider model (the user spends their own tokens).
- − Can no longer disable the feature per deployment without code changes.

# Alternatives considered

- **Run on the existing `ai` queue** — rejected; head-of-line blocking against
  interactive chat.
- **Per-user Redis token-bucket daily cap** — rejected; solves a different
  problem than contention and adds config/accounting.
- **Keep `ENABLE_DEEP_RESEARCH` as an opt-in flag** — rejected; dead config for a
  finished feature (deploy ≠ release only matters while a feature is in flight).

# Citations

[1] `backend/app/celery_app.py` — `research_exchange`, `Queue("research", …)`, `task_routes`.
[2] `backend/app/tasks/deep_research_tasks.py` — `queue="research"`; [/backend/tasks.md](/backend/tasks.md).
[3] `docker-compose.dev.yml` / `docker-compose.prod.yml` — worker `-Q …,research,dead_letter`; [/infra/docker.md](/infra/docker.md).
[4] `backend/app/core/config.py`, root `.env.example` — `ENABLE_DEEP_RESEARCH` removed; [/backend/config.md](/backend/config.md), [/infra/env-config.md](/infra/env-config.md).
[5] [/features/deep-research.md](/features/deep-research.md) — the feature overview.
