# ============================================================
# VaNi AI — Backend Dockerfile (Main VPS deployment)
#
# Near-identical to ../../backend/Dockerfile (ProKey's per-customer
# Dockerfile) — same multi-stage build, same SKILL.md/*.sql copy step
# (assessment-skill's queries/*.sql and every skill's SKILL.md are loaded
# via readFileSync at runtime, not bundled by tsc — this step is not
# optional). Not the same FILE because ProKey's Dockerfile is shared,
# reviewed infra for a different product/deployment model (per-customer,
# pulled from Docker Hub as vikuna/prokey-backend) — editing it for the
# Main VPS's tighter shared-8GB memory budget is out of scope here ("not
# our risk"). This copy exists ONLY to set a smaller NODE_OPTIONS default;
# if ../../backend/Dockerfile's build steps ever change, mirror the change
# here too — known, accepted duplication, not an oversight.
#
# Build:  docker build -f deploy/vani-main-vps/Dockerfile -t vani-backend:latest backend/
# Run:    see docker-compose.vani.yml in this directory — not run directly.
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
# Main VPS budget (Agent Topology v1.1 §6.1): VaNiGTM backend ~400MB total,
# alongside vikuna-postgres/-postgrest/-nginx and kd-pipeline-api2 on 8GB
# with zero swap. 320MB heap ceiling leaves ~130MB for stack/native
# buffers/V8 metadata under the compose service's 450m hard mem_limit
# (docker-compose.vani.yml) — tune both together, never one alone.
ENV NODE_OPTIONS="--max-old-space-size=320"

# Production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Compiled server (includes migrate.ts, seed-definition.ts,
# verify-assessment-flow.ts — all plain compiled JS, runnable via `node
# dist/<path>.js` with no tsx/dev-dependency needed at runtime; see
# RUNBOOK.md for the exact commands)
COPY --from=builder /app/dist ./dist

# Migration SQL files + ai-recovery-assessment-v1.json (migrate.ts and
# seed-definition.ts both resolve paths relative to this directory)
COPY migrations/ ./migrations/

EXPOSE 3001

# Health check — /health is mounted in server.ts (no /api/v1 prefix)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
