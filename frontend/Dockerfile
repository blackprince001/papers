# Build stage
FROM oven/bun:latest AS build

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

# Serve stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Ensure .mjs files are mapped to application/javascript MIME type
# Step 1: Use the provided script
COPY add-mjs-mime.sh /tmp/add-mjs-mime.sh
RUN chmod +x /tmp/add-mjs-mime.sh && /tmp/add-mjs-mime.sh

# Step 2: Additional fix using sed - add mjs to existing application/javascript line
# This handles cases where the script might not have worked
RUN if ! grep -qE "application/javascript.*mjs" /etc/nginx/mime.types; then \
    sed -i.bak 's|\(application/javascript[[:space:]]*\)js;|\1js mjs;|' /etc/nginx/mime.types || \
    awk '/application\/javascript.*js;/ && !/mjs/ { sub(/js;/, "js mjs;") } 1' /etc/nginx/mime.types > /tmp/mime.types.new && \
    mv /tmp/mime.types.new /etc/nginx/mime.types; \
    fi

# Step 3: Final verification
RUN if grep -qE "application/javascript.*mjs" /etc/nginx/mime.types; then \
    echo "✓ mjs extension successfully configured in mime.types"; \
    else \
    echo "⚠ WARNING: Could not verify mjs configuration"; \
    echo "Current application/javascript entries:"; \
    grep "application/javascript" /etc/nginx/mime.types | head -2 || true; \
    fi

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]










