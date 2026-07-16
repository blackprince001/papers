---
type: Module
title: Celery Tasks
description: Background task queues — processing, ai, discovery, research, plus a dead-letter queue, beat schedule, BaseTask/BaseAITask, and per-user provider resolution.
resource: backend/app/celery_app.py
tags: [backend, celery, tasks, background]
timestamp: 2026-06-28T00:00:00Z
---

Celery instance in `backend/app/celery_app.py`. Tasks live under
`backend/app/tasks/` and are re-exported from `tasks/__init__.py`.

# Queues & routing

Four working queues + one DLQ (`celery_app.py:76-80`):

| Queue | Module glob |
|---|---|
| `processing` | `app.tasks.paper_processing.*`, `app.tasks.email_tasks.*` |
| `ai` | `app.tasks.ai_tasks.*` |
| `discovery` | `app.tasks.discovery_tasks.*` |
| `research` | `app.tasks.deep_research_tasks.*`, `research.*` (own `research_exchange` + DLQ routing) |
| `dead_letter` | retries/transient-task-dead-letter |

AI tasks are rate-limited `10/m` (`celery_app.py:82-84`). Soft/hard time
limits: 300s / 360s. `task_reject_on_worker_lost` is enabled. The `research`
queue is **not** rate-limited — deep research is isolated on its own queue
instead of throttled (see [/features/deep-research.md](/features/deep-research.md)
and the [dedicated `research` queue ADR](/decisions/deep-research-queue.md)).

# Beat schedule

`processing.retry_incomplete_ai` runs every 10 minutes
(`celery_app.py:92-98`) as the recovery mechanism — it sweeps failed AI tasks
back into retry.

# Base classes (`tasks/base.py`)

- `BaseTask` / `BaseAITask` base classes.
- `get_redis()`, `get_sync_session()`, `sync_session_scope()` contextmanager
  (`base.py:24,103,109`) — tasks use the **sync** engine (see
  [database.md](/backend/database.md)).
- `BaseAITask` resolves the per-user provider before running AI work.

# Tasks by file

| File | Tasks |
|---|---|
| `ai_tasks.py` | `generate_summary_task` (`:218`), `extract_findings_task` (`:270`), `generate_reading_guide_task` (`:319`), `generate_highlights_task` (`:368`), `generate_embedding_task` (`:486`) — all `base=BaseAITask`, provider-agnostic |
| `paper_processing.py` | `extract_citations_task` (`:89`), `process_paper_full` (`:204`), `backfill_layouts_task` (`:254`), `finalize_paper` (`:303`), `retry_incomplete_ai` (`:375`) — the beat-driven retry pool |
| `discovery_tasks.py` | `search_source_task` (`:37`) — fans out to providers, pushes progress over Redis; `ai_enhance_task` (`:143`) |
| `deep_research_tasks.py` | `run_deep_research_task(session_id, user_id)` (Celery name `research.run_deep_research`), `base=DeepResearchTask(BaseTask)`: `queue="research"`, `soft_time_limit=1500`, `time_limit=1560`, `max_retries=8`, `autoretry_for=(DeepResearchRetryable, ConnectionError, TimeoutError, OSError)`; `on_failure` marks the run `failed` on exhaustion. Drives the agent in bounded segments and writes a `to_input_list()` checkpoint — see [/features/deep-research.md](/features/deep-research.md) |
| `email_tasks.py` | `send_share_email` (`:4`, `queue="processing"`, `ignore_result=True`) |
| `search_tasks.py` | empty placeholder — search uses direct service methods, not Celery |

# Worker launch

Dev: `uv run celery -A app.celery_app worker -l info -Q ai,processing,discovery,research,dead_letter`
(`-c 4`, replicas:2 in compose). Beat: `uv run celery -A app.celery_app beat`.
Prod drops the `uv run` prefix. See
[infra/docker.md](/infra/docker.md).