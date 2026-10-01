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

## VaNi — not here

This folder is the marketing website (www.vikuna.io) and nothing else. Since
2026-10-01 it lives inside VaNiGTM next to the API (`backend/`) and the
console (`vani-app/`). For anything VaNi — product, console, database, deploy
— read the repo root's `CLAUDE.md`, `HANDOVER.md` and `DEPLOY.md`, and
`vani-app/CLAUDE.md` for console work. The rule that no table, column, enum
or index is added without Charan's approval holds here as everywhere.

The VaNi sections that used to sit here (handover pointer, database-approval
rule, scope discipline, console standards) are in git history and the
`pre-consolidation-2026-10-01` tag of kamalcharan/vikunawebsite.

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
