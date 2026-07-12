# Papers (Lumen)

A modern, self-hosted research paper management platform with AI-powered reading assistance, full-text + semantic search, and multi-source paper discovery. Organize academic literature with intelligent tagging, threaded discussions, and citation-graph exploration. The web app ships under the product name **Lumen**; a standalone marketing site lives in `landing/`.

AI generation is **bring-your-own-key**: each user connects their own provider (Google Gemini, OpenAI, Anthropic, DeepSeek, or any OpenAI-compatible endpoint) in the app's AI settings, and keys are encrypted at rest. The only server-side AI key is a Google API key used strictly for embeddings.

## Features

### Paper Organization

- **Multi-source Ingestion**: Import papers directly from URLs (arXiv, ACM, IEEE, OpenReview, PMLR, NeurIPS, etc.) or upload PDFs
- **Hierarchical Groups**: Create nested collection structures to organize papers by topic, project, or custom taxonomy — scoped per user
- **Smart Tagging**: Apply custom tags to papers for flexible filtering and cross-cutting organization — scoped per user
- **Duplicate Detection**: Automatic detection and management of duplicate papers in your library
- **Reading Progress**: Track papers through states (unread, in-progress, read, archived) with reading time estimates

### AI-Powered Reading

- **Bring Your Own AI Provider**: Connect your own Gemini, OpenAI, Anthropic, DeepSeek, or OpenAI-compatible key (custom base URL + model) in the app's AI settings — keys are encrypted at rest, and there is no shared server key for generation
- **Chat with Papers**: Ask context-aware questions about any paper — agentic chat (OpenAI Agents SDK) with tools that read the paper, search your chat history, and pull related context from your library
- **Multi-paper & Group Chat**: Chat across several papers or an entire group at once, streamed over SSE
- **Threaded Conversations**: Create follow-up threads on responses for deeper exploration of specific topics
- **Auto-generated Summaries**: Receive AI-generated summaries upon paper ingestion for quick understanding
- **Key Findings Extraction**: Automatically extract main contributions, methodology, and conclusions
- **Reading Guides**: Get AI-generated guides with questions to guide your reading journey
- **Smart Highlights**: AI suggests important passages to highlight for quick review

### Reading & Annotation

- **Built-in PDF Reader**: Smooth, responsive PDF viewer integrated directly into the application
- **Rich Annotations**: Highlight text and attach notes directly on papers with multiple annotation types
- **Citation Graph**: Visualize connections between papers through extracted citation relationships
- **Bookmarks**: Mark important sections for quick navigation and reference

### Search & Discovery

- **Full-text Search**: Search across all paper content, metadata, and annotations — scoped to your library, with saved searches
- **Semantic Search**: Find papers by meaning using vector embeddings (768-dimensional vectors)
- **Multi-source Discovery**: Search arXiv, Semantic Scholar, OpenAlex, and Google Scholar from one place, with AI-enhanced streaming search and resumable discovery sessions
- **Recommendations & Citation Explorer**: "For You" paper recommendations, author search, and citation exploration for any discovered paper
- **HuggingFace Daily Papers**: Browse the daily trending-papers feed and add papers straight to your library
- **Paper Relationships**: Discover related papers through citation extraction and analysis
- **Advanced Filters**: Filter by tags, groups, reading status, publication date, and more

### Export & Integration

- **Multiple Export Formats**: Export papers with metadata in various formats
- **Annotations Export**: Export your annotations and notes separately or with papers

### Multi-user & Auth

- **Google OAuth**: Sign in with your Google account
- **Admin Login**: Local username/password login for administrators (configured via environment variables)
- **Per-user Data Isolation**: All papers, groups, tags, annotations, chat sessions, bookmarks, saved searches, and discovery sessions are fully scoped to the authenticated user
- **Admin Access**: Administrators can view all users' data for support and manage user accounts
- **Persistent Sessions**: Access token stored in localStorage for seamless page refreshes without re-authentication

## Architecture

Papers is a full-stack polyglot application designed for self-hosting.

### Backend

- **Framework**: FastAPI (Python 3.13+) — 21 domain routers mounted under `/api/v1`, Scalar API docs at `/api-docs`
- **Database**: PostgreSQL 16 with pgvector extension for vector embeddings
- **ORM**: SQLAlchemy 2.0 — async engine (asyncpg) for the API, sync engine (psycopg2) for Celery workers
- **Task Queue**: Celery with Redis broker — `ai`, `processing`, and `discovery` queues plus a dead-letter queue and a beat scheduler that retries incomplete AI processing
- **AI Orchestration**: OpenAI Agents SDK for agentic chat (function tools + SSE streaming) over per-user BYO providers; Fernet-encrypted provider keys
- **Vector Search**: pgvector for semantic similarity search using embeddings
- **Auth**: JWT access tokens + httpOnly refresh token cookies; Google OAuth + local admin login; per-user rate limiting
- **Caching**: Redis for session management and task status tracking

### Frontend

- **Framework**: React 19 with TypeScript (strict) for type-safe UI development
- **Build Tool**: Vite 7 for fast development and optimized production builds; installable PWA via `vite-plugin-pwa`
- **Routing**: React Router v7 with protected and public route groups
- **Styling**: TailwindCSS v4 (CSS-based config) with a near-monochrome design system (forest-green undertones, mint accent)
- **Data Management**: TanStack Query (React Query) for efficient server state management
- **PDF Viewer**: Virtualized react-pdf/PDF.js viewer with an annotation overlay for in-browser reading
- **Citation Graph**: Interactive citation-map visualization (`@xyflow/react` + `react-force-graph-2d`)
- **Theming**: Light and dark mode with adaptive logo and paper card color themes
- **Marketing Site**: Standalone landing app in `landing/` (React + Vite, no router) — built and deployed separately from the compose stack

### Infrastructure

- **Containerization**: Docker and Docker Compose for reproducible deployments
- **Reverse Proxy**: Traefik v2 for routing, SSL termination, and load balancing
- **SSL/TLS**: Automatic Let's Encrypt certificate provisioning and renewal
- **Development**: Includes local Traefik setup for localhost domain routing

## External Dependencies

Papers relies on several third-party services and libraries that need to be configured.

### AI Model Providers

**Server-side: Google Gemini API** (required for semantic search)

- Used for: **embeddings only** (`gemini-embedding-001`, 768-dimensional) — the corpus needs one consistent embedding model, so this key stays on the server
- Configuration: Set `GOOGLE_API_KEY` environment variable
- Get your key: <https://ai.google.dev/>
- Cost: Free tier available with usage limits; pay-as-you-go for higher volumes

**Per-user: bring your own provider** (required for chat and AI features)

- Used for: Chat, paper summaries, key findings extraction, reading guides, smart highlights, AI-enhanced discovery
- Configuration: Each user connects a provider in the app's AI settings after signing in — Google Gemini, OpenAI, Anthropic, DeepSeek, or any OpenAI-compatible endpoint (custom base URL + model), with a built-in connection test
- Storage: Keys are Fernet-encrypted at rest using `AI_KEY_ENCRYPTION_KEY`; there is no server-side fallback key for generation

### Auth

**Google OAuth** (required for Google sign-in)

- Configuration: Set `GOOGLE_CLIENT_ID` environment variable
- Get your client ID: <https://console.cloud.google.com/>

**Admin Login** (optional local admin account)

- Configuration: Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` as base64-encoded strings
- Example: `echo -n "admin" | base64` → set as `ADMIN_USERNAME`

### Search & Discovery Integration (Optional)

- **Semantic Scholar API**: Academic paper search and citation data
  - Configuration: Set `SEMANTIC_SCHOLAR_API_KEY` (optional — falls back to arXiv)
  - Cost: Free tier available

- **OpenAlex API**: Open catalog of scholarly works for paper and author discovery
  - Configuration: Set `OPENALEX_API_KEY` (optional)
  - Cost: Free

- **SerpAPI**: Google Scholar search for paper discovery
  - Configuration: Set `SERPAPI_KEY` (optional)
  - Cost: Free tier with limited queries; paid plans available

### Email (Optional)

- **Resend**: Transactional email, off by default
  - Configuration: Set `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_ENABLED=true`

### Database (PostgreSQL)

- **pgvector Extension**: Enables vector similarity search on embeddings
- **PostgreSQL 16+**: Required for advanced features and performance
- Self-hosted or managed PostgreSQL service (AWS RDS, Google Cloud SQL, etc.)

### Infrastructure Services

- **Redis**: In-memory data structure store for task queue and session management
- **Docker**: Container runtime for local and production deployments

## System Requirements

### Local Development

- **Python**: 3.13 or later
- **Node.js**: 18+ or Bun (JavaScript package manager/runtime)
- **PostgreSQL**: 16 with pgvector extension
- **Redis**: 7.0+ for task queue
- **RAM**: Minimum 4GB (2GB backend, 1GB frontend, 1GB services)
- **Storage**: At least 10GB for paper PDFs and database

### Production Server

- **OS**: Linux (Ubuntu 22.04+ recommended) or compatible
- **CPU**: 2+ cores
- **RAM**: 4GB minimum (8GB+ recommended for 3+ Celery workers)
- **Storage**: 20GB+ SSD for database, papers, and cache
- **Docker**: Docker and Docker Compose installed
- **Domain**: A registered domain with DNS pointing to your server

## Getting Started

### Prerequisites

1. **Get API Keys**
   - Google API Key: <https://ai.google.dev/> (server-side, used for embeddings/semantic search only)
   - Google Client ID: <https://console.cloud.google.com/> (required for Google sign-in)
   - Optional: Semantic Scholar API, OpenAlex, SerpAPI (paper discovery); Resend (email)
   - Chat and AI generation use each user's own provider key, added in the app's AI settings after sign-in — no server key required

2. **Install Dependencies**
   - Python 3.13+: <https://www.python.org/downloads/>
   - Node.js 18+ or Bun: <https://nodejs.org/> or <https://bun.sh/>
   - Docker & Docker Compose: <https://www.docker.com/products/docker-desktop>

There are three ways to run Papers. Pick one:

| Mode | Compose file | Best for |
| --- | --- | --- |
| [Local instance](#local-instance-without-docker) | none (or services-only) | Day-to-day development with hot reload |
| [Docker dev](#docker-dev) | `docker-compose.dev.yml` | Running the full stack locally, HTTP only |
| [Docker prod](#production-deployment) | `docker-compose.prod.yml` | Self-hosting on a server with a real domain + TLS |

> There is no plain `docker-compose.yml` — always pass `-f docker-compose.dev.yml` or `-f docker-compose.prod.yml`.

### Local Instance (Without Docker)

Run PostgreSQL and Redis (the easiest way is Docker for just the services), then run the backend and frontend directly with hot reload.

**PostgreSQL & Redis:**

```bash
# Using Docker for just the services
# (dev compose maps postgres to host port 5433, redis to 6379)
docker compose -f docker-compose.dev.yml up -d postgres redis

# Or install locally and run
# PostgreSQL: createdb papers; psql papers -c "CREATE EXTENSION IF NOT EXISTS vector;"
# Redis: redis-server
```

**Environment preamble** — the backend reads `.env` from its working directory (`backend/.env`), *not* the repo root, so the root `.env` is not picked up automatically. Create the root `.env` once (`cp .env.example .env`, fill in your keys), then in **every** backend terminal (API, Celery worker, Celery beat) load it and override the Docker-oriented values for a local run:

```bash
cd backend
set -a; source ../.env; set +a    # load the root .env into the shell
export DB_HOST=localhost
export DB_PORT=5433               # dev compose maps postgres to 5433; use 5432 for native PostgreSQL
export REDIS_HOST=localhost
export STORAGE_PATH=./storage/papers   # the .env value is the container path /app/storage/papers
export FRONTEND_URL=http://localhost:5173
export APP_URL=http://localhost:5173
export DEBUG=true
```

> Keep `REDIS_PASSWORD` empty in `.env` — the compose Redis runs without `--requirepass`, so any password fails authentication. And don't generate fresh random values for `JWT_SECRET_KEY` / `AI_KEY_ENCRYPTION_KEY` per terminal: the Celery worker decrypts user AI keys with the same secrets the API encrypted them with, so all processes must share the values from `.env`.

**Backend (API):**

```bash
cd backend                        # then run the environment preamble above
uv sync                           # Install dependencies
uv run alembic upgrade head      # Run migrations
uv run fastapi dev --reload app/main.py   # Start dev server (localhost:8000)
```

**Frontend:**

```bash
cd frontend-v2
bun install                       # or: npm install
# Create .env file
echo "VITE_API_URL=http://localhost:8000/api/v1" > .env
echo "VITE_GOOGLE_CLIENT_ID=your_google_client_id" >> .env
bun run dev                       # or: npm run dev (localhost:5173)
```

**Celery Worker (needed for paper ingestion and AI background tasks):**

The worker and beat need the same environment as the API — they connect to the same database and Redis, use `GOOGLE_API_KEY` for embeddings, and decrypt user AI-provider keys. Run the environment preamble in each terminal first.

```bash
cd backend                        # then run the environment preamble above
uv run celery -A app.celery_app worker -l info -Q ai,processing,discovery,dead_letter
```

```bash
# Optional (separate terminal, same preamble): beat scheduler for periodic retry sweeps
cd backend
uv run celery -A app.celery_app beat -l info
```

### Docker Dev

`docker-compose.dev.yml` runs the full 7-service stack (Traefik, PostgreSQL, Redis, backend, 2 Celery workers, Celery beat, frontend) behind Traefik on port 80, HTTP only. The hostnames are **hardcoded** in the compose file's Traefik `Host()` labels — check `docker-compose.dev.yml` for the current values and replace `testing.yourdomain.com` below with them (or edit the labels to your own domain). The `/etc/hosts` entries and the dev URLs in `.env` must match the labels. Point the hostnames at localhost first:

```bash
# Add the dev hostnames to /etc/hosts
echo "127.0.0.1 testing.yourdomain.com api.testing.yourdomain.com traefik.testing.yourdomain.com" | sudo tee -a /etc/hosts
```

```bash
# Clone the repository
git clone <your-repo-url>
cd papers

# Create .env from the template and fill in your values
cp .env.example .env
```

At minimum set these in `.env` (the dev compose defaults `DB_USER`/`DB_PASSWORD` to `postgres` and `DEBUG` to `true`):

```bash
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
JWT_SECRET_KEY=your_random_secret_key
AI_KEY_ENCRYPTION_KEY=your_random_secret_key
ADMIN_USERNAME=YWRtaW4=              # base64("admin")
ADMIN_PASSWORD=your_base64_password

# Dev URLs (must match the /etc/hosts entries above)
FRONTEND_URL=http://testing.yourdomain.com
APP_URL=http://testing.yourdomain.com
VITE_API_URL=http://api.testing.yourdomain.com/api/v1
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

Then build and start:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Database migrations run automatically when the backend container starts (`alembic upgrade head` is part of the image's startup command) — no manual migration step.

Once up:

- App: `http://testing.yourdomain.com`
- API: `http://api.testing.yourdomain.com` (health check at `/health`)
- Traefik dashboard: `http://traefik.testing.yourdomain.com/dashboard/`
- PostgreSQL is exposed on host port **5433** and Redis on **6379** for debugging.

## Production Deployment

`docker-compose.prod.yml` runs the same 7-service stack as dev, with production hardening: Traefik terminates TLS on port 443 with automatic Let's Encrypt certificates (HTTP redirects to HTTPS), all hostnames come from environment variables instead of being hardcoded, security-headers middleware is attached to every router, the database and Redis ports are not exposed to the host, and paper storage is bind-mounted to `./backend/storage` so it lives on the server's disk.

### 1. Prepare Your Server

```bash
# SSH into your server
ssh user@your-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Clone repository
git clone <your-repo-url> /opt/papers
cd /opt/papers
```

### 2. Configure Environment

Create `.env` file in the Papers directory:

```bash
# API Keys
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
SEMANTIC_SCHOLAR_API_KEY=your_optional_api_key
SERPAPI_KEY=your_optional_api_key

# Auth
JWT_SECRET_KEY=your_very_long_random_secret_key
AI_KEY_ENCRYPTION_KEY=another_long_random_secret_key
ADMIN_USERNAME=YWRtaW4=        # base64("admin")
ADMIN_PASSWORD=your_base64_password

# Database (choose strong password)
DB_USER=papers_user
DB_PASSWORD=your_very_secure_password_here
DB_NAME=papers

# Let's Encrypt Email (for SSL certificate notifications)
LETSENCRYPT_EMAIL=your-email@yourdomain.com

# Your Domain Configuration
TRAEFIK_DOMAIN=traefik.yourdomain.com
BACKEND_DOMAIN=api.yourdomain.com
FRONTEND_DOMAIN=papers.yourdomain.com

# Frontend build args (VITE_API_URL is derived from BACKEND_DOMAIN automatically)
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

`FRONTEND_URL` and `APP_URL` are derived from `FRONTEND_DOMAIN` in the prod compose file, so you don't need to set them.

### 3. Configure DNS

Point your domain's DNS records to your server's IP:

```
traefik.yourdomain.com    A  your.server.ip.address
api.yourdomain.com        A  your.server.ip.address
papers.yourdomain.com     A  your.server.ip.address
```

### 4. Deploy

```bash
cd /opt/papers

# Create directories for persistent data
# (backend/storage is bind-mounted into the backend and workers;
#  letsencrypt stores the ACME certificates)
mkdir -p backend/storage letsencrypt

# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Verify it's running
curl https://api.yourdomain.com/health
curl https://papers.yourdomain.com
```

Database migrations run automatically when the backend container starts, so there is no manual migration step. Certificate provisioning can take a minute on first boot — check `docker compose -f docker-compose.prod.yml logs traefik` if HTTPS isn't up immediately.

## Contributing

This is a personal project. Feel free to fork and customize for your needs.
