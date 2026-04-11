#!/bin/bash

# ============================================================
# ProKey — Build & Push Docker Images
# Developer script — run this to publish a new release.
#
# Usage:
#   ./build-push.sh           → builds and pushes 'latest'
#   ./build-push.sh 1.2.0     → builds and pushes '1.2.0' + 'latest'
#
# Prerequisites:
#   docker login              → must be logged into vikuna Docker Hub account
# ============================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

REGISTRY="vikuna"
BACKEND_IMAGE="${REGISTRY}/prokey-backend"
FRONTEND_IMAGE="${REGISTRY}/prokey-frontend"
TAG="${1:-latest}"

echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}  ProKey — Build & Push${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""
echo "Registry: Docker Hub / ${REGISTRY}"
echo "Tag:      ${TAG}"
echo ""
echo "Images to build and push:"
echo "   - ${BACKEND_IMAGE}:${TAG}"
echo "   - ${FRONTEND_IMAGE}:${TAG}"
if [ "$TAG" != "latest" ]; then
echo "   - ${BACKEND_IMAGE}:latest  (also tagged)"
echo "   - ${FRONTEND_IMAGE}:latest (also tagged)"
fi
echo ""

read -p "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi
echo ""

# ── Verify Docker login ───────────────────────────────────
if ! docker info 2>/dev/null | grep -q "Username"; then
    echo -e "${YELLOW}[!] You may not be logged into Docker Hub.${NC}"
    echo "    Run: docker login"
    echo ""
fi

# ── Build Backend ─────────────────────────────────────────
echo -e "${BLUE}Building Backend${NC}"
echo "-------------------------------------------"
echo "   Context: backend/"
echo "   Image:   ${BACKEND_IMAGE}:${TAG}"
echo ""

docker build \
    --platform linux/amd64 \
    -t "${BACKEND_IMAGE}:${TAG}" \
    -f backend/Dockerfile \
    backend/

echo -e "${GREEN}[OK] Backend built${NC}"
echo ""

# ── Build Frontend ────────────────────────────────────────
echo -e "${BLUE}Building Frontend${NC}"
echo "-------------------------------------------"
echo "   Context: frontend/"
echo "   Image:   ${FRONTEND_IMAGE}:${TAG}"
echo ""

docker build \
    --platform linux/amd64 \
    -t "${FRONTEND_IMAGE}:${TAG}" \
    -f frontend/Dockerfile \
    frontend/

echo -e "${GREEN}[OK] Frontend built${NC}"
echo ""

# ── Tag as latest (if versioned build) ───────────────────
if [ "$TAG" != "latest" ]; then
    echo -e "${BLUE}Tagging as latest${NC}"
    echo "-------------------------------------------"
    docker tag "${BACKEND_IMAGE}:${TAG}" "${BACKEND_IMAGE}:latest"
    docker tag "${FRONTEND_IMAGE}:${TAG}" "${FRONTEND_IMAGE}:latest"
    echo -e "${GREEN}[OK] Tagged as latest${NC}"
    echo ""
fi

# ── Push to Docker Hub ────────────────────────────────────
echo -e "${BLUE}Pushing to Docker Hub${NC}"
echo "-------------------------------------------"

docker push "${BACKEND_IMAGE}:${TAG}"
echo -e "${GREEN}[OK] Backend pushed: ${BACKEND_IMAGE}:${TAG}${NC}"

docker push "${FRONTEND_IMAGE}:${TAG}"
echo -e "${GREEN}[OK] Frontend pushed: ${FRONTEND_IMAGE}:${TAG}${NC}"

if [ "$TAG" != "latest" ]; then
    docker push "${BACKEND_IMAGE}:latest"
    echo -e "${GREEN}[OK] Backend pushed: ${BACKEND_IMAGE}:latest${NC}"

    docker push "${FRONTEND_IMAGE}:latest"
    echo -e "${GREEN}[OK] Frontend pushed: ${FRONTEND_IMAGE}:latest${NC}"
fi

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  [OK] Build & Push Complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Customers can now pull the update by running: ./update.sh"
echo ""
