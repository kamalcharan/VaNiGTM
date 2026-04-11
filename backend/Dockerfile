# ============================================================
# ProKey — Backend Dockerfile
# Express API server only (port 3001)
#
# Build:  docker build -t vikuna/prokey-backend:latest .
# Run:    docker run -p 3001:3001 --env-file .env vikuna/prokey-backend:latest
#
# Note: Not run directly in production — use deploy/docker-compose.yml
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript → dist/
RUN npm run build

# Copy static assets alongside compiled JS (tsc only emits .js):
#   - SKILL.md files: needed by skill-registry to discover and parse skills
#   - .sql files: needed by readFileSync calls in route/skill handlers
RUN find src \( -name "SKILL.md" -o -name "*.sql" \) | while read f; do \
      d="dist/${f#src/}"; \
      mkdir -p "$(dirname "$d")"; \
      cp "$f" "$d"; \
    done

# ── Stage 2: Production image ────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Compiled server
COPY --from=builder /app/dist ./dist

# Migration SQL files (migrate.ts resolves to ../migrations from dist/)
COPY migrations/ ./migrations/

EXPOSE 3001

# Health check — /health is mounted in server.ts (no /api/v1 prefix)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
