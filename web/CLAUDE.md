# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR.
- `npm run build` — type-check the project (`tsc --noEmit`) and produce a production bundle in `dist/`.
- `npm run build:skip-check` — build without the TypeScript pass (use only when intentionally shipping despite type errors).
- `npm run lint` — ESLint over `.ts`/`.tsx` with `--max-warnings 0`; a single warning fails the run.
- `npm run preview` — serve the built `dist/` locally.

There is no test runner configured — the "test" step for changes is `npm run build`. It passes on a clean tree (verified 2026-08-10, ~6.5s, with a chunk-size warning that is expected).

**Run `npm install` first.** A fresh clone of this repo has no `node_modules`, and `npx tsc` then downloads a *newer* TypeScript than the one pinned here — which fails on `tsconfig.json`'s `baseUrl` with `TS5101: Option 'baseUrl' is deprecated`. That error is an artifact of the missing install, not a real problem with the code; `--ignoreDeprecations 6.0` is not a valid workaround either (the pinned compiler rejects the value). Install, then build.

Note: `npm run lint` is genuinely broken (ESLint flat config invoked with the removed `--ext` flag, and `eslint.config.js` imports `typescript-eslint` which is not in `package.json`) — pre-existing, not gating.

## VaNi AI (in progress)

> **2026-09-30:** the product's architecture and agent contract are
> `VaNiGTM/ARCH.md` and `VaNiGTM/AGENTS.md`; the specs are
> `VaNiGTM/documents/spec/{PLATFORM,VARA,GTM}.md`; the plan is
> `VaNiGTM/documents/POA-2026-09-30-platform.md`, whose Track H moves
> `vani-app/` into that repo. Work under `vani-app/` still obeys
> `vani-app/CLAUDE.md`.
>
> **Production and the VPS:** `VaNiGTM/DEPLOY.md` — where the API, worker,
> nginx and console run, and every deploy / migrate / rollback command. The
> console calls `api.vikuna.io` directly, so any API route it needs must be
> reachable through that nginx config (DEPLOY.md §5).

**VaNi AI is NOT built in this repo.** The plan changed on 2026-07-31 (Option A, in-repo lazy routes, was superseded twice on the same day). The assessment funnel — public flow, report, console, backend, database — lives in `kamalcharan/VaNiGTM`, attached here as a submodule at `vanigtm/`. This repo now holds only the handover record and the governing documents.

Before touching anything VaNi-related, read `docs/VANI_AI_HANDOVER.md` — phase status, guardrails (no Supabase for VaNi data, config-driven survey engine, deterministic SQL scoring), and what is waiting on whom. For code or database work, read `vanigtm/CLAUDE.md` and `vanigtm/docs/db/*.md` instead; the latter document what the schema does behind the application's back, and exist so the next session does not rediscover it the hard way.

`.mcp.json` configures the read-only `gtm-postgres` MCP channel to `vani_gtm_db`, but **it has never once connected from inside a Claude session** — `GTM_MCP_BASIC` is unset in the Claude environment settings. Every database result on record came either from Charan running SQL and pasting it back, or from a local rebuild of the schema from VaNiGTM's migration files. Do not plan around live DB access.

## Database changes require approval — repo-wide

**No new tables, columns, enums or indexes anywhere in this project without
Charan's explicit approval.** Not a helper table, not "only one column", and not
structured data smuggled into an existing JSONB field. Build against what the
specs and the running system already define: `docs/vani/sql/*.sql`,
`docs/vani/vara-data-model-v1.0.html`, and VaNiGTM's `vn_*` schema. If the model
cannot carry what you are building, say what is missing and wait — that is a
schema change request, not a blocker to route around.

There is no live database access from a Claude session (see the VaNi note
below), so every schema claim must trace to a migration file or a spec.

## Scope discipline for VaNi work

The current focus is **tenant (product-level) onboarding**.

**Corrected 2026-08-17 — the previous version of this section was wrong**, and it
misdirected a session. It said the mission wizard was off the onboarding path
because "GTM reads from the Smart Profile later". The actual architecture, from
Charan:

> The mission wizard **is step 1 of the Smart Profile.** GTM picks *from* the
> Smart Profile afterwards, as and when it wants.

So the Smart Profile is, in order:

1. **Mission wizard** — company research, market vocabulary, competitors, ideal
   customer, brand. This is the substance: what the product is, the problem it
   solves, the buyer, the pain, the voice, the proof.
2. **Domain** → `vani_tenant_domain`
3. **People** → `vani_membership`
4. **Model** → `vani_llm_provider`. A default provider already exists; BYOK is a
   later field on the same step, not a later step.

**`user_profile` and `business_profile` are NOT the Smart Profile.** They capture
name, mobile, designation, industry — registration detail. Useful, required, and
completely separate. Do not report onboarding progress as though they were part
of it; that was the specific mistake, and it read as "half done" when the half
that carries meaning had not started.

Competitor research, vocabulary clusters and SearXNG are therefore **on** the
path, as sub-steps of mission wizard — not off it. What remains true is that they
are blocked on infrastructure (LLM reachability, the worker, headless crawl for
JS sites, the `gt_tenant_brand` migration), so they are expensive, not optional.

Steps 2–4 cost almost nothing by comparison: pure declarations, no LLM, no
worker, no queue. Their screens, writers, engine and gate are built and sit
behind `enabled: false` in `backend/src/onboarding/lanes.ts`, waiting on one
`\dt vani_*` to confirm the `vani_` spine is applied.

Environmental failures found on the Main VPS while scoping this are recorded in
**`vanigtm/CLAUDE.md`** under "Main VPS — known broken, DEFERRED", including one
genuine open bug (the event queue has no stale-row reclaim, so a dying worker
orphans its in-flight events — which can trap a user behind a blocking UI).
Note and move on; do not fix those while onboarding is unfinished.

One decision is pending on Charan: the pre-2026-08-17 `vani-backend` image was
built from an uncommitted working tree, so code referencing `gt_tenant_brand`
exists in no branch. It survives only as the
`vikuna/vani-backend:pre-onboarding-20260817` image tag on the VPS. Commit it
from local before the next rebuild, or it is gone.

## VaNi console engineering standards

Work under `vani-app/` is governed by **`vani-app/CLAUDE.md`** — read it before
touching that folder. It is mandatory, not advisory, and covers: the five states
every screen owes the user (loading, error, empty, content, outcome) via
`<DataBoundary>` and `useToast`, the loader taxonomy, writes through
`useSkillMutation` with double-submit guards and idempotency keys, race
conditions, what two-phase commit does and does not mean in a UI, and the
registry boundary.

Loader and toast APIs there are deliberately identical to VaNiGTM's
(`FullPageLoader`, `InlineLoader`, `sm|md|lg`, `showToast({message, type})`), so
code moves between the repos without edits. Keep them aligned.

**We own the UI and the backend, so features land on both sides in one slice.**
Two rules follow and are enforced, not aspirational:

- **Idempotency** — the client mints and sends `Idempotency-Key`; the VaNiGTM
  handler **stores the key with its result and replays it** on a repeat, in the
  same transaction as the write. A write endpoint shipped with only the client
  half is unfinished, and a key nothing honours is worse than no key: the UI
  then looks safe to retry when it is not.
- **Two-phase commit** — multi-step writes that must not half-apply are **one
  transaction in VaNiGTM**, not a sequence the UI orchestrates. One endpoint per
  atomic outcome. Where an external system genuinely sits in the middle, model
  it as prepare → confirm with staged rows that are never visible as committed.
  The UI never reports success until the whole operation confirms.

## Architecture

Single-page marketing site: React 18 + TypeScript + Vite, styled with Tailwind. `src/main.tsx` mounts `<App/>` inside `BrowserRouter`; `src/App.tsx` wires `ThemeProvider` around the routes — `/` (a composed `HomePage` made of section components from `src/components/vikuna/`), `/assessment` (client-side AI readiness quiz with a soft-gate lead form), `/mvp`, `/training`, `/playbooks/why-ai-fails`, and `/preview[/:name]` (internal gallery of unmounted section components, noindexed). Deploy target is Vercel (production deploys from `main` to `www.vikuna.io`); `vercel.json` rewrites all non-asset paths to `/index.html` (SPA fallback) and holds outbound redirects for `/bcl-*` marketing links.

Lead capture: client-side forms POST JSON to n8n webhooks on `n8n.srv1096269.hstgr.cloud` (`bcl2025-lead` live; `assessment-lead` and `playbook-lead` referenced by the React forms — workflows must exist in n8n for delivery to happen; the UI succeeds gracefully regardless). One Calendly link site-wide: `calendly.com/connect-vikuna/30min`.

Import alias: `@/*` maps to `src/*` (declared in both `tsconfig.json` and `vite.config.ts` — keep them in sync).

### Theming (config-driven, not runtime)

The site's look is switched by editing a single constant, not by a user toggle:

- `src/config/theme/themeRegistry.ts` exports `ACTIVE_THEME` (currently `'dark-editorial'`). Changing this string swaps the site-wide theme on next build.
- Available themes live in `src/config/theme/themes/*.ts` and must satisfy the `Theme` interface in `src/config/theme/types.ts` (palette, typography, spacing fn, radii, shadows, transitions).
- `ThemeProvider` (`src/context/ThemeContext.tsx`) seeds context from `getActiveTheme()`; consume with the `useTheme` hook from `src/hooks/useTheme.ts`. `setTheme` exists but nothing in the UI calls it — treat theme as build-time configuration.
- When adding a theme: create the file under `themes/`, register it in the `themes` map in `themeRegistry.ts`, then point `ACTIVE_THEME` at its key.

### Components

- `src/components/vikuna/` — page section components (Hero, Problem, Differentiator, Industries, CaseStudies, Footer, StickyCTABar, ExitIntentPopup, SEOHead, AssessmentPage, etc.). `HomePage` in `App.tsx` is the authoritative order — reorder/add/remove sections there. Several files have `_bak`, `copy`, or duplicated names (`HeroSection.tsx` vs `HeroSectionNew.tsx`, `ProductSection_bak.tsx`); check what `App.tsx` actually imports before editing.
- `src/components/ui/` — small shadcn-style primitives (`button`, `card`, `input`, `progress`, `textarea`) built with `class-variance-authority` and the `cn()` helper.
- `src/lib/utils.ts` — `cn()` = `twMerge(clsx(...))`. Use it for conditional Tailwind classes rather than string concat.
- `.unused-components/` at the repo root is a parking lot (CRO/SEO experiments) — not compiled, safe to ignore unless resurrecting something.

### Hooks and cross-cutting concerns

`src/hooks/` holds `useSEO`, `useCRO`, and `useAnalytics` alongside `useTheme`. `useAnalytics` reads `import.meta.env.VITE_GA_MEASUREMENT_ID` and expects a global `gtag` — GA tag is injected outside the bundle. Any new env vars must be prefixed `VITE_` to be exposed to the client.

### Static assets and public routes

`public/` ships as-is: standalone HTML landers (`assessment-page.html`, `training-page.html`, `vani-page.html`, `iceberg-visual.html`, the `bcl2025/` and `bcl-offers/` folders) live beside the SPA and are served at their paths thanks to the `vercel.json` rewrite excluding anything containing a dot. `public/generate-seo-files.js` is a build-time helper for SEO artifacts, not part of the app bundle.

**`public/proposals/` — client proposals, one self-contained HTML file each,
shared with a prospect by link.** Naming is `<client-slug>.html`, so
`/proposals/gp-stores.html`. Three things hold for every file added here:

- **Keep it self-contained.** No build step touches `public/`, so the page must
  carry its own CSS and JS inline. Google Fonts is the only external reference
  the existing one makes.
- **`vercel.json` sends `X-Robots-Tag: noindex, nofollow, noarchive` and
  `Cache-Control: no-store` for `/proposals/(.*)`.** The noindex is because
  these are commercial documents marked Confidential; the no-store is because a
  proposal gets revised before a meeting and a cached copy at a shared URL is
  the wrong version in front of a client. Put `<meta name="robots">` in the page
  too — the header covers the fetch, the meta covers a saved copy.
- **Do NOT add `Disallow: /proposals/` to `robots.txt`.** It reads like the
  safer choice and is the opposite: a Disallow stops the crawler fetching the
  page, so it never sees the noindex, and the URL can still be listed
  contentless if anyone links it. The note in `robots.txt` says the same thing
  at the point someone would make the change.

There is deliberately **no index page** for the folder. `/proposals/` has no
dot, so the SPA rewrite catches it and serves the homepage — no directory
listing of every prospect's pricing. Note the flip side: file names are
guessable, so anyone who tries `<competitor>.html` may hit a real proposal. If
that matters for a particular client, give that file an unguessable slug.

### TypeScript / lint posture

`tsconfig.json` is strict with `noUnusedLocals` and `noUnusedParameters` on — dead imports/params break the build. ESLint enforces `react-hooks/recommended` and `react-refresh/only-export-components`; `dist` is ignored. `npm run lint` treats warnings as errors, so fix or explicitly disable them.
