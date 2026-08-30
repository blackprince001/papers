# Backend — FastAPI + Celery (Python 3.13)

The `backend/` application server. FastAPI HTTP routers + Celery background
workers, async (asyncpg) and sync (psycopg2) SQLAlchemy engines sharing one
set of models, Pydantic v2 schemas, and per-user BYO AI providers.

Python 3.13, dependency management via `uv` (`backend/pyproject.toml`). Lint =
`ruff`, typecheck = `pyright`. Migrations: Alembic (heads include
`deep_research_004` and the independent annotation head).

# Concepts

* [Entry point](entry-point.md) - `app/main.py`: app factory, router wiring, lifespan, built-in `/health`.
* [Shared dependencies](dependencies.md) - `app/dependencies.py`: auth, db session, `get_paper_or_404`, ownership scoping.
* [Core package](core.md) - `app/core/`: config, database engines, security, encryption, logger, rate limiter.
* [Configuration](config.md) - `Settings` fields + environment variables.
* [Database layer](database.md) - async + sync engines, `get_session`, `stream_db_session`, `init_db`.
* [Security](security.md) - JWT, passwords, Google ID-token, Fernet at-rest key encryption.
* [Models & schemas](models.md) - SQLAlchemy 2.x ORM catalog + Pydantic v2 DTO mapping.
* [CRUD layer](crud.md) - consolidated CRUD helpers in `api/crud/`.
* [API routers](api/) - 22 FastAPI routers grouped by domain.
* [Services](services/) - business logic + external integrations (AI, discovery, citations, email, storage).
* [Celery tasks](tasks.md) - background tasks across `processing`, `ai`, `discovery`, `research` queues + DLQ.
* [Utils](utils.md) - stateless helpers (text, JSON repair, citation extraction).
* [Tests](tests.md) - 10 test files focused on the AI agent layer.

# Quick orientation

- All HTTP endpoints live under `/api/v1`; mounted in [entry-point.md](entry-point.md).
- Per-request ownership scoping pattern: `scoped_user_id(user)` returns `None`
  for admins (see all) or `user.id` for users — see [dependencies.md](dependencies.md).
- The only server-side AI key is `GOOGLE_API_KEY` (embeddings only); generation
  is per-user BYO — see [services/ai-agent.md](services/ai-agent.md).
