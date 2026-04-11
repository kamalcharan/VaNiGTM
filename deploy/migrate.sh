#!/bin/bash

# ============================================================
# ProKey — Database Migration Script
# Runs pending KI_ migrations against the remote VPS database.
#
# IMPORTANT:
#   - Migrations are NEVER run automatically on startup.
#   - Run this manually after each update that includes migrations.
#   - Always check status first: ./migrate.sh --status
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
echo -e "${CYAN}  ProKey — Database Migrations${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

# ── Load Environment ──────────────────────────────────────
if [ ! -f ".env" ]; then
    echo -e "${RED}[X] ERROR: .env file not found!${NC}"
    echo "    Run ./configure.sh first."
    exit 1
fi

sed -i 's/\r$//' .env 2>/dev/null || sed -i '' 's/\r$//' .env 2>/dev/null || true

set -a
source .env
set +a

# ── Check backend container is running ────────────────────
BACKEND_CONTAINER="${INSTANCE_NAME}_backend"

if ! docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
    echo -e "${RED}[X] Backend container '${BACKEND_CONTAINER}' is not running.${NC}"
    echo "    Start it first: ./update.sh"
    exit 1
fi

echo -e "${GREEN}[OK] Backend container found: ${BACKEND_CONTAINER}${NC}"
echo ""

# ── Status or Apply ───────────────────────────────────────
if [ "${1}" == "--status" ]; then
    echo -e "${BLUE}Migration Status${NC}"
    echo "-------------------------------------------"
    docker exec "$BACKEND_CONTAINER" node dist/migrate.js --status
    exit 0
fi

echo "This will apply pending KI_ database migrations."
echo ""
echo -e "${YELLOW}WARNING: Migrations are permanent and cannot be rolled back automatically.${NC}"
echo -e "${YELLOW}Ensure you have a database backup before proceeding in production.${NC}"
echo ""

read -p "Apply pending migrations? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}Running Migrations${NC}"
echo "-------------------------------------------"

docker exec "$BACKEND_CONTAINER" node dist/migrate.js

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  [OK] Migrations complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "To check current status: ./migrate.sh --status"
echo ""
