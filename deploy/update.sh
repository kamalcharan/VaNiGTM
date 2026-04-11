#!/bin/bash

# ============================================================
# ProKey — Docker Update Script
# Pulls latest images and restarts containers.
# NO database changes are made.
# ============================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

COMPOSE_CMD="docker compose"
if ! docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}  ProKey — Docker Update${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""
echo "This will:"
echo "   - Pull latest Docker images"
echo "   - Restart containers"
echo ""
echo -e "${YELLOW}NO database changes will be made.${NC}"
echo ""

# ── Load Environment ──────────────────────────────────────
if [ ! -f ".env" ]; then
    echo -e "${RED}[X] ERROR: .env file not found!${NC}"
    echo "    Run ./configure.sh first."
    exit 1
fi

# Fix Windows line endings
sed -i 's/\r$//' .env 2>/dev/null || sed -i '' 's/\r$//' .env 2>/dev/null || true

set -a
source .env
set +a

echo "Configuration:"
echo "   Instance:  ${INSTANCE_NAME}"
echo "   Registry:  vikuna"
echo "   Tag:       ${IMAGE_TAG}"
echo "   App port:  ${APP_PORT:-80}"
echo ""

read -p "Continue with update? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Update cancelled."
    exit 0
fi
echo ""

# ── Pull Latest Images ────────────────────────────────────
echo -e "${BLUE}Pulling Latest Images${NC}"
echo "-------------------------------------------"
echo "   - vikuna/prokey-backend:${IMAGE_TAG}"
echo "   - vikuna/prokey-frontend:${IMAGE_TAG}"
echo "   - nginx:alpine"
echo ""

if ! $COMPOSE_CMD -f docker-compose.yml pull; then
    echo -e "${RED}[X] Failed to pull Docker images.${NC}"
    echo "    Check your internet connection and Docker Hub access."
    exit 1
fi

echo -e "${GREEN}[OK] Images pulled successfully${NC}"
echo ""

# ── Stop Containers ───────────────────────────────────────
echo -e "${BLUE}Stopping Services${NC}"
echo "-------------------------------------------"

$COMPOSE_CMD -f docker-compose.yml down --remove-orphans 2>/dev/null || true

# Force remove any stuck containers
for suffix in "_backend" "_frontend" "_nginx"; do
    container="${INSTANCE_NAME}${suffix}"
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "   Removing stuck container: ${container}"
        docker rm -f "$container" 2>/dev/null || true
    fi
done

echo -e "${GREEN}[OK] Cleanup complete${NC}"
echo ""

# ── Start Services ────────────────────────────────────────
echo -e "${BLUE}Starting Services${NC}"
echo "-------------------------------------------"

$COMPOSE_CMD -f docker-compose.yml up -d

echo ""
echo "Waiting for services to start..."
sleep 5

# ── Health Checks ─────────────────────────────────────────

# Backend (direct check, port 3001 is internal — check via nginx on APP_PORT)
MAX_RETRIES=20
RETRY_COUNT=0
APP_PORT="${APP_PORT:-80}"

echo "Checking backend health..."
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf "http://localhost:${APP_PORT}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK] Backend is healthy${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 3
done

if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo -e "${YELLOW}[!] Backend health check timed out — it may still be starting.${NC}"
    echo "    Check logs: docker logs ${INSTANCE_NAME}_backend"
fi

# Frontend
echo "Checking frontend..."
sleep 5
if curl -sf "http://localhost:${APP_PORT}/" > /dev/null 2>&1; then
    echo -e "${GREEN}[OK] Frontend is ready${NC}"
else
    echo -e "${YELLOW}[!] Frontend may still be starting (Next.js cold start can take 30-60s).${NC}"
    echo "    Check logs: docker logs ${INSTANCE_NAME}_frontend"
fi

echo ""

# ── Complete ──────────────────────────────────────────────
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  [OK] Update Complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Access:"
echo "   App:    http://localhost:${APP_PORT}"
echo "   Health: http://localhost:${APP_PORT}/health"
echo ""
echo "Container Status:"
$COMPOSE_CMD -f docker-compose.yml ps
echo ""
echo -e "${YELLOW}Note: No database changes were made.${NC}"
echo -e "${YELLOW}To run migrations: ./migrate.sh${NC}"
echo ""
