# Papers

A modern research paper management platform with AI-powered reading assistance, full-text search, and semantic discovery. Organize academic literature with intelligent tagging, threaded discussions, and automatic paper relationship discovery through citations.

## Features

### Paper Organization

- **Multi-source Ingestion**: Import papers directly from URLs (arXiv, ACM, IEEE, OpenReview, PMLR, NeurIPS, etc.) or upload PDFs
- **Hierarchical Groups**: Create nested collection structures to organize papers by topic, project, or custom taxonomy — scoped per user
- **Smart Tagging**: Apply custom tags to papers for flexible filtering and cross-cutting organization — scoped per user
- **Duplicate Detection**: Automatic detection and management of duplicate papers in your library
- **Reading Progress**: Track papers through states (unread, in-progress, read, archived) with reading time estimates

### AI-Powered Reading

- **Chat with Papers**: Ask context-aware questions about any paper and get detailed responses powered by Google Gemini
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

- **Full-text Search**: Search across all paper content, metadata, and annotations — scoped to your library
- **Semantic Search**: Find papers by meaning using vector embeddings (768-dimensional vectors)
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

- **Framework**: FastAPI (Python 3.13+) — modern, performant async web framework
- **Database**: PostgreSQL 16 with pgvector extension for vector embeddings
- **ORM**: SQLAlchemy 2.0 with async support for database operations
- **Task Queue**: Celery with Redis broker for background AI tasks and paper processing
- **Vector Search**: pgvector for semantic similarity search using embeddings
- **Auth**: JWT access tokens + httpOnly refresh token cookies; Google OAuth + local admin login
- **Caching**: Redis for session management and task status tracking

### Frontend

- **Framework**: React 19 with TypeScript for type-safe UI development
- **Build Tool**: Vite for fast development and optimized production builds
- **Styling**: TailwindCSS with a near-monochrome design system (forest-green undertones, mint accent)
- **Data Management**: TanStack Query (React Query) for efficient server state management
- **PDF Viewer**: Integrated PDF.js for in-browser PDF reading
- **Rich Editor**: TipTap for text editing with markdown support and math rendering
- **Theming**: Light and dark mode with adaptive logo and paper card color themes

### Infrastructure

- **Containerization**: Docker and Docker Compose for reproducible deployments
- **Reverse Proxy**: Traefik v2 for routing, SSL termination, and load balancing
- **SSL/TLS**: Automatic Let's Encrypt certificate provisioning and renewal
- **Development**: Includes local Traefik setup for localhost domain routing

## External Dependencies

Papers relies on several third-party services and libraries that need to be configured.

### AI Model Provider

**Google Gemini API** (required for AI features)

- Used for: Paper summaries, key findings extraction, reading guides, smart highlights, threaded conversations
- Configuration: Set `GOOGLE_API_KEY` environment variable
- Get your key: <https://ai.google.dev/>
- Cost: Free tier available with usage limits; pay-as-you-go for higher volumes
- Models used: `gemini-3-flash-preview` for generation, `gemini-embedding-001` for embeddings

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

- **SerpAPI**: General-purpose web search for paper discovery
  - Configuration: Set `SERPAPI_KEY` (optional)
  - Cost: Free tier with limited queries; paid plans available

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
   - Google API Key: <https://ai.google.dev/> (required for AI features)
   - Google Client ID: <https://console.cloud.google.com/> (required for Google sign-in)
   - Optional: Semantic Scholar API, SerpAPI

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

**Backend:**

```bash
cd backend
uv sync                           # Install dependencies
export GOOGLE_API_KEY=your_key
export GOOGLE_CLIENT_ID=your_client_id
export JWT_SECRET_KEY=$(openssl rand -hex 32)
export AI_KEY_ENCRYPTION_KEY=$(openssl rand -hex 32)   # encrypts user-provided AI keys
export ADMIN_USERNAME=$(echo -n "admin" | base64)
export ADMIN_PASSWORD=$(echo -n "yourpassword" | base64)
export DB_HOST=localhost
export DB_PORT=5433               # 5432 if running PostgreSQL natively
export DB_NAME=papers
export FRONTEND_URL=http://localhost:5173
export DEBUG=true
uv run alembic upgrade head      # Run migrations
uv run fastapi dev app/main.py   # Start dev server (localhost:8000)
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

```bash
cd backend
uv run celery -A app.celery_app worker -l info -Q ai,processing,discovery,dead_letter

# Optional: beat scheduler for periodic retry sweeps
uv run celery -A app.celery_app beat -l info
```

### Docker Dev

`docker-compose.dev.yml` runs the full 7-service stack (Traefik, PostgreSQL, Redis, backend, 2 Celery workers, Celery beat, frontend) behind Traefik on port 80, HTTP only. The hostnames are **hardcoded** to `*.testing.maurc.org`, so point them at localhost first:

```bash
# Add the dev hostnames to /etc/hosts
echo "127.0.0.1 testing.maurc.org api.testing.maurc.org traefik.testing.maurc.org" | sudo tee -a /etc/hosts
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
FRONTEND_URL=http://testing.maurc.org
APP_URL=http://testing.maurc.org
VITE_API_URL=http://api.testing.maurc.org/api/v1
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

Then build and start:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Database migrations run automatically when the backend container starts (`alembic upgrade head` is part of the image's startup command) — no manual migration step.

Once up:

- App: <http://testing.maurc.org>
- API: <http://api.testing.maurc.org> (health check at `/health`)
- Traefik dashboard: <http://traefik.testing.maurc.org/dashboard/>
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
