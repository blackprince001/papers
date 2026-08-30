---
type: Config
title: Environment Configuration
description: The full root .env.example variable list — API keys, DB/Redis components, JWT, Google OAuth/admin, email, prod domain vars — plus the frontend build-time vars.
resource: .env.example
tags: [infra, config, env]
timestamp: 2026-06-28T00:00:00Z
---

The root `.env.example` is the authoritative variable list. `backend/.env.example`
is a stub that points at it. The backend `Settings` class is documented in
[/backend/config.md](/backend/config.md).

# API keys

| Variable | Purpose | Line |
|---|---|---|
| `GOOGLE_API_KEY` | Server-side key — **embeddings only** (per `config.py:21-23`) | `:4` |
| `SEMANTIC_SCHOLAR_API_KEY` | Paper discovery source — Semantic Scholar (optional) | `:7` |
| `SERPAPI_KEY` | Paper discovery source — SerpAPI (Google Scholar) (optional) | `:8` |
| `OPENALEX_API_KEY` | Paper discovery source — OpenAlex (optional) | `:9` |

# Database & Redis

| Variable | Purpose |
|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Postgres connection components (default host `postgres`, port `5432`, db `papers`) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis broker for Celery + task status (default host `redis`, port `6379`) |

Or set `DATABASE_URL` directly (`postgresql+asyncpg://…`).

# Backend runtime

| Variable | Purpose |
|---|---|
| `DEBUG` | Debug flag (default `false`) |
| `PORT` | Backend listen port (default `8000`) |
| `STORAGE_PATH` | Paper file storage path (default `/app/storage/papers`) |
| `EMBEDDING_MODEL` | Embedding model name (default `gemini-embedding-001`) |
| `EMBEDDING_DIMENSION` | Embedding vector dim (default `768`) |
| `DEEP_RESEARCH_MUTATIONS_ENABLED` | Emergency stop for new deep-research starts/resumes; default `true` |

# Auth

| Variable | Purpose |
|---|---|
| `JWT_SECRET_KEY` / `JWT_ALGORITHM` / `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | JWT auth config (HS256, 30-min access, 7-day refresh) |
| `AI_KEY_ENCRYPTION_KEY` | Fernet key source for user AI-provider keys at rest; falls back to a `JWT_SECRET_KEY`-derived key (decrypt-only legacy path) when unset — must be identical across API + Celery processes |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin credentials (base64-encoded) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |

Note: `Settings` loads `env_file=".env"` **relative to the process cwd** — the
backend run from `backend/` does not see the repo-root `.env`; see
[setup](/infra/setup.md) for the source-and-override preamble.

# URLs

| Variable | Purpose |
|---|---|
| `FRONTEND_URL` | Frontend URL for CORS (default `http://testing.maurc.org`) |
| `APP_URL` | Application base URL |

# Email (optional)

`RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_ENABLED` (off by default).

# Deep research

Deep-research mutation endpoints are enabled by default. Set
`DEEP_RESEARCH_MUTATIONS_ENABLED=false` during an incident or maintenance window
to stop new starts and resumes; completed reports remain readable. The setting
does not change the dedicated `research` queue (see
[/infra/docker.md](/infra/docker.md)).

# Prod-only domain vars

`LETSENCRYPT_EMAIL` / `TRAEFIK_DOMAIN` / `BACKEND_DOMAIN` / `FRONTEND_DOMAIN`.

# Frontend build-time vars (`frontend-v2/.env.example`)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base (default `http://localhost:8000/api/v1`) — baked at build; passed as Docker build arg |
| `VITE_GOOGLE_CLIENT_ID` | Google client ID — baked at build; passed as Docker build arg |
| `VITE_DEEP_RESEARCH_MUTATIONS_ENABLED` | Frontend emergency UI gate; default `true` |

# Landing build-time vars (`landing/.env.example`)

| Variable | Purpose |
|---|---|
| `VITE_APP_URL` | URL of the deployed Lumen web app — drives all "Open Lumen" / login CTAs |
