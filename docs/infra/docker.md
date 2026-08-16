---
type: Infrastructure
title: Docker Compose
description: The 8-service topology (traefik, postgres, redis, backend, interactive celery-worker x2, dedicated research-worker, celery-beat, frontend) across dev and prod, with the key differences between the two compose files.
resource: docker-compose.dev.yml
tags: [infra, docker, compose, deployment]
timestamp: 2026-06-28T00:00:00Z
---

Both compose files share the same 8-service topology: **traefik, postgres,
redis, backend, interactive celery-worker (replicas: 2), dedicated
research-worker, celery-beat, frontend**. Note:
**there is NO `landing` service** — the landing site is built/published
outside this stack (its `dist/` is served elsewhere).

# `docker-compose.dev.yml`

| Service | Image / Build | Ports | Volumes | Traefik |
|---|---|---|---|---|
| `traefik` | `traefik:v2.11` (`:3`) | `80:80` (`:12-13`) | docker.sock (ro) (`:15`) | dashboard `traefik.testing.maurc.org`, `api.insecure=true` (`:20-22`) |
| `postgres` | `pgvector/pgvector:pg16` (`:26`) | `5433:5432` (`:33-34`) | `postgres_data` + `./init-db.sql` mounted into init dir (`:36-37`) | off (`:46`) |
| `redis` | `redis:7-alpine` (`:50`), `--appendonly yes` | `6379:6379` (`:53-54`) | `redis_data:/data` (`:56`) | off (`:65`) |
| `backend` | `./backend/Dockerfile` (`:69-71`) | — | `storage_data:/app/storage` (`:105`) | `api.testing.maurc.org`, port 8000, healthcheck `/health` (`:113-123`) |
| `celery-worker` | same Dockerfile, **replicas: 2**, interactive queues only (`ai,processing,discovery,dead_letter`) | — | `storage_data:/app/storage` | off |
| `research-worker` | same Dockerfile, one worker on `research` with concurrency 1 | — | `storage_data:/app/storage` | off |
| `celery-beat` | same Dockerfile (`:181-182`), `uv run celery -A app.celery_app beat -l info` (`:183`) | — | — | off (`:206`) |
| `frontend` | `./frontend-v2/Dockerfile` (`:210-212`) build args `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` | — | — | `testing.maurc.org`, port 4173, healthcheck `/` (`:221-231`) |

Networks: `app-network` (bridge). Volumes: `postgres_data`, `redis_data`,
`storage_data`. `DEBUG=true` default (`:81`); all hosts hardcoded
`*.testing.maurc.org`. Uses `uv run` to launch celery.

# `docker-compose.prod.yml`

Same 7 services, with prod differences:

1. **TLS**: dev is HTTP-only on `:80`; prod adds `:443` + Let's Encrypt ACME (`leresolver`) and HTTP→HTTPS redirect (`:12-18`).
2. **Hosts**: dev hardcodes `*.testing.maurc.org`; prod uses `${BACKEND_DOMAIN}` / `${FRONTEND_DOMAIN}` / `${TRAEFIK_DOMAIN}` env vars (`:30,123,232`).
3. **Middleware**: prod attaches `security-headers@file` to backend, frontend, dashboard routers; dev does not.
4. **Port exposure**: dev exposes postgres (`5433`) and redis (`6379`) to the host for debugging; prod exposes neither.
5. **Storage**: dev uses named volume `storage_data`; prod uses a bind mount `./backend/storage:/app/storage` (`:118-119`).
6. **Redis**: prod adds `--maxmemory 256mb --maxmemory-policy allkeys-lru` (`:61`).
7. **Celery command**: dev prefixes `uv run`; prod calls `celery` directly (`:139`, `:191`).
8. **Container naming**: dev `papers-*`; prod `nexus-*-prod`.
9. **middlewares.yml** is only mounted into Traefik in prod (`:24`).
10. `DEBUG=false` hardcoded (`:88`, `:149`, `:199`).