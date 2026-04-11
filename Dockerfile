# ============================================================
# ProKey — Dockerfiles have moved to per-service locations:
#
#   backend/Dockerfile   — Express API (vikuna/prokey-backend)
#   frontend/Dockerfile  — Next.js UI  (vikuna/prokey-frontend)
#
# To build and push both images:
#   ./build-push.sh             → tag: latest
#   ./build-push.sh 1.2.0       → tag: 1.2.0 + latest
#
# To deploy at a customer location:
#   cd deploy/
#   ./configure.sh              → first-time setup
#   ./update.sh                 → pull images + restart
#   ./migrate.sh                → apply pending DB migrations
# ============================================================
