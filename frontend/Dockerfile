# ============================================================
# ProKey — Frontend Dockerfile
# Next.js 16 UI server (port 3000)
#
# Build:  docker build -t vikuna/prokey-frontend:latest .
# Run:    docker run -p 3000:3000 vikuna/prokey-frontend:latest
#
# IMPORTANT: Do NOT set NEXT_PUBLIC_API_URL at build time.
# Browser code falls back to window.location.origin, which nginx
# routes correctly to the backend. SSR data fetching is client-side only.
#
# Note: Not run directly in production — use deploy/docker-compose.yml
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY next.config.js ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

# Strip U+2500 box-drawing characters (─) from source comments before building.
# Next.js 16.2.1 Turbopack panics (highlight.rs:1011) on these multi-byte UTF-8 chars.
# They exist only in comments — compiled .next/ output is identical.
# Using Node.js (not sed) because BusyBox sed on Alpine has no \x hex escape support.
RUN node -e "\
const fs=require('fs'),pt=require('path');\
function w(d){fs.readdirSync(d,{withFileTypes:true}).forEach(e=>{\
  const f=pt.join(d,e.name);\
  if(e.isDirectory())w(f);\
  else if(/\.(ts|tsx)$/.test(e.name)){\
    const c=fs.readFileSync(f,'utf8'),r=c.replace(/\u2500/g,'-');\
    if(r!==c)fs.writeFileSync(f,r,'utf8');\
  }\
})}\
w('src');console.log('U+2500 stripped from src/');\
"

# Memory cap during Next.js build (SSG/SSR compilation is memory-intensive)
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN npm run build

# ── Stage 2: Production image ────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Production dependencies only (includes `next` for `next start`)
COPY package*.json ./
RUN npm install --omit=dev

# Compiled Next.js output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

# Health check — Next.js root page
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# next start uses the PORT env var; default is 3000
CMD ["./node_modules/.bin/next", "start", "--port", "3000"]
