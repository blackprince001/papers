---
type: Config
title: Backend Configuration
description: Settings class fields and the full environment-variable list with defaults and purposes.
resource: backend/app/core/config.py
tags: [backend, config, env]
timestamp: 2026-06-28T00:00:00Z
---

`backend/app/core/config.py` defines `Settings(BaseSettings)` with
`SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")`
(`config.py:86-88`). A module-level singleton `settings = Settings()` is
instantiated at import (`config.py:135`).

# Plain fields

| Field | Type | Default | Line | Purpose |
|---|---|---|---|---|
| `PROJECT_NAME` | str | `"Research Engine"` | `:15` | API project name |
| `API_V1_STR` | str | `"/api/v1"` | `:16` | API prefix |
| `DATABASE_URL` | str | `""` | `:17` | Full DB URL (else derived from `DB_*`) |
| `STORAGE_PATH` | str | `"./storage/papers"` | `:18` | Paper file storage |
| `EMBEDDING_MODEL` | str | `"gemini-embedding-001"` | `:19` | Embedding model name |
| `EMBEDDING_DIMENSION` | int | `768` | `:20` | Vector dimension |
| `GOOGLE_API_KEY` | str | `""` | `:23` | Server-side key — **embeddings only** |
| `SERPAPI_KEY` | str | `""` | `:24` | Google Scholar discovery provider |
| `SEMANTIC_SCHOLAR_API_KEY` | str | `""` | `:25` | Semantic Scholar discovery provider |
| `OPENALEX_API_KEY` | str | `""` | `:26` | OpenAlex discovery provider |
| `AGENT_MAX_TURNS` | int | `25` | `:29` | Max agent turns |
| `DEEP_RESEARCH_MUTATIONS_ENABLED` | bool | `True` | `:32` | Emergency stop for new deep-research starts and resumes; normal operation is enabled |
| `DEBUG` | bool | `False` | `:30` | Debug flag |
| `PORT` | int | `8000` | `:31` | Backend listen port |
| `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` | str | `""` | `:35-39` | Postgres components (dev fallbacks localhost:5433, user/pass `postgres`, db `nexus`) |
| `REDIS_HOST`/`REDIS_PORT`/`REDIS_DB`/`REDIS_PASSWORD` | str/int | `localhost`/`6379`/`0`/`""` | `:42-45` | Redis broker + cache |
| `JWT_SECRET_KEY`/`JWT_ALGORITHM`/`ACCESS_TOKEN_EXPIRE_MINUTES`/`REFRESH_TOKEN_EXPIRE_DAYS` | varies | `""`/`"HS256"`/`30`/`7` | — | JWT auth config |
| `AI_KEY_ENCRYPTION_KEY` | str | `""` | — | Primary Fernet key for stored user AI keys; falls back to JWT-derived key ([decision](/decisions/separate-encryption-key.md)) |
| `GOOGLE_CLIENT_ID` | str | `""` | `:54` | Google OAuth client ID |
| `ADMIN_USERNAME`/`ADMIN_PASSWORD` | str | `""` | `:57-58` | Admin creds (base64-encoded) |
| `FRONTEND_URL` | str | `"http://localhost:5173"` | `:61` | CORS allow-list origin |
In `DEBUG` mode, the API also allows `http://127.0.0.1:5173` (and the corresponding port `3000` origins) so local access works whether the browser uses `localhost` or `127.0.0.1`.
| `RESEND_API_KEY`/`EMAIL_FROM`/`EMAIL_ENABLED` | varies | `None`/`"noreply@papers.local"`/`False` | `:64-66` | Resend email (optional, off by default) |
| `APP_URL` | str | `"http://localhost:5173"` | `:67` | Application base URL |

# Computed properties

- `REDIS_URL` (`:69-74`) — builds `redis://[:password@]host:port/db`.
- `CELERY_BROKER_URL` (`:76-79`) — returns `REDIS_URL`.
- `CELERY_RESULT_BACKEND` (`:81-84`) — returns `REDIS_URL`.

# model_post_init logic (`config.py:90-132`)

- If `JWT_SECRET_KEY` empty: in `DEBUG` auto-generates
  `secrets.token_hex(32)`; otherwise warns and still generates one (`:92-105`).
- If `DATABASE_URL` empty: constructs `postgresql+asyncpg://user:pass@host:port/name`
  from `DB_*` fields, falling back to dev defaults (`_DEV_*` at `:7-11`);
  warns if running non-debug with defaults (`:107-132`).

# Notable absences

`Settings` does NOT declare `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
`DEEPSEEK_API_KEY` — chat providers are per-user BYO (see
[ai-agent.md](/backend/services/ai-agent.md)), and the comment at
`config.py:21-23` confirms this. Deep research has one emergency mutation gate:
`DEEP_RESEARCH_MUTATIONS_ENABLED=false` stops new starts and resumes during an
incident or maintenance window. It is enabled by default. The old
`ENABLE_DEEP_RESEARCH` feature flag was removed. See
[deep-research](/features/deep-research.md) and the [reformation
plan](/features/reader-ai-experience.md).

# Citations

[1] Root `.env.example` is the authoritative variable list; `backend/.env.example` is a stub that points at it.
