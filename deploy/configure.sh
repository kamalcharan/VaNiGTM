#!/bin/bash

# ============================================================
# ProKey — First-Time Configuration
# Sets up .env from template with your specific values.
# Run this ONCE on a fresh installation.
# ============================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}  ProKey — First-Time Configuration${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

# ── Prerequisites ─────────────────────────────────────────
check_prereqs() {
    local missing=0

    if ! command -v docker &>/dev/null; then
        echo -e "${RED}[X] Docker is not installed.${NC}"
        echo "    Install from: https://docs.docker.com/get-docker/"
        missing=1
    else
        echo -e "${GREEN}[OK] Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"
    fi

    if ! docker compose version &>/dev/null 2>&1 && ! command -v docker-compose &>/dev/null; then
        echo -e "${RED}[X] Docker Compose is not installed.${NC}"
        echo "    Install from: https://docs.docker.com/compose/install/"
        missing=1
    else
        echo -e "${GREEN}[OK] Docker Compose available${NC}"
    fi

    if [ $missing -ne 0 ]; then
        echo ""
        echo -e "${RED}Install the missing prerequisites and re-run this script.${NC}"
        exit 1
    fi
}

check_prereqs
echo ""

# ── Check for existing .env ───────────────────────────────
if [ -f ".env" ]; then
    echo -e "${YELLOW}[!] A .env file already exists.${NC}"
    read -p "    Overwrite it? (yes/no): " OVERWRITE
    if [ "$OVERWRITE" != "yes" ]; then
        echo "Configuration cancelled. Your existing .env was not changed."
        exit 0
    fi
    echo ""
fi

# ── Fix Windows line endings in template ──────────────────
sed -i 's/\r$//' .env.example 2>/dev/null || sed -i '' 's/\r$//' .env.example 2>/dev/null || true
cp .env.example .env

echo -e "${BLUE}Configuring your ProKey instance${NC}"
echo "Press Enter to accept the default shown in [brackets]."
echo ""

# ── INSTANCE_NAME ─────────────────────────────────────────
echo -e "${CYAN}Instance Name${NC}"
echo "  Unique identifier for this deployment (e.g. prokey-demo, prokey-acme-mfd)"
echo "  Used as the Docker container name prefix."
read -p "  Instance name [prokey-demo]: " INPUT_INSTANCE
INSTANCE_NAME="${INPUT_INSTANCE:-prokey-demo}"
# Sanitise: lowercase, replace spaces with hyphens
INSTANCE_NAME=$(echo "$INSTANCE_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
echo ""

# ── APP_PORT ──────────────────────────────────────────────
echo -e "${CYAN}App Port${NC}"
echo "  Port the application will be accessible on (default: 80)."
echo "  Change if port 80 is already in use on this machine."
read -p "  App port [80]: " INPUT_PORT
APP_PORT="${INPUT_PORT:-80}"
echo ""

# ── IMAGE_TAG ─────────────────────────────────────────────
echo -e "${CYAN}Image Tag${NC}"
echo "  Docker image version to pull (default: latest)."
read -p "  Image tag [latest]: " INPUT_TAG
IMAGE_TAG="${INPUT_TAG:-latest}"
echo ""

# ── DB_PRIMARY ────────────────────────────────────────────
echo -e "${CYAN}Database Connection${NC}"
echo "  Full PostgreSQL connection string to your VPS database."
echo "  Format: postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE"
read -p "  DB_PRIMARY: " INPUT_DB
while [ -z "$INPUT_DB" ]; do
    echo -e "  ${RED}Database connection string is required.${NC}"
    read -p "  DB_PRIMARY: " INPUT_DB
done
DB_PRIMARY="$INPUT_DB"
echo ""

# ── DB_PRIMARY_SSL ────────────────────────────────────────
echo -e "${CYAN}Database SSL${NC}"
echo "  Use SSL for database connection? Required for remote VPS. (default: true)"
read -p "  DB_PRIMARY_SSL [true]: " INPUT_SSL
DB_PRIMARY_SSL="${INPUT_SSL:-true}"
echo ""

# ── JWT Secrets ───────────────────────────────────────────
echo -e "${CYAN}Auth Secrets${NC}"
echo "  JWT signing secrets. Must match the values used when your tenant data was created."
echo "  Leave blank to auto-generate new ones (only safe for a FRESH database)."
echo ""
read -p "  JWT_SECRET (or press Enter to auto-generate): " INPUT_JWT
read -p "  JWT_REFRESH_SECRET (or press Enter to auto-generate): " INPUT_REFRESH

if [ -z "$INPUT_JWT" ]; then
    if command -v openssl &>/dev/null; then
        INPUT_JWT=$(openssl rand -hex 32)
        echo -e "  ${YELLOW}Auto-generated JWT_SECRET. Save this value — you will need it if you redeploy.${NC}"
    else
        INPUT_JWT=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 64)
        echo -e "  ${YELLOW}Auto-generated JWT_SECRET (openssl not found, used /dev/urandom).${NC}"
    fi
fi

if [ -z "$INPUT_REFRESH" ]; then
    if command -v openssl &>/dev/null; then
        INPUT_REFRESH=$(openssl rand -hex 32)
        echo -e "  ${YELLOW}Auto-generated JWT_REFRESH_SECRET.${NC}"
    else
        INPUT_REFRESH=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 64)
    fi
fi
echo ""

# ── Write .env ────────────────────────────────────────────
cat > .env <<EOF
# ============================================================
# ProKey — Environment Configuration
# Generated by configure.sh on $(date '+%Y-%m-%d %H:%M:%S')
# NEVER commit this file to version control.
# ============================================================

# Instance
INSTANCE_NAME=${INSTANCE_NAME}
IMAGE_TAG=${IMAGE_TAG}
APP_PORT=${APP_PORT}

# Database (Remote VPS)
DB_PRIMARY=${DB_PRIMARY}
DB_PRIMARY_SSL=${DB_PRIMARY_SSL}

# Auth Secrets
JWT_SECRET=${INPUT_JWT}
JWT_REFRESH_SECRET=${INPUT_REFRESH}

# App
NODE_ENV=production
PORT=3001
EOF

echo -e "${GREEN}[OK] .env written${NC}"
echo ""

# ── Summary ───────────────────────────────────────────────
echo -e "${BLUE}Configuration Summary${NC}"
echo "   Instance:  ${INSTANCE_NAME}"
echo "   App port:  ${APP_PORT}"
echo "   Image tag: ${IMAGE_TAG}"
echo "   Database:  $(echo "$DB_PRIMARY" | sed 's|//.*@|//***@|')"
echo "   SSL:       ${DB_PRIMARY_SSL}"
echo ""

echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Configuration complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Next steps:"
echo "   1. Pull images and start the app: ./update.sh"
echo "   2. Open in browser:               http://localhost:${APP_PORT}"
echo ""
