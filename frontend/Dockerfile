FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the application
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL:-http://api.localhost/api/v1}
RUN bun run build

# Expose port 4173 (Vite preview default)
EXPOSE 4173

# Serve the built application using Vite preview
CMD ["bun", "run", "preview"]










