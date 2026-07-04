---
type: API Collection
title: Search, Statistics & Task Infrastructure API
description: Full-text + semantic search, saved searches, dashboard statistics/reading streaks, and Celery task status with dead-letter-queue requeue.
resource: backend/app/api/search.py
tags: [backend, api, search, statistics, tasks]
timestamp: 2026-06-28T00:00:00Z
---

Three routers under prefix `/api/v1`: `search.py` (tag `search`), `statistics.py`
(tag `statistics`), and `tasks.py` (tag `tasks`, extra `/api/v1/tasks` prefix).
Note: discovery has its own router — see [discovery.md](discovery.md).

# `search.py`

| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/search/capabilities` | | `{semantic_available, reason}` — false when no server embedding key |
| POST | `/search` | | semantic (pgvector); returns `semantic_available: false` + empty results when embeddings are unavailable instead of zero-vector garbage |
| POST | `/search/fulltext` | `:195` | fulltext search |
| POST | `/search/annotations` | `:229` | annotation search |
| GET | `/saved-searches` | `:257` | |
| POST | `/saved-searches` | `:265` | |
| DELETE | `/saved-searches/{search_id}` | `:281` | |

Search uses `services/search_service` (SQLAlchemy full-text + annotation
search). Semantic mode delegates to pgvector cosine similarity via the
`semantic_search` agent tool — see [ai-agent.md](/backend/services/ai-agent.md).

# `statistics.py`

| Method | Path | Line |
|---|---|---|
| GET | `/statistics/dashboard` | `:11` |
| GET | `/statistics/reading-streaks` | `:20` |

Backed by `services/reading_tracker`. Consumed by the frontend Dashboard
([/frontend/](/frontend/index.md)).

# `tasks.py` (prefix `/api/v1/tasks`)

| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/tasks/{task_id}` | `:16` | Celery task status |
| DELETE | `/tasks/{task_id}` | `:31` | revoke task |
| GET | `/tasks` | `:47` | list tasks |
| GET | `/tasks/workers/stats` | `:57` | worker stats |
| GET | `/tasks/dead-letter` | `:73` | DLQ contents |
| POST | `/tasks/dead-letter/{task_id}/requeue` | `:84` | requeue dead-letter |

Status uses `services/task_status` (`TaskStatus` pydantic model + enum). The DLQ
lives on the `dead_letter` Celery queue — see [tasks.md](/backend/tasks.md).