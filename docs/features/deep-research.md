---
type: Feature Plan
title: Deep Research
description: Multi-step, source-backed research sessions run by an agent inside a dedicated Celery `research` queue — resumable via a run-state checkpoint plus a replayable Redis event relay. Implemented and always-on (no env flag, zero env vars).
tags: [feature-plan, deep-research, agent, celery, sse, implemented]
timestamp: 2026-06-28T00:00:00Z
---

A "deep research" feature: long-running, multi-step research sessions that
ground answers in real web/academic sources, executed by an agent. **Now
implemented** — always-on (no feature flag, zero env vars), running as a Celery
task on a dedicated `research` queue with a resumable run-state checkpoint and a
replayable SSE event relay. Originally tracked as a plan referenced by the
[reformation assessment](/reformation.md).

# Status

**Implemented, currently frozen for replacement.** The existing model, schemas,
migration, service, task, router, and frontend pages are present, but new starts and
resumes are disabled in every deployment by `DEEP_RESEARCH_MUTATIONS_ENABLED=false`
while the unsafe lifecycle, replay, evidence, and authorization paths are replaced.
Completed reports remain readable. This is a temporary safety gate, not a new product
feature flag; see the [reformation plan](/features/reader-ai-experience.md).

# Motivation

The discovery agent ([/backend/services/ai-agent.md](/backend/services/ai-agent.md))
fires one-shot searches across arXiv / Semantic Scholar / OpenAlex / Google
Scholar with a bounded turn budget (`AGENT_MAX_TURNS=25`). Deep research extends
that into a longer-running, source-cited, multi-step investigation — the kind of
query where the answer requires chaining several searches and reading partial
results — without occupying a regular chat worker slot for minutes.

# Configuration

The legacy implementation is frozen by default. Set
`DEEP_RESEARCH_MUTATIONS_ENABLED=false` in every environment until the replacement
passes its release gates. The old `ENABLE_DEEP_RESEARCH` product flag and earlier
`DEEP_RESEARCH_*` settings were removed; the temporary mutation gate controls safety
during the rewrite, not product availability. Turn budgets exist only as code constants
(`SEGMENT_MAX_TURNS=8`, `MAX_TOTAL_SEGMENTS=30` in `deep_research_service.py`);
there is no `DEEP_RESEARCH_MAX_TURNS` env var. The Celery worker `-Q` list in
both compose files now includes the `research` queue. See
[/backend/config.md](/backend/config.md),
[/infra/env-config.md](/infra/env-config.md), and
[/infra/docker.md](/infra/docker.md).

# Architecture (as implemented)

Reuses existing infrastructure — the openai-agents SDK, Celery, Redis, and the
agent error taxonomy — rather than introducing a new stack. There is **no MCP
server** (the earlier sketch is dropped).

- **Agent**: the pre-existing `create_deep_research_agent`
  (`services/ai/agent/agents.py`) is driven by
  `services/deep_research_service.py` inside the Celery worker via `asyncio.run`.
  The run advances in **bounded segments** (`SEGMENT_MAX_TURNS=8`, up to
  `MAX_TOTAL_SEGMENTS=30`). The provider is resolved per-user via
  `resolve_providers` (first/default), honoring BYO providers
  ([/decisions/byo-ai-providers.md](/decisions/byo-ai-providers.md)).
- **Two persistence layers** (see [resumable long-running agent runs](/decisions/resumable-agent-runs.md)):
  1. **UI relay** — every stream event from `adapt_stream` is `RPUSH`ed to the
     Redis list `deepresearch:{id}:events` (`expire`, TTL 1800s; keepalives
     skipped) so the SSE endpoint can replay the run to a reconnecting browser
     non-destructively (`LRANGE` from an offset, then tails live). Mirrors the
     paper-progress relay pattern in `tasks/base.py`.
  2. **Agent checkpoint** — after each segment and on error, the agent's
     `to_input_list()` is written to `DeepResearchSession.run_state` (JSON) so an
     interrupted run resumes without repeating searches. `run_state` is
     INTERNAL: never in a schema, never sent to clients.
- **Execution**: `run_deep_research_task(session_id, user_id)`
  (`tasks/deep_research_tasks.py`, Celery name `research.run_deep_research`) runs
  on the dedicated **`research`** queue (own exchange + DLQ routing in
  `celery_app.py`). `DeepResearchTask(BaseTask)`: `soft_time_limit=1500`,
  `time_limit=1560`, `max_retries=8`,
  `autoretry_for=(DeepResearchRetryable, ConnectionError, TimeoutError, OSError)`;
  `on_failure` marks the run `failed` when retries exhaust. See
  [/backend/tasks.md](/backend/tasks.md).
- **Failure routing** via the `agent/error.py` taxonomy
  ([/decisions/structured-ai-errors.md](/decisions/structured-ai-errors.md)):
  recoverable (rate_limit / network / timeout / provider_unavailable /
  max_turns) → raise `DeepResearchRetryable` and Celery retry resumes from the
  checkpoint; user-actionable (auth / no_provider) → `status=paused` awaiting a
  manual `POST /{id}/resume`; anything else → `failed`.
  `SoftTimeLimitExceeded` → checkpoint + `DeepResearchRetryable`.
- **No throttling**: there is **no per-user rate limit** and no daily cap.
  Isolation is by queue instead — see the
  [dedicated `research` queue ADR](/decisions/deep-research-queue.md).
- **Persistence model**: `DeepResearchSession` (table `deep_research_sessions`)
  holds `question`, `title`, `status`
  (`running`/`paused`/`completed`/`failed`), the final `report` markdown, the
  ordered `cited_sources` JSON (`[{title, url, source, external_id}]`, extracted
  best-effort from links in the report), `run_state`, `last_error_code`, and
  `attempt_count`. See [/backend/models.md](/backend/models.md). Migration
  `backend/migrations/versions/deep_research_001.py`
  (`down_revision = "add_last_opened_at"`) is the current Alembic head — see
  [/backend/database.md](/backend/database.md).
- **API**: router `backend/app/api/deep_research.py` mounted at
  `/api/v1/deep-research` (always mounted, no flag) — start / list / detail /
  delete / resume / SSE stream. See
  [/backend/api/deep-research.md](/backend/api/deep-research.md).
- **Frontend**: `DeepResearch.tsx` (`/deep-research`) live-run view and
  `DeepResearchArchive.tsx` (`/deep-research-archive`); streamed via
  `chatStreamClient.streamDeepResearch` + `useDeepResearchStream`; cited sources
  add to the library via `papersApi.ingestBatch`. See
  [/frontend/chat-system.md](/frontend/chat-system.md),
  [/frontend/hooks.md](/frontend/hooks.md), and
  [/frontend/routing.md](/frontend/routing.md).

# Implementation checklist

- [x] `DeepResearchSession` model + migration (`deep_research_001`).
- [x] Deep-research agent driven from a Celery service (`deep_research_service.py`).
- [x] Celery task `research.run_deep_research` on a dedicated `research` queue.
- [x] `/api/v1/deep-research` routes (start, list, get, delete, resume, SSE stream).
- [x] Frontend routes + pages (`DeepResearch`, `DeepResearchArchive`) with `useDeepResearchStream`.
- [x] ADRs: [resumable long-running agent runs](/decisions/resumable-agent-runs.md) and [dedicated `research` queue / always-on](/decisions/deep-research-queue.md).
- [x] Removed the `ENABLE_DEEP_RESEARCH` flag — feature is always-on with zero env vars.

# Citations

[1] `backend/app/services/deep_research_service.py` — segment loop, two persistence layers, failure routing.
[2] `backend/app/tasks/deep_research_tasks.py`, `backend/app/celery_app.py` — task + `research` queue.
[3] `backend/app/api/deep_research.py` — routes; [/backend/api/deep-research.md](/backend/api/deep-research.md).
[4] `backend/app/models/deep_research.py` — `DeepResearchSession`; [/backend/models.md](/backend/models.md).
[5] [/reformation.md](/reformation.md) — the assessment that originally tracked this feature.
