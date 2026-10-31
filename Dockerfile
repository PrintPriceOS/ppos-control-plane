# Dockerfile for PrintPrice OS Control Plane
# Multi-stage production build (Node.js 22 LTS)
# Certified for Staging & Production Container Deployments

# Stage 1: Build Frontend Assets
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy full source tree and compile Vite frontend
COPY . .
RUN npm run build

# Stage 2: Runtime Image
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Set production runtime environment
ENV NODE_ENV=staging
ENV PORT=8081

# Install only production runtime dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application backend source and built frontend distribution
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/ecosystem.config.js ./ecosystem.config.js

# Ensure non-root user execution
RUN useradd -m -u 1001 pposuser && \
    mkdir -p /opt/printprice-os/staging-storage /app/logs && \
    chown -R pposuser:pposuser /app /opt/printprice-os/staging-storage

USER pposuser

EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://127.0.0.1:8081/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

CMD ["node", "server.js"]
