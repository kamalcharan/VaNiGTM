# KI-Prime — Claude Code Session Starter

Read CLAUDE.md first if it exists. Then run `git submodule update --init --recursive`. Then read this entire prompt before doing any work.

## What is this repo?

KI-Prime is a financial planning agent for mutual fund distributors (MFDs) in India. It's built on the VaNi Product Framework. The framework lives in `vani-base/` as a git submodule.

**CRITICAL RULE: NEVER modify files inside `vani-base/`**. Framework changes must be done in the VaNiBase repo separately, pushed to main, then pulled here via `cd vani-base && git pull origin main`.

## Key directories

```
# Product code (YOU modify these)
skills/
  client-skill/functions/    — get-clients.ts, get-client-profile.ts, get-risk-profile.ts
  portfolio-skill/functions/  — get-holdings.ts, get-allocation.ts, calc-xirr.ts, get-portfolio-summary.ts
  planning-skill/functions/   — get-goals.ts, calc-goal-gap.ts, project-goal.ts, suggest-sip-increase.ts
  market-skill/functions/     — get-nav.ts, get-nav-history.ts, search-schemes.ts, compare-schemes.ts
  import-skill/functions/     — import-investwell.ts, import-cas.ts, reconcile-holdings.ts
  alert-skill/               — Spec only, no handlers yet
  report-skill/              — Spec only, no handlers yet
  comms-skill/               — Spec only, no handlers yet

recipes/                     — 9 recipe JSON files (client-list, portfolio-view, etc.)
shared/                      — Product types, skill-registry.ts
seeds/                       — Demo data scripts
startup.ts                   — Product entry point (imports framework, registers skills, starts server)
vani.config.ts               — Product config (vaniMode=full, tenancy=operator, entity=client)
shell.config.ts              — Shell config (recipe-to-skill mappings for the framework shell UI)
tiers.config.ts              — Starter ₹499, Professional ₹1499, Enterprise ₹3999
package.json                 — Dev scripts: dev (both), dev:api, dev:shell

# Framework (DO NOT modify — read-only submodule)
vani-base/
  framework/                 — API server, auth, skill executor, routes
  shell/                     — Next.js shell with VDF components, runs on port 3000
  shared/                    — Framework types
```

## How to run

```powershell
# Both API (port 3001) + Shell (port 3000)
npm run dev

# API only
npm run dev:api

# Shell only (from vani-base/shell/)
npm run dev:shell
```

## Supabase configuration

- Project ref: oghpfkyxujiojflohnnd
- Pooler host: aws-1-ap-south-1.pooler.supabase.com
- Pooler port: 6543
- DB user: postgres.oghpfkyxujiojflohnnd
- Region: Mumbai (ap-south-1)
- SSL: `ssl: { rejectUnauthorized: false }` required
- RLS: DISABLED on all tables (for debugging)

## Table prefix convention

ALL product tables use `ki_` prefix: ki_clients, ki_holdings, ki_schemes, ki_nav_history, ki_portfolios, ki_transactions, ki_goals. Framework tables use `vn_` prefix.

## Seed data in Supabase

- 1 tenant: Demo Distributor (UUID: a0000000-0000-0000-0000-000000000001)
- 1 user: dev@vani.local (UUID: a0000000-0000-0000-0000-000000000002)
- 5 clients: Priya Mehta (id=1), Vikram Desai (id=2), Anita Joshi (id=3), Rajesh Kumar (id=4), Sunita Agarwal (id=5)
- 8 mutual fund schemes, 40 NAV records, 17 holdings, 6 transactions, 8 goals

## Skill handler contract

- Signature: `handler(params, ctx)` — params FIRST, ctx SECOND
- ctx.db.query() returns `{ rows: T[] }` (pg native format)
- ctx exposes both tenantId (camelCase) and tenant_id (underscore)
- SQL uses `:param_name` — toPositional converts to $1, $2
- Every SQL query MUST include tenant_id (except read-only reference tables)

## What's working (as of March 2026)

### API (port 3001) — ALL WORKING
- POST /api/v1/skills/:skill/:function — accepts { params: {...} }, returns { data, recipe, success }
- Dev auth via X-Dev-Tenant-Id + X-Dev-User-Id headers
- 5 skills with handlers: client-skill (3), portfolio-skill (4), market-skill (5), planning-skill (5), import-skill (4)
- Verified: get_clients returns 5 clients, get_client_profile returns full profile, get_holdings returns holdings, get_goals returns 2 goals

### Shell (port 3000) — PARTIALLY WORKING
- Framework shell renders via vani-base/shell/ with config from shell.config.ts
- Sidebar shows 9 recipes with working <Link> navigation
- Recipe pages fetch skill data via POST and recipe definitions via GET
- Working pages: client-list (data-table), portfolio-view (KPIs + table + doughnut), goal-dashboard (KPI cards with progress bars)
- Partial: client-360 (some KPIs show), scheme-explorer (no search query = empty)
- Some VDF components still need auto-detect improvements

## Shell config (shell.config.ts)

This file maps recipes to skill endpoint calls. The framework shell reads it via webpack alias. When adding a new recipe or changing skill calls, edit this file. Format:

```typescript
{
  recipe: 'recipe-name',        // matches recipe JSON filename
  label: 'Sidebar Label',       // displayed in sidebar
  route: '/url-path',           // browser URL
  skills: [
    { skill: 'skill-name', function: 'handler_name', params: { client_id: 1 } },
  ],
}
```

## Git workflow

- Product changes → commit directly, push to main
- Framework changes → NEVER modify vani-base/ files here. Go to VaNiBase repo instead
- After VaNiBase changes: `cd vani-base && git pull origin main && cd .. && git add vani-base && git commit -m "chore: pull latest vani-base"`
- Use `scripts/push-main.ps1` for product + submodule reference push (if working)
- Always delete .next cache after pulling submodule changes: `Remove-Item -Recurse -Force vani-base\shell\.next`

## Known bugs

- Execution log write fails (tenant_id null in fire-and-forget INSERT) — non-blocking
- Some VDF components render skeletons when they should show data — VaNiBase issue, not product
- scheme-explorer returns empty because search_schemes needs a query param