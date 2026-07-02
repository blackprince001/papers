---
type: Architecture
title: System Architecture
description: Top-level map of the papers monorepo — FastAPI backend, React SPA, marketing site, and Docker/Traefik infrastructure.
tags: [architecture, overview]
timestamp: 2026-06-28T00:00:00Z
---

A polyglot full-stack monorepo for a self-hosted research-paper management
platform with AI-powered reading assistance, full-text + semantic search, and
citation-graph discovery.

Internal product names: repo dir `papers` · backend `Papers Research Engine`
· frontend/landing `Lumen` · prod containers `nexus-*-prod`.

# Project Type

Polyglot full-stack monorepo: **FastAPI 0.128 (Python 3.13)** backend +
**React 19 (TypeScript, Vite 7)** main SPA + **React 19** standalone marketing
landing app. PostgreSQL 16 with pgvector, Redis 7 (Celery broker + cache),
Traefik v2 reverse proxy. Deployed via Docker Compose (dev = HTTP on
`*.testing.maurc.org`; prod = HTTPS + Let's Encrypt).

# Directory Map

```
papers/
├── backend/                      # FastAPI + Celery (Python 3.13, uv)
│   ├── app/
│   │   ├── main.py               # App factory, router wiring, lifespan, /health
│   │   ├── dependencies.py       # Shared deps: auth, db, get_paper_or_404, scoping
│   │   ├── celery_app.py         # Celery instance, 3 queues + DLQ + beat
│   │   ├── api/                  # 21 APIRouter modules + api/crud/ helpers
│   │   ├── core/                 # config, database, security, encryption, logger, rate_limit
│   │   ├── crud/                 # Top-level CRUD (user_ai_provider + settings only)
│   │   ├── models/               # SQLAlchemy 2.x ORM models (~20 tables)
│   │   ├── schemas/              # Pydantic v2 DTOs, one file per domain
│   │   ├── services/             # Business logic + all external integrations
│   │   │   ├── ai/               # AI provider abstraction (providers/, agent/ SDK)
│   │   │   └── discovery/        # arXiv, Semantic Scholar, OpenAlex, Google Scholar
│   │   ├── tasks/                # Celery tasks (ai, paper_processing, discovery, email)
│   │   └── utils/                # Stateless helpers (text, JSON repair, citations)
│   ├── migrations/               # Alembic (head: citation_map_001, 43 revisions)
│   └── tests/                    # 10 test files focused on the AI agent layer
├── frontend-v2/                  # Main React SPA "Lumen"
│   └── src/                      # components, contexts, hooks, lib, pages
├── landing/                      # Separate React/Vite marketing site (no router)
├── docs/                         # This OKF knowledge bundle
├── docker-compose.dev.yml        # 7 services; traefik, postgres, redis, backend,
├── docker-compose.prod.yml       #   celery-worker (replicas:2), celery-beat, frontend
├── middlewares.yml               # security-headers + fix-js-mime-types (prod Traefik)
└── init-db.sql                   # CREATE EXTENSION vector (dev only)
```

# Module Overview

| Module / Package | Purpose | Concept |
|---|---|---|
| `backend/app/api/` | 21 FastAPI routers, one per domain, mounted under `/api/v1` | [/backend/api/index.md](/backend/api/index.md) |
| `backend/app/api/crud/` | Reusable async CRUD helpers with ownership scoping via `services/access` | [/backend/crud.md](/backend/crud.md) |
| `backend/app/core/` | Cross-cutting infra: settings, async+sync DB, JWT/password/Google, Fernet, structlog, rate limiter | [/backend/core.md](/backend/core.md) |
| `backend/app/models/` | SQLAlchemy 2.x ORM models (single `Base`, ~20 tables) | [/backend/models.md](/backend/models.md) |
| `backend/app/schemas/` | Pydantic v2 request/response DTOs, one file per domain | [/backend/models.md](/backend/models.md) |
| `backend/app/services/` | Domain services + all external API clients | [/backend/services/index.md](/backend/services/index.md) |
| `backend/app/services/ai/` | AI provider abstraction (5 providers) + openai-agents SDK orchestration | [/backend/services/ai-agent.md](/backend/services/ai-agent.md) |
| `backend/app/services/discovery/` | Academic source providers + AI-enhanced discovery search | [/backend/services/discovery-providers.md](/backend/services/discovery-providers.md) |
| `backend/app/tasks/` | Celery tasks across `processing`, `ai`, `discovery` queues + `dead_letter` DLQ | [/backend/tasks.md](/backend/tasks.md) |
| `backend/app/utils/` | Stateless helpers (text sanitization, JSON repair, citation extraction) | [/backend/utils.md](/backend/utils.md) |
| `frontend-v2/src/lib/api/` | REST client (`fetchApi` + 20 per-domain `*Api` modules) with silent refresh | [/frontend/api-layer.md](/frontend/api-layer.md) |
| `frontend-v2/src/lib/ai/` | SSE streaming clients for chat/discovery | [/frontend/chat-system.md](/frontend/chat-system.md) |
| `frontend-v2/src/components/reader/` | PDF.js reader orchestration + annotation overlay | [/frontend/pdf-reader.md](/frontend/pdf-reader.md) |
| `frontend-v2/src/contexts/` | 4 React contexts: Auth, ChatController, Reader, Tab | [/frontend/state-management.md](/frontend/state-management.md) |
| `frontend-v2/src/hooks/` | Custom hooks (chat streaming, AI-search, reading-session, typewriter) | [/frontend/hooks.md](/frontend/hooks.md) |
| `landing/src/` | Standalone marketing app; no router; 9 stacked sections | [/landing/index.md](/landing/index.md) |

# Data Flow

## Ingestion (URL → processed paper)

1. `POST /api/v1/ingest/urls` or `/ingest/upload` → `services/ingestion.py` fetches/parses.
2. Paper row + file persisted (`services/storage.py`, content-hash filenames).
3. Celery `processing.process_paper_full` queued → extracts text/citations/layout, then dispatches AI tasks (`generate_summary`, `extract_findings`, `generate_reading_guide`, `generate_highlights`, `generate_embedding`).
4. `retry_incomplete_ai` beat task (every 10 min) sweeps failed AI tasks into retry.

## Chat (single paper, streamed)

1. `POST /papers/{id}/chat/stream` (SSE) → `services/chat.py`.
2. OpenAI Agents SDK (`MultiProviderBuilder`) routes to the user's configured provider.
3. Function tools (`paper_tools`, `chat_history`, `rag_tool`) augment context; `BYOContext` contextvar carries the user for permission scoping.
4. `stream_adapter.py` converts SDK events to the app's SSE format.
5. Falls back to legacy `provider.generate()` if the SDK is unavailable.

## Frontend request lifecycle

1. `fetchApi<T>` (`lib/api/client.ts`) attaches `Authorization: Bearer <JWT>` via `tokenGetter` injected by `AuthContext`.
2. On 401 → `attemptSilentRefresh` (httpOnly refresh cookie) → replay once.
3. Server state via TanStack Query (5min stale, retry:1, no `refetchOnWindowFocus`).
4. Streaming (chat/discovery) uses `lib/ai/chatStream.ts` with its own 401→refresh→retry.

# External Dependencies

| Name | Purpose |
|---|---|
| `fastapi[standard]`, `pydantic`, `pydantic-settings` | Async web framework + validation + typed config |
| `sqlalchemy[asyncio]` + `asyncpg` | Async ORM engine |
| `psycopg2-binary` | Sync engine for Celery workers |
| `alembic` | DB migrations (43 revisions, head `citation_map_001`) |
| `pgvector` | Vector similarity search on embeddings |
| `celery[redis]` + `redis` | Background task queue + broker/result backend |
| `openai-agents[litellm]` + `openai` | Agents SDK orchestration; OpenAI-compatible client |
| `google-genai` + `google-auth` | Google Gemini provider + OAuth ID-token verification |
| `pypdf` + `pymupdf` | PDF text + per-page layout/figure extraction |
| `structlog` | JSON context logging |
| `resend` | Transactional email (optional) |
| `httpx` | HTTP client (ingestion, external APIs) |
| `serpapi` (google-search-results) | Google Scholar discovery provider |
| `scalar-fastapi` | API docs UI at `/api-docs` |
| `react` 19 + `react-router-dom` v7 | SPA + routing (frontend) |
| `@tanstack/react-query` v5 | Server state (frontend) |
| `react-pdf` + `pdfjs-dist` | In-browser PDF rendering, virtualized (frontend) |
| `@xyflow/react` + `react-force-graph-2d` | Citation-map graph viz (frontend) |
| `tailwindcss` v4 + `tw-animate-css` | Styling — CSS-based config, no JS config (frontend) |
| `vite-plugin-pwa` | PWA manifest + Workbox caching (frontend) |
| `traefik:v2.11` | Reverse proxy, TLS, Let's Encrypt (infra) |
| `pgvector/pgvector:pg16` | Postgres 16 image w/ vector extension (infra) |

# Per-user AI (BYO) Strategy

The **only** server-side key is `GOOGLE_API_KEY`, used strictly for
**embeddings** (`gemini-embedding-001`, 768-dim). All chat/feature generation
uses per-user `UserAISettings` + `UserAIProvider` rows: provider type,
**Fernet-encrypted** API key, optional `base_url`, `model`. `AIProviderRegistry`
registers `gemini`, `openai`, `openai-compatible`, `deepseek`, `anthropic`.
There is no env-key fallback for generation. Interactive chat uses the
openai-agents SDK (`MultiProviderBuilder` + `Runner.run_streamed()`);
Celery tasks and non-chat AI features use the legacy `AIProvider` ABC's
`provider.generate()` path directly. See the
[BYO AI providers decision](/decisions/byo-ai-providers.md) and the
[optional agents SDK decision](/decisions/optional-agents-sdk.md).

# Citations

[1] Open Knowledge Format (OKF) v0.1 — Draft. The structural conventions used by this bundle (YAML frontmatter with required `type`, `index.md` directory listings, `log.md` history, bundle-relative `/path.md` cross-links). Spec supplied locally; no canonical public URL referenced.