# VaNiBase — Claude Code Session Starter

Read CLAUDE.md first if it exists. Then read this entire prompt before doing any work.

## What is this repo?

VaNiBase is the shared framework for building agent-powered multi-tenant SaaS products. It provides:
- **API server** (`framework/`) — Express + TypeScript, JWT auth, skill executor, tenant context builder, recipe routes
- **Shell** (`shell/`) — Next.js 14 app with VDF component library, recipe renderer, sidebar, theme engine
- **Shared types** (`shared/`) — TypeScript interfaces for Tenant, Skill, SkillContext, Recipe, etc.

Products (like KI-Prime, KaalaDristi) use this repo as a **git submodule**. They never modify VaNiBase files directly — they provide product-specific skills, recipes, and configuration.

## Key directories

```
framework/
  gateway/auth.ts          — JWT auth + dev bypass (X-Dev-Tenant-Id, X-Dev-User-Id headers)
  skill-executor/executor.ts — Runs skill handlers, wraps in transactions, logs execution
  skill-executor/registry.ts — Scans skills/, builds catalog, tier filtering
  context-builder/         — Loads tenant profile, entity context, assembles system prompt
  db/pool.ts               — DB pool, tenant-scoped queries, toPositional, transactions
  routes/skills.ts         — POST /api/v1/skills/:skill/:function endpoint
  recipes/                 — GET /api/v1/recipes/:name endpoint, loads recipe JSON
  vani-engine/             — LLM client (currently VANI_MOCK=true for dev)

shell/
  src/app/layout.tsx       — Root layout, wraps in ShellConfigProvider
  src/app/page.tsx         — Redirects to first configured recipe route
  src/app/[recipe]/page.tsx — Dynamic route, renders RecipePage
  src/components/
    shell-layout.tsx       — Sidebar + main content area
    sidebar.tsx            — Navigation from config, uses <Link>
    recipe-renderer.tsx    — Receives recipe definition + data, renders VDF components
    recipe-page.tsx        — Fetches recipe definition + skill data, passes to renderer
    vdf/                   — 19 VDF components (kpi-card, data-table, doughnut, etc.)
    layouts/               — 6 layout templates (dashboard-3row, detail-sidebar, etc.)
  src/lib/
    shell-config.ts        — ShellConfig interface, ShellConfigProvider context, useShellConfig hook
    shell-config-types.ts  — Type definitions (importable from server components)
    skill-fetcher.ts       — fetchRecipeData() calls POST /api/v1/skills/:skill/:fn
    json-path.ts           — resolvePath() for recipe data binding (supports dots + brackets)
  next.config.mjs          — Webpack alias @product-config → product's shell.config.ts

shared/
  types/index.ts           — SkillContext, SkillCall, SkillResult, Tenant, etc.
  constants/index.ts       — TIER_LEVELS, ERROR_CODES, TABLES
```

## Architecture rules

1. **Framework changes affect ALL products** — be backward compatible
2. **Shell is config-driven** — products inject their recipe-to-skill mappings via shell.config.ts at product repo root
3. **VDF components must auto-detect data shapes** — skill APIs return raw arrays/objects, components must handle both typed shapes AND raw data
4. **No product-specific code in VaNiBase** — no KI-Prime skill names, no hardcoded client-skill references
5. **CSS uses theme variables** — never hardcode colors. Components use classes like text-foreground, bg-surface, text-muted, border-border
6. **Recipe JSON is declarative** — no React code, no HTML, no logic in recipe files
7. **Handler signature** — `(params, ctx)` — params FIRST, ctx SECOND
8. **Skill executor** — sets result.success = true if handler omits it
9. **toPositional regex** — `/:[a-zA-Z_][a-zA-Z0-9_]*/g` — won't match LIMIT 1 or ::text casts
10. **json-path** — supports dot notation AND array brackets: `goals[0].name`

## What's working (as of March 2026)

- Express server with full middleware pipeline, health/metrics/ready endpoints
- JWT auth + dev bypass via X-Dev-Tenant-Id / X-Dev-User-Id headers
- Skill executor with handler registration, tier checking, transaction wrapping
- Recipe registry serving 9 recipes via GET /api/v1/recipes
- Shell with sidebar navigation, dynamic routing, config-driven architecture
- ShellConfigProvider + webpack alias for product config injection
- 19 VDF components with auto-detect for raw data shapes
- 6 themes with light/dark mode via CSS variables
- json-path resolver with dot + bracket notation

## Known issues

- Execution log write fails (tenant_id null in fire-and-forget INSERT) — non-blocking
- Some VDF components still need better auto-detect for complex data shapes
- DEBUG console.log lines still present — remove before production
- RLS disabled on all tables — re-enable with proper policies later

## Git workflow

- Claude Code creates branches (claude/*) — merge to main before products pull
- Always push to main after merging: `git push origin main`
- Products pull via: `cd vani-base && git pull origin main` (from product repo)
- Delete stale Claude branches: `git push origin --delete claude/branch-name`