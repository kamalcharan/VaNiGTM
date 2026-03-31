# CLAUDE.md — ProessionalKey (KI-Prime)

## What is this repo?
ProessionalKey — multi-tenant SaaS financial planning platform for Mutual Fund Distributors (MFDs) in India. Built on a lightweight Skills.md convention — no framework dependency.

## Architecture
- **kewalinvest/** is a git submodule (kamalcharan/kewalinvest). READ-ONLY reference for business logic patterns (XIRR, MFAPI, InvestWell parser). DO NOT modify.
- **Single process:** Express custom server wrapping Next.js. Express handles `/api/v1/*`. Next.js handles all pages.
- **Stack:** React + TypeScript (Next.js App Router) frontend, Node.js + Express + TypeScript backend, PostgreSQL on VPS.
- **Deploy:** Docker → Railway or DigitalOcean. DB stays on own VPS (remote connection).
- No VaNi framework. No VaNiBase. No Supabase.

## Repo structure
```
kewalinvest/        — git submodule → kamalcharan/kewalinvest (READ-ONLY, never modify)
server.ts           — Express custom server wrapping Next.js (single entry point)
src/
  api/
    db/             — PG pool, migration runner
    middleware/     — Auth (JWT), tenant-context, error-handler, rate-limiter
    routes/         — auth.routes.ts, skill.routes.ts
  app/              — Next.js App Router (pages, layouts)
  context/          — Auth provider
  lib/              — API client, shell config
  hooks/            — useSkill, useAuth
skills/             — 8 business logic modules (portfolio, client, market, planning, import, alert, report, comms)
shared/             — SkillContext types, skill-loader, skill-registry
components/         — VDF component library + product components (auth, onboarding, settings)
recipes/            — 9 recipe JSONs (UI layout descriptors)
migrations/         — KI_ prefixed database migrations
scripts/            — Git workflow scripts
```

## Database

- **Host:** VPS PostgreSQL (connection via DB_PRIMARY env var)
- **Remote connection:** App on Railway/DO connects to VPS over internet. Region matters — deploy in Asia for low latency.
- **DB_PRIMARY_SSL:** Set to `true` for remote connections, `false` for local dev.
- **Table prefix:** KI_ for all product tables.
- **Multi-tenant:** Every table has `tenant_id UUID NOT NULL` column.

### KI_ Product Tables (11)
ki_schemes, ki_nav_history, ki_clients, ki_portfolios, ki_holdings, ki_transactions, ki_goals, ki_goal_projections, ki_alerts, ki_import_log, ki_scheme_categories

### Connection Pooling
- Pool: `max: 25` connections, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`
- Direct connection to PostgreSQL — no PgBouncer for MVP
- On every connection checkout: `SELECT set_tenant_context($1)` with tenant_id — this powers RLS
- No Supabase pooler, no transaction mode quirks — standard PG pool

### Row Level Security (RLS)
- RLS is ENABLED on all tenant-scoped KI_ tables (already in migration 001)
- RLS policies use `current_setting('app.current_tenant_id', true)`
- `set_tenant_context()` function sets this per-connection (migration 003)
- RLS is the SAFETY NET — application code ALSO filters by tenant_id in every query
- Both layers required. Never rely on only one.

### Transactions — MANDATORY
- **Every write operation MUST be wrapped in a transaction.** No exceptions.
- Pattern: `BEGIN` → execute all queries → `COMMIT` (or `ROLLBACK` on error)
- Use `ctx.db.transaction(fn)` helper — it handles BEGIN/COMMIT/ROLLBACK automatically
- Reads do NOT need transactions
- Batch inserts (import-skill): use multi-row INSERT in batches of 50 for performance

```typescript
// CORRECT — all writes in transaction
await ctx.db.transaction(async (client) => {
  await client.query(INSERT_CLIENT, params);
  await client.query(INSERT_PORTFOLIO, params);
  await client.query(INSERT_HOLDINGS, params);
});

// WRONG — partial writes possible on failure
await ctx.db.query(INSERT_CLIENT, params);
await ctx.db.query(INSERT_PORTFOLIO, params);  // if this fails, client is orphaned
```

## Skills Pattern

Each skill in `skills/<skill-name>/` has:
- `SKILL.md` — Contract: functions, params, returns
- `functions/` — One TypeScript file per function (deterministic, no LLM calls)
- `queries/` or `sql/` — Raw parameterized SQL files
- `tests/` — Unit tests following 3-check pattern

### SkillContext (injected into every function)

```typescript
interface SkillContext {
  tenant_id: string;   // From JWT, NEVER from request body
  db: {
    query(sql: string, params: Record<string, unknown>): Promise<{ rows: T[] }>;
    transaction(fn: (client) => Promise<any>): Promise<any>;  // Auto BEGIN/COMMIT/ROLLBACK
  };
}
```

### Function Pattern

```typescript
export async function get_holdings(
  params: { client_id: number },   // params FIRST
  ctx: SkillContext                 // ctx SECOND
): Promise<GetHoldingsResult> {
  const result = await ctx.db.query(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: params.client_id,
  });
  return { holdings: result.rows, recipe: 'portfolio-view' };
}
```

## Error Handling — MANDATORY

### Backend (every endpoint, every skill handler)
- Every API route and skill function: wrap in try/catch
- Structured error response format: `{ error: { code: string, message: string, details?: any }, status: number }`
- Log errors: console (dev via NODE_ENV=development) + ki_error_log table (production)
- Never swallow errors silently. Never return raw stack traces to client.

```typescript
// CORRECT
try {
  const result = await registry.execute(skill, fn, params, ctx);
  res.json(result);
} catch (err) {
  console.error(`[Skill:${skill}.${fn}]`, err);
  await logError(ctx.tenant_id, err, req);
  res.status(500).json({ error: { code: 'SKILL_EXECUTION_ERROR', message: 'Internal error' } });
}

// WRONG
const result = await registry.execute(skill, fn, params, ctx); // unhandled rejection
res.json(result);
```

### Frontend (every page, every API call)
- Every API call: handle error state, show toast notification
- Every page: loading state with Loader component, error state with Toast
- Use the existing `components/toast.tsx` (ToastProvider, useToast) — ALWAYS
- Use the existing `components/loader.tsx` (FullPageLoader, InlineLoader) — ALWAYS
- Never show a blank page on error. Never show raw error messages to users.

```typescript
// CORRECT
const { data, loading, error } = useSkill('client-skill', 'get_clients');
if (loading) return <FullPageLoader message="Loading clients..." />;
if (error) { showToast({ message: 'Failed to load clients', type: 'error' }); }

// WRONG
const { data } = useSkill('client-skill', 'get_clients'); // no loading, no error handling
```

## Rate Limiting

- Per-tenant daily limits defined in `tiers.config.ts`
- Starter: 50 skill calls/day, Professional: 200, Enterprise: unlimited
- Implementation: PG table (`ki_rate_limits`) + in-memory buffer
- In-memory Map tracks counts per request, flushes to PG every 10 requests or 30 seconds
- On container restart, reload current day's counts from PG table
- No Redis for MVP — PG-backed rate limiting is sufficient for 500 tenants

## VDF — VaNi Design Framework (Component Library)

**CRITICAL: Every UI element MUST come from VDF. No one-off styled components.**

VDF is the single source of truth for all visual elements. Located in `components/vdf/` (or `components/` root for product-level components).

### Rules
1. Every button, input, dropdown, card, chart, dialog, switch, badge, table — comes from VDF
2. Before creating ANY new component, check if VDF already has it
3. If VDF doesn't have it, create it IN VDF with proper theming — not inline in a page
4. Every VDF component MUST use CSS variables from the theme system (never hardcoded colors)
5. Every VDF component MUST support all 12 themes without modification
6. VDF components are generic and reusable — no business logic inside them

### Component pattern
```typescript
// components/vdf/button.tsx — CORRECT (themed, reusable)
<button className={styles.btn} style={{ background: 'var(--color-primary)' }}>

// pages/clients.tsx — WRONG (hardcoded, one-off)
<button style={{ background: '#6f61ef', borderRadius: '8px' }}>
```

## Themes (12 themes)

- 12 theme configs, each with light + dark mode
- Theme structure: `ThemeConfig` type with brand, utility, accent, semantic color groups
- CSS variables injected at root level by ThemeProvider
- Every component reads from CSS variables — never from theme object directly in JSX
- Default theme: vikuna-black (glassmorphic)
- Theme resolution chain: User preference → Tenant config → Product default → Framework fallback

### CSS Variable Mapping
```css
/* Brand */
--color-primary: <brand.primary>
--color-secondary: <brand.secondary>
--color-tertiary: <brand.tertiary>

/* Utility */
--color-fg: <utility.primaryText>
--color-muted: <utility.secondaryText>
--color-bg: <utility.primaryBackground>
--color-surface: <utility.secondaryBackground>

/* Semantic */
--color-success: <semantic.success>
--color-danger: <semantic.error>
--color-warning: <semantic.warning>
--color-info: <semantic.info>

/* Accent */
--color-accent: <accent.accent1>
```

## UX Standards

- **Glassmorphic design is DEFAULT.** Backdrop blur, glass surfaces, subtle borders, depth through transparency.
- **No safe/generic design.** Every screen should feel premium, innovative, best-in-class.
- **The Atlas design language** (login-vault, landing-page) sets the bar — dashboard pages match this quality.
- Animations: subtle, purposeful (fadeInUp, transitions on hover/focus). No gratuitous animation.
- Typography: clean hierarchy. Playfair Display for display text, DM Sans for body, JetBrains Mono for data.
- Data density: dashboard pages are data-rich but never cluttered. Whitespace is intentional.
- Mobile responsive: every page works on tablet and mobile. Not just desktop.

## Skills Status
| Skill | Functions | Handlers | Status |
|-------|-----------|----------|--------|
| portfolio-skill | 5 | 4 | ✅ Done |
| client-skill | 5 | 3 | ✅ Done |
| market-skill | 5 | 5 | ✅ Done |
| planning-skill | 5 | 5 | ✅ Done |
| import-skill | 4 | 4 | ✅ Done |
| alert-skill | 5 | 0 | ⬜ Spec only |
| report-skill | 4 | 0 | ⬜ Spec only |
| comms-skill | 4 | 0 | ⬜ Spec only |

## Scalability Target
- **500 tenants, 2000 users**
- PG pool: 25 connections, direct to VPS
- RLS: enabled on all tenant tables
- Rate limiting: PG table + in-memory buffer (no Redis)
- Single container on Railway/DO (scale to multiple later if needed)
- JWT auth: stateless, no session store needed

## Rules for Claude Code

1. **NEVER modify files inside kewalinvest/.** Read-only submodule.
2. **Port MVP logic into skills — don't reinvent.** Check kewalinvest/ first.
3. **Every SQL query MUST filter by tenant_id.** No exceptions.
4. **Every write operation MUST be in a transaction.** Use `ctx.db.transaction()`.
5. **Every API endpoint and skill handler MUST have error handling.** try/catch, structured error response, logging.
6. **Every frontend page MUST use Toast for errors and Loader for loading states.**
7. **Every UI element MUST come from VDF.** No one-off styled components. No hardcoded colors.
8. **Every VDF component MUST use CSS variables** from the theme system.
9. **Table prefix: KI_** for all tables.
10. **SQL files in queries/ or sql/ subdirectory** — not inline in TypeScript.
11. **Tests: 3-check pattern** — (a) valid data, (b) empty/not-found, (c) wrong tenant → zero rows.
12. **No VaNi. No VaNiBase. No framework imports.** This is plain Express + Next.js.
13. **UX: glassmorphic default, innovative, premium.** No generic/safe design. Match the Atlas design language quality.

## Reference: MVP → ProessionalKey Mapping

| MVP (kewalinvest)                    | ProessionalKey                              |
|--------------------------------------|---------------------------------------------|
| `backend/src/services/portfolio.*`   | `skills/portfolio-skill/functions/`         |
| `backend/src/services/transaction.*` | `skills/import-skill/functions/`            |
| `backend/src/controllers/*`          | Replaced by skill-executor (no controllers) |
| `backend/src/routes/*`               | Single skill.routes.ts + auth.routes.ts     |
| `backend/src/utils/xirr.*`           | `skills/portfolio-skill/functions/calc-xirr.ts` |

## Running locally
```bash
npm run dev    # Single process: Express + Next.js on port 3000
```

## Testing skills directly
```
POST http://localhost:3000/api/v1/skills/:skillName/:functionName
Headers: Authorization: Bearer <jwt> (or X-Dev-Tenant-Id for dev)
Body: { "params": { ... } }
```

## Git workflow
- Product changes: commit and push to main
- KewalInvest reference updates:
  ```
  cd kewalinvest && git pull origin main && cd .. && git add kewalinvest && git commit -m "Update kewalinvest ref"
  ```
- Use scripts/push-main.ps1 for release workflow
- Use scripts/pull-safe.ps1 for safe pulls
- Use scripts/create-bookmark.ps1 before risky changes

## Testing
```bash
npm test    # Runs jest across skills/*/tests/ and shared/tests/
```