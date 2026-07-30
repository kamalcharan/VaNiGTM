# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR.
- `npm run build` — type-check the project (`tsc --noEmit`) and produce a production bundle in `dist/`.
- `npm run build:skip-check` — build without the TypeScript pass (use only when intentionally shipping despite type errors).
- `npm run lint` — ESLint over `.ts`/`.tsx` with `--max-warnings 0`; a single warning fails the run.
- `npm run preview` — serve the built `dist/` locally.

There is no test runner configured — the "test" step for changes is `npm run build` + `npm run lint`.

## Architecture

Single-page marketing site: React 18 + TypeScript + Vite, styled with Tailwind. `src/main.tsx` mounts `<App/>` inside `BrowserRouter`; `src/App.tsx` wires `ThemeProvider` around two routes — `/` (a composed `HomePage` made of section components from `src/components/vikuna/`) and `/assessment`. Deploy target is Vercel; `vercel.json` rewrites all non-asset paths to `/index.html` (SPA fallback) and holds outbound redirects for `/bcl-*` marketing links.

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

### TypeScript / lint posture

`tsconfig.json` is strict with `noUnusedLocals` and `noUnusedParameters` on — dead imports/params break the build. ESLint enforces `react-hooks/recommended` and `react-refresh/only-export-components`; `dist` is ignored. `npm run lint` treats warnings as errors, so fix or explicitly disable them.
