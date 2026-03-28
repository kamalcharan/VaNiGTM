# CLAUDE.md — KI-Prime

## What is this repo?
KI-Prime — Financial planning agent for mutual fund distributors (MFDs) in India. Built on the VaNi Product Framework.

## Architecture
- **vani-base/** is a git submodule (kamalcharan/VaNiBase). DO NOT modify files inside vani-base/.
- Product code lives in: skills/, recipes/, migrations/, vani.config.ts, startup.ts
- Entry point: startup.ts (imports framework from vani-base/, registers KI-Prime skills/recipes, starts server)
- vaniMode=full (LLM reasons about every request), tenancy=operator (distributor manages clients)

## Repo structure
```
vani-base/          — git submodule → kamalcharan/VaNiBase (READ-ONLY, never modify)
skills/             — 8 KI-Prime skills (portfolio, planning, market, client, alert, report, comms, import)
recipes/            — 9 recipe JSONs (daily-briefing, portfolio-view, client-360, goal-dashboard, etc.)
migrations/         — KI_ prefixed product tables
shared/             — Product-level skill registry, types
startup.ts          — Product entry point
vani.config.ts      — Product configuration
tiers.config.ts     — Subscription tiers (Starter ₹499, Professional ₹1499, Enterprise ₹3999)
.env                — Secrets (NEVER commit)
```

## Table naming convention
- `VN_` prefix — framework tables (in vani-base, shared)
- `KI_` prefix — KI-Prime product tables: ki_schemes, ki_nav_history, ki_clients, ki_portfolios, ki_holdings, ki_transactions, ki_goals, ki_goal_projections, ki_alerts, ki_import_log, ki_scheme_categories

## Skills status
| Skill | Tier | Functions | Handlers | Status |
|-------|------|-----------|----------|--------|
| portfolio-skill | starter | 5 | 4 | ✅ Wave 1 |
| client-skill | starter | 5 | 3 | ✅ Wave 1 |
| market-skill | starter | 5 | 5 | ✅ Wave 2 |
| planning-skill | professional | 5 | 5 | ✅ Wave 2 |
| import-skill | starter | 4 | 4 | ✅ Wave 3 |
| alert-skill | professional | 5 | 0 | ⬜ Wave 5 |
| report-skill | professional | 4 | 0 | ⬜ Wave 5 |
| comms-skill | professional | 4 | 0 | ⬜ Wave 6 |

## Rules for Claude Code
1. **NEVER modify files inside vani-base/.** It's a read-only git submodule.
2. Product code goes in: skills/, recipes/, migrations/, startup.ts, vani.config.ts
3. If you need a framework change, STOP and tell me — I'll do it in the VaNiBase repo separately.
4. Every SQL query must use KI_ prefixed table names.
5. Every tenant-scoped query must have WHERE tenant_id = $tenant_id.
6. Every skill function receives (params, ctx: SkillContext). Use ctx.tenantId, ctx.db.query().
7. Every skill function returns { ...data, recipe: 'recipe-name' } matching the SKILL.md spec.
8. Use ctx.db.transaction() for multi-step operations (imports, goal creation).
9. Unit tests: 3-check pattern (valid data, empty/not-found, wrong tenant → zero rows).
10. Recipe JSON files are declarative only — no React code, no HTML, no logic.
11. Reference existing KewalInvest MVP for business logic patterns (XIRR, MFAPI, InvestWell parser) but rewrite for SkillContext.

## Running locally
```bash
npm run install:all          # Install root + vani-base + shell deps
npm run dev                  # Starts API (port 3001) + Shell (port 3000)
```
Requires: .env with Supabase credentials, Docker with Redis running.

## Testing skills directly
```
POST http://localhost:3001/api/v1/skills/:skillName/:functionName
Headers: X-Dev-Tenant-Id: <tenant-uuid>, X-Dev-User-Id: <user-uuid>
Body: { "params": { ... } }
```

## Supabase
- KI-Prime has its own Supabase project (separate from VaNiBase)
- Transaction pooler on port 6543
- Individual DB params in .env (DB_HOST, DB_USER, DB_PASSWORD, DB_PORT, DB_NAME)
- VN_ framework tables + KI_ product tables both live in the same database

## Git workflow
- Product changes: commit and push normally from this repo
- Framework updates: done in VaNiBase repo, then pulled here with:
  cd vani-base && git pull origin main && cd .. && git add vani-base && git commit -m "Update VaNiBase"
- Use scripts/push-main.ps1 for release workflow
- Use scripts/pull-safe.ps1 for safe pulls
