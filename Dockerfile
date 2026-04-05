# ============================================================
# ProKey — Production Dockerfile
# Single container: Express API + Next.js frontend
#
# Build:  docker build -t prokey .
# Run:    docker run -p 3000:3000 --env-file .env prokey
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install all workspace deps
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN npm install --workspace=backend --workspace=frontend 2>/dev/null || \
    (cd backend && npm install) && (cd frontend && npm install)

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY tsconfig.json ./

# Build backend (TypeScript → dist/)
RUN cd backend && npm run build

# Build frontend (Next.js production build)
# Memory cap during build — SSG/SSR compilation is memory-intensive
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN cd frontend && npm run build

# ── Stage 2: Production image ────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Production heap: 2GB cap — enough for Express + Next.js SSR under normal load.
# Raise to 3072 if you see OOM in production under high concurrent SSR load.
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Copy compiled backend
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/migrations ./backend/migrations
COPY --from=builder /app/backend/package*.json ./backend/

# Copy compiled frontend (Next.js standalone or .next + public)
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/package*.json ./frontend/

# Install only production dependencies
RUN cd backend && npm install --omit=dev && \
    cd ../frontend && npm install --omit=dev

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Single entry point: Express wraps Next.js
CMD ["node", "backend/dist/server.js"]
