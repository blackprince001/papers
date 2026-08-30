---
type: Module
title: Database Layer
description: Async (asyncpg) and sync (psycopg2) SQLAlchemy engines, request-scoped session, the SSE-stream session, and DB initialization.
resource: backend/app/core/database.py
tags: [backend, database, sqlalchemy, async]
timestamp: 2026-06-28T00:00:00Z
---

`backend/app/core/database.py` provides both async and sync engines sharing
one `Base` and one set of models.

# Engines & factories

| Artifact | Scope | Used by |
|---|---|---|
| async engine + `AsyncSessionLocal` (`database.py:11-23`) | FastAPI request lifecycle | routers, services |
| sync engine + `SyncSessionLocal` (psycopg2) (`database.py:27-43`) | Celery workers | background tasks (via `tasks/base.py:109` `sync_session_scope()`) |
| `Base = declarative_base()` | both | all ORM models (re-exported via `models/base.py:1`) |

# `get_session()` — request-scoped async session

Async generator (`database.py:48-57`): commits on success, rolls back on
exception, always closes. `expire_on_commit=False`. Exposed as the `get_db`
dependency in [dependencies.md](/backend/dependencies.md).

# `stream_db_session()` — for SSE/streaming

Async contextmanager (`database.py:60-82`) for `StreamingResponse`/SSE
generators. It opens a **fresh** session inside the streaming task to avoid
the asyncpg `MissingGreenlet` error that would occur if the request-scoped
session were reused across Starlette's separate streaming task. This is an
important non-obvious pattern — see
[decisions](/decisions/optional-agents-sdk.md) and the streaming endpoints in
[chat.md](/backend/api/chat.md).

# `init_db()` / `close_db()`

`init_db()` (`database.py`) ensures the `vector` extension; `create_all`
runs **only when `DEBUG=true`** — Alembic owns the schema otherwise (the
Dockerfile CMD runs `alembic upgrade head` before uvicorn). See
[decision](/decisions/migrations-own-schema.md). Called from the lifespan —
see [entry-point.md](/backend/entry-point.md). `close_db()` disposes both
engines.

# Migrations

Alembic at `backend/migrations/` — **46 revisions**, head
`deep_research_001` creates the original `deep_research_sessions` table.
`deep_research_002` adds generation-scoped lifecycle tables and quarantines
ownerless rows. `deep_research_003` adds provider pins and conversation modes.
`deep_research_004` migrates legacy checkpoints to generations, fences active
old runs, and removes the session checkpoint column — see
[/features/deep-research.md](/features/deep-research.md)). `init-db.sql`
(`CREATE EXTENSION IF NOT EXISTS vector`) is mounted in dev only; prod relies
on the `pgvector/pgvector:pg16` image + migrations.
