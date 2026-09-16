#!/usr/bin/env bash
#
# Deploy the VaNi backend AND worker to the Main VPS.
#
# Discovers the existing compose file and the shared network from Docker
# itself, so nothing has to be substituted by hand. Run it from the root of
# a VaNiGTM checkout on the VPS:
#
#     bash deploy/vani-main-vps/deploy-vani.sh
#
# It refuses rather than guesses. Every value it cannot discover is an error
# with the command to find it yourself — a deploy that silently picks the
# wrong network is worse than one that stops.

set -euo pipefail

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mSTOP: %s\033[0m\n\n' "$*" >&2; exit 1; }

[ -f deploy/vani-main-vps/docker-compose.vani.yml ] \
  || die "Run this from the root of the VaNiGTM checkout (deploy/vani-main-vps/ not found here)."

# ── 1. Discover the existing compose project ────────────────────────────────
# Any running container started by the Main VPS's own compose file carries the
# path in a label. vani-* containers are excluded: they come from OUR overlay,
# so using their label would point back at this file instead of the base one.
say "Finding the existing compose file"

EXISTING_COMPOSE=""
for c in $(docker ps --format '{{.Names}}' | grep -v '^vani-' || true); do
  f=$(docker inspect "$c" \
        --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null || true)
  # The label can list several files separated by ',' — take the first.
  f="${f%%,*}"
  if [ -n "$f" ] && [ "$f" != "<no value>" ] && [ -f "$f" ]; then
    EXISTING_COMPOSE="$f"
    echo "  from container '$c': $f"
    break
  fi
done

[ -n "$EXISTING_COMPOSE" ] || die "Could not find the existing compose file.
  Look yourself with:
    docker ps --format '{{.Names}}'
    docker inspect <a-container> --format '{{index .Config.Labels \"com.docker.compose.project.config_files\"}}'
  then re-run with:  EXISTING_COMPOSE=/path/to/it bash \$0"

# ── 2. Discover the shared network ──────────────────────────────────────────
# docker-compose.vani.yml joins an EXTERNAL network; its default is the
# literal REPLACE_WITH_EXISTING_NETWORK_NAME, which fails loudly by design.
say "Finding the shared network"

NET=""
for c in $(docker ps --format '{{.Names}}' | grep -v '^vani-' || true); do
  n=$(docker inspect "$c" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' 2>/dev/null \
      | grep -v '^bridge$' | grep -v '^host$' | grep -v '^none$' | head -1 || true)
  if [ -n "$n" ]; then NET="$n"; echo "  from container '$c': $n"; break; fi
done

[ -n "$NET" ] || die "Could not find a shared docker network.
  Look yourself with:
    docker network ls
    docker inspect <a-container> --format '{{json .NetworkSettings.Networks}}'
  then re-run with:  NETWORK_NAME=<name> bash \$0"

# ── 3. Record it where compose reads it ─────────────────────────────────────
# Interpolation reads .env from the directory compose runs in, which is why
# everything below happens inside deploy/vani-main-vps.
ENVF="deploy/vani-main-vps/.env"
[ -f "$ENVF" ] || die "$ENVF does not exist. Copy deploy/vani-main-vps/.env.example to it and fill in
  DB_PRIMARY, JWT_SECRET, LLM_PRIMARY_URL, TENANT_SECRET_KEY, CORS_ORIGIN, etc. first."

if grep -q '^NETWORK_NAME=' "$ENVF"; then
  sed -i "s|^NETWORK_NAME=.*|NETWORK_NAME=$NET|" "$ENVF"
else
  printf '\nNETWORK_NAME=%s\n' "$NET" >> "$ENVF"
fi
echo "  NETWORK_NAME=$NET written to $ENVF"

# ── 4. Build ────────────────────────────────────────────────────────────────
# ONE image serves both containers: the API runs dist/server.js, the worker
# runs dist/agent-core/worker.js. Building once is what stops them drifting
# onto different commits — which silently destroyed a queued event on
# 2026-09-16 (done in 186ms, no agent ran).
say "Building vani-backend:latest"
docker build -f deploy/vani-main-vps/Dockerfile -t vani-backend:latest backend/

# ── 5. Start BOTH ───────────────────────────────────────────────────────────
say "Starting vani-backend and vani-worker"
cd deploy/vani-main-vps
docker compose -f "$EXISTING_COMPOSE" -f docker-compose.vani.yml up -d vani-backend vani-worker
cd - >/dev/null

# ── 6. Prove they are on the same image ─────────────────────────────────────
say "Verifying"
API_IMG=$(docker inspect vani-backend --format '{{.Image}}')
WRK_IMG=$(docker inspect vani-worker  --format '{{.Image}}')
echo "  vani-backend image: $API_IMG"
echo "  vani-worker  image: $WRK_IMG"

[ "$API_IMG" = "$WRK_IMG" ] \
  || die "API and worker are on DIFFERENT images. The worker is stale and will
  consume queued events without running them. Re-run this script."

echo "  same image — API and worker cannot be on different code"
docker ps --filter name=vani --format '  {{.Names}}\t{{.Status}}'

say "Worker log (last 20 lines)"
docker logs --tail 20 vani-worker 2>&1 || true

cat <<'DONE'

Next:
  1. Press "Research my industry" in the console.
  2. Then, against the database:

     SELECT id, status, started_at, completed_at,
            jsonb_array_length(steps) AS steps
       FROM gt_agent_runs
      WHERE agent_name = 'DOMAIN_ENRICHMENT_REQUESTED'
      ORDER BY started_at DESC LIMIT 1;

     A row should appear within seconds at 'running'. If it reaches
     'awaiting', the draft is ready to review:

       docker exec vani-backend node dist/skills/domain-pack-skill/publish.js
       docker exec vani-backend node dist/skills/domain-pack-skill/publish.js --show <runId>
DONE
