#!/usr/bin/env bash
#
# Redeploy the VaNi backend AND worker on the Main VPS.
#
#     bash deploy/vani-main-vps/deploy-vani.sh
#
# Builds the image ON THE VPS and restarts both containers with the compose
# files already on the box. No registry, no docker login, no push.
#
# WHY BUILD HERE rather than pull. The running containers use
# vikuna/vani-backend:latest from Docker Hub, but NOTHING IN THIS REPO BUILDS
# THAT IMAGE — build-push.sh builds vikuna/prokey-backend, a different product.
# So the image was built and pushed by hand at some point, and the repo has no
# way to reproduce it. Building here, tagged the same, closes that gap: the
# tag resolves to a local image and compose uses it.
#
# NEVER run `docker compose pull` after this. That replaces the image you just
# built with the stale one on Docker Hub, silently undoing the deploy.
#
# The LLM endpoint is reachable only from this VPS, which is why research
# cannot be exercised on a laptop and this script exists.

set -euo pipefail

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n\n' "$*" >&2; exit 1; }

[ -f backend/Dockerfile ] || die "Run this from the root of a VaNiGTM checkout.
  The VPS had no checkout at all on 2026-09-16 — /opt/vikuna/docker/vani held
  only compose files. If that is still true:
    cd /opt && git clone https://github.com/kamalcharan/VaNiGTM.git
    cd VaNiGTM && bash deploy/vani-main-vps/deploy-vani.sh"

command -v docker >/dev/null || die "docker not found."

# ── 1. What is running, and from which compose files ────────────────────────
# The containers carry both answers as labels, so nothing is hardcoded: the
# compose files live outside this repo (/opt/vikuna/docker/vani) and the image
# tag must match whatever they declare.
say "Reading the running deployment"

docker inspect vani-backend >/dev/null 2>&1 \
  || die "No vani-backend container. This script redeploys an existing stack;
  for a first deploy follow RUNBOOK.md steps 0-7."

IMAGE=$(docker inspect vani-backend --format '{{.Config.Image}}')
COMPOSE_FILES=$(docker inspect vani-backend \
  --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')
COMPOSE_DIR=$(docker inspect vani-backend \
  --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')

[ -n "$IMAGE" ] && [ "$IMAGE" != "<no value>" ] || die "Could not read the image tag."
[ -n "$COMPOSE_FILES" ] && [ "$COMPOSE_FILES" != "<no value>" ] \
  || die "vani-backend was not started by compose — restart it by hand."

echo "  image          : $IMAGE"
echo "  compose files  : $COMPOSE_FILES"
echo "  compose dir    : $COMPOSE_DIR"

# The label is a comma-separated list; compose needs one -f per file.
FLAGS=()
IFS=',' read -ra FILES <<< "$COMPOSE_FILES"
for f in "${FILES[@]}"; do
  [ -f "$f" ] || die "Compose file listed by the container does not exist: $f"
  FLAGS+=(-f "$f")
done

# The worker must be in that list, or this deploy leaves it on old code — the
# failure that silently ate a queued event on 2026-09-16 (marked done 186ms
# after it was created, with zero gt_agent_runs rows).
grep -q 'worker' <<< "$COMPOSE_FILES" \
  || echo "  WARNING: no worker compose file listed — check the worker is covered."

BEFORE=$(docker inspect vani-backend --format '{{.Image}}')

# ── 2. Build, tagged exactly as compose expects ─────────────────────────────
say "Building $IMAGE from this checkout ($(git rev-parse --short HEAD 2>/dev/null || echo 'unknown'))"
docker build --platform linux/amd64 -f deploy/vani-main-vps/Dockerfile -t "$IMAGE" backend/

# ── 3. Recreate BOTH ────────────────────────────────────────────────────────
# --force-recreate because compose will otherwise leave a container running if
# it thinks nothing changed. Both services named explicitly: starting only the
# API is how the two end up on different code.
say "Recreating vani-backend and vani-worker"
( cd "$COMPOSE_DIR" && docker compose "${FLAGS[@]}" up -d --force-recreate vani-backend vani-worker )

# ── 4. Prove it ─────────────────────────────────────────────────────────────
say "Verifying"
API_IMG=$(docker inspect vani-backend --format '{{.Image}}')
WRK_IMG=$(docker inspect vani-worker  --format '{{.Image}}')
echo "  vani-backend : $API_IMG"
echo "  vani-worker  : $WRK_IMG"

[ "$API_IMG" = "$WRK_IMG" ] || die "API and worker are on DIFFERENT images.
  The worker is stale and will consume queued events without running them."
echo "  same image — they cannot be on different code"

[ "$API_IMG" != "$BEFORE" ] \
  || echo "  NOTE: image id unchanged from before the build — either nothing
  changed in backend/, or the checkout is not on the commit you expected."

docker ps --filter name=vani --format '  {{.Names}}\t{{.Status}}'

cat <<'DONE'

  vani-worker shows no health state, or 'unhealthy' — expected and harmless.
  The image's HEALTHCHECK wgets :3001/health and the worker binds no port. It
  has read 'unhealthy' since August for that reason alone; the fix is
  `healthcheck: disable: true` in the worker compose file on this box.

Next:
  docker logs --tail 30 vani-worker      # the poll loop
  Press "Research my industry" in the console, then:

    SELECT id, status, error_trace, jsonb_array_length(steps) AS steps
      FROM gt_agent_runs
     WHERE agent_name = 'DOMAIN_ENRICHMENT_REQUESTED'
     ORDER BY started_at DESC LIMIT 1;

  'awaiting' means it worked:
    docker exec vani-backend node dist/skills/domain-pack-skill/publish.js
DONE
