# CLAUDE.md — ProessionalKey

## What is this repo?
ProessionalKey (formerly KI-Prime) — Multi-tenant SaaS financial planning platform
for Mutual Fund Distributors (MFDs) in India.

## Architecture
- **kewalinvest/** is a git submodule (kamalcharan/kewalinvest). READ-ONLY reference
  for business logic patterns (XIRR, MFAPI, InvestWell parser). DO NOT modify.
- **backend/** — Node.js + Express + TypeScript API with Skills-based architecture
- **frontend/** — React + TypeScript UI (Create React App or Vite)
- **No VaNi framework.** This is a standard backend/frontend app with a Skills pattern
  for organized business logic.

## Repo structure
kewalinvest/          — git submodule (READ-ONLY, reference for business logic)
backend/
src/
skills/           — 8 skill modules (portfolio, client, market, planning, import, alert, report, comms)
config/           — DB config, tiers, environment
middleware/       — Auth, tenant guard, error handler
routes/           — Express routes
services/         — Skill registry, skill loader, tenant service
types/            — TypeScript interfaces
utils/            — XIRR, NAV fetcher, SQL reader
server.ts         — Express entry point
migrations/         — KI_ prefixed SQL migrations
frontend/
src/
components/       — React components (auth, onboarding, common, charts)
pages/            — Route pages
services/         — API client, auth service
hooks/            — useSkill, useAuth
recipes/          — 9 recipe JSONs (UI layout descriptors)
types/            — Frontend TypeScript types
docs/                 — Architecture docs
scripts/              — Git workflow scripts (push, pull, merge, bookmark, status)

## Database
- **Host:** postgresql://vikuna_admin:***@187.127.136.65:5432/ki_prime_db
- **Connection:** DB_PRIMARY env var
- **DB_PRIMARY_SSL=false**
- **NOT Supabase.** Direct PostgreSQL on VPS.
- **Table prefix:** KI_ for all product tables
- **Multi-tenant:** Every table has tenant_id column. Every query filters by it.

## Skills Pattern
Each skill in backend/src/skills/<name>/ has:
- SKILL.md — Contract: functions, params, returns
- functions/ — One TS file per function (deterministic, no LLM)
- queries/ or sql/ — Raw parameterized SQL files
- tests/ — Unit tests (3-check pattern)

### Function signature:
```typescript
async function handler(params: Record<string, unknown>, ctx: SkillContext): Promise<Result>
```
- ctx.tenant_id — from JWT, never from request
- ctx.db.query() — parameterized PG queries
- Every SQL: WHERE tenant_id = $tenant_id

## Rules for Claude Code
1. **NEVER modify kewalinvest/.** Read-only submodule.
2. Port MVP logic into skills — don't reinvent. Check kewalinvest/ first.
3. Every SQL query MUST filter by tenant_id.
4. Table prefix: KI_ for all tables.
5. SQL files in queries/ or sql/ subdirectory, not inline.
6. Tests: 3-check pattern (valid data, empty/not-found, wrong tenant → zero rows).
7. No VaNi references. No VaNiBase imports. This is plain Express.

## Running locally
```bash
npm run install:all
npm run dev              # Starts backend (3001) + frontend (3000)
```

## Testing skills directly
POST http://localhost:3001/api/v1/skills/:skillName/:functionName
Headers: Authorization: Bearer <jwt> (or X-Dev-Tenant-Id for dev)
Body: { "params": { ... } }