# CLAUDE.md — KI-Prime

## What is this repo?
KI-Prime — Financial planning agent for mutual fund distributors (MFDs) in India. Built on the VaNi Product Framework v2.0.

## Architecture
- **vani-base/** is a git submodule (kamalcharan/VaNiBase). DO NOT modify files inside vani-base/.
- **kewalinvest/** is a git submodule (kamalcharan/kewalinvest). READ-ONLY reference for business logic patterns (XIRR, MFAPI, InvestWell parser). DO NOT modify.
- Product code lives in: skills/, recipes/, migrations/, components/, vani.config.ts, startup.ts, shell.config.ts
- Entry point: startup.ts (imports framework from vani-base/, registers KI-Prime skills/recipes, starts server)
- vaniMode=full (LLM reasons about every request), tenancy=operator (distributor manages clients)

## Repo structure
```
vani-base/          — git submodule → kamalcharan/VaNiBase (READ-ONLY, never modify)
kewalinvest/        — git submodule → kamalcharan/kewalinvest (READ-ONLY, reference only for business logic)
skills/             — 8 KI-Prime skills (portfolio, planning, market, client, alert, report, comms, import)
recipes/            — 9 recipe JSONs (daily-briefing, portfolio-view, client-360, goal-dashboard, etc.)
migrations/         — KI_ prefixed product tables
components/         — Product-level React components (login vault, toast, loader, onboarding steps)
documents/          — PRD docs, HTML prototypes
  HTML/auth-onboard/  — Auth & onboarding prototypes (6 files — binding spec for implementation)
shared/             — Product-level skill registry, types
startup.ts          — Product entry point
vani.config.ts      — Product configuration
shell.config.ts     — Shell configuration (theme, recipes, entities, onboarding steps, page overrides)
tiers.config.ts     — Subscription tiers (Starter ₹499, Professional ₹1499, Enterprise ₹3999)
.env                — Secrets (NEVER commit)
```

## Database
- **Host:** postgresql://vikuna_admin:Vikuna2026Secure@187.127.136.65:5432/ki_prime_db
- **Connection:** DB_PRIMARY env var (NOT individual DB_HOST/DB_PORT etc.)
- **DB_PRIMARY_SSL=false**
- **NOT Supabase.** Direct PostgreSQL on VPS.
- VN_ framework tables + KI_ product tables both live in the same database.
- Each product DB has its own JWT_SECRET (stored in .env, not shared across products).

## Table naming convention
- `VN_` prefix — framework tables (in vani-base, shared across products)
- `KI_` prefix — KI-Prime product tables

### VN_ Framework Tables (13)
VN_tenants, VN_tenant_profiles, VN_users, VN_roles, VN_user_roles, VN_refresh_tokens, VN_subscriptions, VN_subscription_history, VN_audit_log, VN_migrations, VN_invitations, VN_password_resets, VN_tenant_onboarding, VN_error_log

### KI_ Product Tables (11)
ki_schemes, ki_nav_history, ki_clients, ki_portfolios, ki_holdings, ki_transactions, ki_goals, ki_goal_projections, ki_alerts, ki_import_log, ki_scheme_categories

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

## VDF Components (from vani-base/shell/)
These are the available VaNi Design Framework components. USE these — do not create duplicates.

### Existing VDF Components (24)
| Component | Location | Purpose |
|-----------|----------|---------|
| form-input | vdf/form-input.tsx | Text/email/password/number input with label, validation, error state |
| button | vdf/button.tsx | Primary, secondary, ghost, danger variants |
| alert | vdf/alert.tsx | Info, success, warning, error alerts |
| modal | vdf/modal.tsx | Dialog overlay with close, confirm actions |
| wizard | vdf/wizard.tsx | Multi-step wizard with step indicator |
| badge | vdf/badge.tsx | Status badges (up, down, info, neutral) |
| data-table | vdf/data-table.tsx | Sortable, filterable table |
| card | vdf/card.tsx | Glass card container |
| stat-card | vdf/stat-card.tsx | KPI display with label, value, change |
| sidebar | components/sidebar.tsx | Nav rail + theme picker + logout |
| recipe-renderer | components/recipe-renderer.tsx | Renders VDF from recipe JSON |
| theme-provider | components/theme-provider.tsx | 12 themes, CSS var injection |
| auth-provider | context/auth-provider.tsx | Login/logout/refresh/session limit |
| skill-fetcher | lib/skill-fetcher.ts | API calls with Bearer token |
| + 10 more | vdf/ | Various layout/display components |

### Product-Level Components (KI-Prime must build)
| Component | Purpose | Notes |
|-----------|---------|-------|
| login-vault | Custom Atlas login page | ✅ Built (components/login-vault.tsx) |
| landing-page | Marketing landing | Built but not wired |
| toast | Toast notification system | Product responsibility — NOT in VaNiBase |
| loader | Loading spinner/skeleton | Product responsibility — NOT in VaNiBase |
| onboard-user-profile | Onboarding step 1 | Ref: atlas-onboarding.html Step 1 |
| onboard-business | Onboarding step 2 | Ref: atlas-onboarding.html Step 2 |
| onboard-theme | Onboarding step 3 | Ref: atlas-onboarding.html Step 3 |
| onboard-invite | Onboarding step 4 | Ref: atlas-onboarding.html Step 4 |
| onboard-preferences | Onboarding step 5 | Ref: atlas-onboarding.html Step 5 |
| onboard-import | Onboarding step 6 | Ref: atlas-onboarding.html Step 6 |
| onboarding-pending | Block screen for invited users | Ref: atlas-onboarding.html (Pending Block) |
| country-dropdown | Flag + dial code picker | Ref: atlas-register.html |
| password-strength | Strength meter for password fields | Ref: atlas-register.html |

## Error Handling Framework
Error handling is provided by VaNiBase at the framework level. Products use it, don't rebuild it.

### Server-Side (Express)
- **API Error Interceptor:** Express middleware catches all errors, returns standardized response
- **Error response format:** `{ error: { code, message, details? }, status }`
- **Logging:** Console (dev via NODE_ENV=development) + VN_error_log table (production)
- **VN_error_log columns:** id, tenant_id, user_id, error_code, message, stack, endpoint, method, severity (info/warn/error/fatal), metadata JSONB, created_at

### Client-Side (React)
- **ErrorBoundary:** Wraps the app in vani-base/, catches React rendering errors, shows fallback UI
- **API error interceptor:** skill-fetcher.ts catches HTTP errors, standardizes them
- **Products handle:** Toast display on error (product-level toast component), loading states (product-level loader component)

## Toast & Loader (Product Responsibility)
VaNiBase does NOT provide toast or loader. KI-Prime must implement its own:
- **Toast:** Notification component for success/error/warning/info messages. Theme-aware via CSS vars. Positioned bottom-right or top-right.
- **Loader:** Full-page skeleton or spinner for route transitions. Inline skeleton for component-level loading.
- Both should use the product's theme CSS variables for styling.

## Auth & Onboarding (Binding Spec)
**PRD:** documents/Auth-Onboarding-PRD-v1.docx
**Prototypes:** documents/HTML/auth-onboard/ (6 HTML files)

### Auth Flow
Register (4 fields: name, email, password, phone) → Auto-create tenant + user + starter subscription + owner role → /onboarding → Complete mandatory steps → /dashboard

### Onboarding Steps (KI-Prime)
| # | Step ID | Title | Mandatory | Component |
|---|---------|-------|-----------|-----------|
| 1 | user_profile | Your Profile | Yes | OnboardUserProfile |
| 2 | business_profile | Business Details | Yes | OnboardBusiness |
| 3 | theme_selection | Theme | No (default: vikuna-black) | OnboardTheme |
| 4 | invite_team | Invite Team | No | OnboardInvite |
| 5 | risk_preferences | Preferences | No | OnboardPreferences |
| 6 | import_data | Import Data | No | OnboardImport |

### Onboarding Rules
- Only tenant owner sees/completes the wizard
- Invited users get hard-blocked ("onboarding pending" screen) until owner finishes all mandatory steps
- Incomplete onboarding: on next login, redirect back to wizard at last incomplete step
- Step progress tracked in VN_tenant_onboarding table

### Theme Resolution Chain
1. User preference (VN_users.preferences.theme_override + localStorage) — highest
2. Tenant config (VN_tenant_profiles.theme_id)
3. Product default (ShellConfig.theme.default = vikuna-black) — in shell.config.ts
4. Framework fallback (classic-elegant) — hardcoded in registry

### Storage (MVP — Firebase Stopgap)
- .env: STORAGE_ENABLED=true/false, UPLOAD_ENDPOINT=<firebase-url>
- Client uploads to Firebase, gets URL, saves to entity field
- VN_users.avatar_url, VN_tenant_profiles.logo_url — inline URL storage
- No VN_files table, no server-side file handling for MVP
- Future: pluggable adapter (VPS filesystem, S3, Google Drive)

## Rules for Claude Code
1. **NEVER modify files inside vani-base/ or kewalinvest/.** They are read-only git submodules.
2. **Follow the PRD and HTML prototypes STRICTLY.** No deviations, no innovations, no unsolicited improvements. The PRD (Auth-Onboarding-PRD-v1.docx) and HTML prototypes (documents/HTML/auth-onboard/) are the binding spec.
3. **If you have recommendations or improvements,** write them to a file called RECOMMENDATIONS.md — never implement them without explicit approval.
4. **If you need a framework change (anything in vani-base/),** STOP and tell me. I'll do it in the VaNiBase repo separately.
5. Product code goes in: skills/, recipes/, migrations/, components/, startup.ts, vani.config.ts, shell.config.ts
6. Every SQL query must use KI_ prefixed table names for product tables.
7. Every tenant-scoped query must have WHERE tenant_id = $tenant_id.
8. Every skill function receives (params, ctx: SkillContext). Use ctx.tenantId, ctx.db.query().
9. Every skill function returns { ...data, recipe: 'recipe-name' } matching the SKILL.md spec.
10. Use ctx.db.transaction() for multi-step operations (imports, goal creation).
11. Unit tests: 3-check pattern (valid data, empty/not-found, wrong tenant → zero rows).
12. Recipe JSON files are declarative only — no React code, no HTML, no logic.
13. Reference kewalinvest/ submodule for business logic patterns (XIRR, MFAPI, InvestWell parser) but rewrite for SkillContext.
14. **USE existing VDF components** from vani-base/shell/. Check the VDF table above before creating any new component.
15. **Toast and loader** are product-level. Build them in components/ matching the product theme.
16. **Error handling** uses the VaNiBase ErrorBoundary and API interceptor. Do not rebuild error infrastructure.
17. **Database connection** uses DB_PRIMARY env var. No individual DB_HOST/DB_PORT variables.

## Running locally
```bash
npm run install:all          # Install root + vani-base + shell deps
npm run dev                  # Starts API (port 3001) + Shell (port 3000)
```
Requires: .env with DB_PRIMARY, JWT_SECRET, and optionally STORAGE_ENABLED + UPLOAD_ENDPOINT.

## Testing skills directly
```
POST http://localhost:3001/api/v1/skills/:skillName/:functionName
Headers: X-Dev-Tenant-Id: <tenant-uuid>, X-Dev-User-Id: <user-uuid>
Body: { "params": { ... } }
```

## Git workflow
- Product changes: commit and push normally from this repo
- Framework updates: done in VaNiBase repo, then pulled here with:
  ```
  cd vani-base && git pull origin main && cd .. && git add vani-base && git commit -m "Update VaNiBase"
  ```
- KewalInvest updates (if any):
  ```
  cd kewalinvest && git pull origin main && cd .. && git add kewalinvest && git commit -m "Update KewalInvest ref"
  ```
- Use scripts/push-main.ps1 for release workflow
- Use scripts/pull-safe.ps1 for safe pulls

## Prototype → Component Mapping
When implementing auth/onboarding pages, reference these HTML prototypes as the UX spec:

| Prototype | Implements | Target Component |
|-----------|-----------|-----------------|
| atlas-register.html | Registration page | app/(auth)/register/page.tsx |
| atlas-forgot-password.html | Forgot password flow | app/(auth)/forgot-password/page.tsx |
| atlas-invite-join.html | Join tenant (Type A) | app/(auth)/invite/page.tsx |
| atlas-invite-referral.html | Referral signup (Type B) | app/(auth)/register/page.tsx (with referral context) |
| atlas-onboarding.html | 6-step onboarding wizard | app/(onboarding)/page.tsx + 6 step components |
| atlas-settings.html | Settings / Profile | app/(dashboard)/settings/page.tsx |