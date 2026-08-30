# API Routers

22 FastAPI routers, one `APIRouter()` per feature domain, all mounted under
`/api/v1` (some with additional sub-prefixes). Auth wiring: `auth_router` has
no dependency; `users_router` uses `require_admin`; all others use
`get_current_user`. See [entry-point.md](/backend/entry-point.md) for the
mount table and tags.

The routers are grouped below into 7 domain concept files by function:

# Concepts

* [Auth & Users](auth-users.md) - Google OAuth, admin login, refresh, profile; admin user management. (2 routers)
* [Papers & Library](papers.md) - ingest, papers, annotations, groups, tags, relationships, citation-map, duplicates, export. (9 routers)
* [Chat](chat.md) - single-paper + multi-paper/group chat with SSE streaming and threaded messages. (2 routers)
* [AI Features](ai.md) - summaries, findings, reading guides, highlights, per-user BYO AI providers/settings. (3 routers)
* [Discovery](discovery.md) - academic source search, AI search stream, recommendations, HuggingFace Daily Papers. (2 routers)
* [Deep Research](deep-research.md) - long-running, source-cited research sessions on the `research` queue with durable generations, follow-ups, cancellation, archive search, and cursor-based SSE. (1 router)
* [Infra & Stats](infra.md) - search, saved searches, statistics, Celery task status, dead-letter queue. (3 routers)

# Conventions

- Path-param `paper_id` lookups use the `get_paper_or_404` dependency (eager-loads `tags`) rather than per-route queries.
- Shared async CRUD helpers live in `backend/app/api/crud/` with ownership scoping via `services/access` — see [crud.md](/backend/crud.md).
- Streaming endpoints (`*/stream`) return `StreamingResponse` with `media_type="text/event-stream"` and use `stream_db_session()` (see [database.md](/backend/database.md)).
