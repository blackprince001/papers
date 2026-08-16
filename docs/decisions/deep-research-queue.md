---
type: ADR
title: Dedicated `research` queue and worker capacity
description: Deep research runs on its own Celery `research` queue for isolation. Redis does not provide AMQP broker dead-lettering; worker capacity and application-level retry state provide the current safety boundary.
tags: [adr, deep-research, celery, queue, config, feature-flag]
timestamp: 2026-07-15T00:00:00Z
---

# Decision

Two related choices:

1. **Isolation by queue, not by throttle.** Deep-research tasks run on a
   dedicated Celery **`research`** queue (`celery_app.py`: a `research_exchange`,
   a `Queue("research", …)`, and `task_routes` for
   `app.tasks.deep_research_tasks.*` and `research.*`). Interactive workers
   consume `ai,processing,discovery,dead_letter`; a dedicated research worker
   consumes only `research` with concurrency 1. Redis does not implement the
   AMQP dead-letter queue arguments, so retry and failure handling remain
   application-level.
2. **No queue feature flag.** The router remains mounted at
   `/api/v1/deep-research`, while unsafe start/resume mutations are currently
   frozen by `DEEP_RESEARCH_MUTATIONS_ENABLED=false` until the lifecycle rewrite
   passes its release gates. This is separate from worker queue routing.

# Why

- Long, minutes-scale agent runs on the shared `ai` queue would starve
  interactive chat/feature tasks (which are rate-limited `10/m`). A separate queue
  and worker give deep research its own concurrency lane and long time limits
  (`soft_time_limit=1500`, `time_limit=1560`) without touching the shared limits.
- A Redis token-bucket daily cap is not a substitute for worker isolation; current
  admission limits are handled transactionally in the API.

# Tradeoffs

- + Interactive work is protected from long research runs; deep research gets its
  own worker capacity and application-level retry handling.
- + Queue routing is explicit; interactive worker capacity cannot be consumed by
  research tasks.
- − Operators must run the dedicated research worker, or research tasks queue up
  unconsumed (documented in [/infra/docker.md](/infra/docker.md)).
- − Run admission is bounded by the active-run limit; deeper lifecycle and
  retention controls are being replaced under the current safety freeze.
- − The mutation freeze remains until the lifecycle replacement is released.

# Alternatives considered

- **Run on the existing `ai` queue** — rejected; head-of-line blocking against
  interactive chat.
- **Per-user Redis token-bucket daily cap** — rejected; solves a different
  problem than contention and adds config/accounting.
- **Keep `ENABLE_DEEP_RESEARCH` as an opt-in flag** — rejected; dead config for a
  finished feature (deploy ≠ release only matters while a feature is in flight).

# Citations

[1] `backend/app/celery_app.py` — `research_exchange`, `Queue("research", …)`, `task_routes`, and worker queue separation.
[2] `backend/app/tasks/deep_research_tasks.py` — `queue="research"`; [/backend/tasks.md](/backend/tasks.md).
[3] `docker-compose.dev.yml` / `docker-compose.prod.yml` — interactive/research worker queue assignments; [/infra/docker.md](/infra/docker.md).
[4] `backend/app/core/config.py`, root `.env.example` — `ENABLE_DEEP_RESEARCH` removed; [/backend/config.md](/backend/config.md), [/infra/env-config.md](/infra/env-config.md).
[5] [/features/deep-research.md](/features/deep-research.md) — the feature overview.
