# Papers

A personal research paper management and reading platform with AI-powered features for organizing, annotating, and understanding academic literature.

## Features

### Paper Management
- **Multi-source Ingestion**: Upload PDFs directly or import from URLs (arXiv, ACM, IEEE, OpenReview, PMLR, NeurIPS, and more)
- **Batch Import**: Paste multiple URLs at once for bulk ingestion
- **Groups & Tags**: Organize papers into hierarchical collections with custom tags
- **Duplicate Detection**: Automatically detect and manage duplicate papers
- **Reading Status**: Track papers as unread, in-progress, or completed

### AI-Powered Features
- **Chat with Papers**: Ask questions about any paper with context-aware responses using Google Gemini
- **Threaded Conversations**: Create follow-up threads on AI responses for deeper exploration
- **Auto-generated Summaries**: Get concise AI summaries of papers upon ingestion
- **Key Findings Extraction**: Automatically extract main contributions and results
- **Reading Guides**: AI-generated guides to help navigate complex papers
- **Smart Highlights**: AI suggests important passages to highlight

### Reading & Annotation
- **PDF Reader**: Built-in PDF viewer with smooth navigation
- **Annotations**: Highlight text and add notes directly on papers
- **Citation Graph**: Visualize relationships between papers via extracted citations

### Search & Discovery
- **Full-text Search**: Search across all paper content
- **Semantic Search**: Find papers by meaning using vector embeddings
- **Paper Relationships**: Discover related papers through citations

### Export & Integration
- **Multiple Formats**: Export papers and annotations
- **Browser Extension**: Save papers directly from the web with one click

## Tech Stack

- **Backend**: Python 3.13+, FastAPI, SQLAlchemy, PostgreSQL (pgvector)
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **AI**: Google Gemini API
- **Infrastructure**: Docker, Traefik

## Prerequisites

- Python 3.13+
- Node.js 18+ or Bun
- PostgreSQL 16 with pgvector extension
- Google API Key (for AI features)

## Local Development Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd papers
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment and install dependencies
uv sync

# Copy environment file and configure
cp .env.example .env
# Edit .env with your GOOGLE_API_KEY and database credentials

# Run database migrations
uv run alembic upgrade head

# Start development server
uv run fastapi dev app/main.py
```

Backend runs at `http://localhost:8000`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
bun install
# or: npm install

# Copy environment file
cp .env.example .env
# Set VITE_API_URL=http://localhost:8000/api/v1

# Start development server
bun run dev
# or: npm run dev
```

Frontend runs at `http://localhost:5173`

### 4. Database Setup (if not using Docker)

```bash
# Create database
createdb nexus

# Enable pgvector extension
psql nexus -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

## Docker Setup (Local)

```bash
# Copy environment file
cp .env.example .env
# Add your GOOGLE_API_KEY

# Start all services
docker compose up -d

# Access the application
# Frontend: http://papers.localhost
# Backend API: http://api.localhost
# Traefik Dashboard: http://traefik.localhost/dashboard
```

## Production Deployment

### 1. Configure Domain

Edit `docker-compose.prod.yml` and replace `yourdomain.com` with your actual domain:

- `api.yourdomain.com` - Backend API
- `papers.yourdomain.com` - Frontend
- `traefik.yourdomain.com` - Traefik dashboard

### 2. Configure DNS

Point these subdomains to your server's IP address.

### 3. Set Environment Variables

```bash
export GOOGLE_API_KEY=your_api_key
```

### 4. Deploy

```bash
# Create data directories
mkdir -p data/storage letsencrypt

# Start production services
docker compose -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

SSL certificates are automatically provisioned via Let's Encrypt.

### 5. Database Migrations (Production)

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

## Browser Extension

See [extension/README.md](extension/README.md) for installation and usage instructions.

## API Documentation

When running, API docs are available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
