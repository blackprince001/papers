FROM python:3.13.3-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install the application dependencies using uv
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

# Create storage directory
RUN mkdir -p storage/papers

# Expose port (default 8000, configurable via env)
EXPOSE 8000

# Run migrations and start the application
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]