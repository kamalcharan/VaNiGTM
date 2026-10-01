# vani-app — vani.vikuna.io

The VaNi product UI. Deploys to **Vercel**; the API and database stay on the
**VPS**. Self-contained: its own dependency tree, its own Vercel project. The
marketing site at the repo root is untouched by anything in here.

See `docs/vani/vani-app-migration-plan.md` for what moves from VaNiGTM and when.

## Stack

Next.js 16 (App Router) + React 19 — deliberately matching VaNiGTM's frontend
so components, hooks and providers port 1:1 as functionality transitions,
rather than being rewritten at the moment they move.

## Run it

```bash
npm install
npm run dev     # http://localhost:3100
npm run build
npm run lint    # tsc --noEmit
```

## NEXT_PUBLIC_API_ORIGIN

The browser calls `api.vikuna.io` **directly**. `vani.vikuna.io` and
`api.vikuna.io` share the registrable domain, so they are same-site and the
`SameSite=Strict` refresh cookie is sent without any proxy.

An earlier draft proxied `/api/*` through Vercel; that was rejected on review
because it replaces the browser origin with Vercel's, defeating the origin
allowlist in `deploy/vani-main-vps/api.vikuna.io.conf`.

```
NEXT_PUBLIC_API_ORIGIN=https://api.vikuna.io
```

Requires on the VPS side: an SSL cert on `api.vikuna.io`, and `vani.vikuna.io`
added to that config's `map $http_origin` allowlist.

## Vercel setup

- **Root Directory:** `vani-app`
- **Framework:** Next.js (auto-detected)
- **Environment:** `VANI_API_ORIGIN`
- **Domain:** `vani.vikuna.io`

## What exists (P0)

The UX layer on mock data. No auth yet — P1 adds it.

- `platform/registry.ts` — the four Org OS nav groups. The shell renders from
  it and holds no hardcoded destinations.
- `lib/useSkill.ts` — the generic transport, ported from VaNiGTM's
  `useSkillQuery`, with `lib/mock-transport.ts` behind it.
- Live screens: Dashboard, All Agents, Runs & Traces.
- Planned routes render an honest not-yet state from a catch-all — **no page
  file needed**.
- Login exists but is not wired into the console until P1.

### Adding a skill

One folder under `src/skills/` and one line in `src/skills/index.ts`. Nothing in
`src/platform/` changes — that is the test, and it is verified rather than
assumed. A *live* screen additionally needs a thin `page.tsx` under
`app/(console)/` re-exporting it; a *planned* one needs nothing.

## Conventions carried over from VaNiGTM

- Access token in memory only; refresh token in an httpOnly cookie.
- `silentRefresh()` on every mount is what makes reloads survive.
- No component builds a URL — everything goes through the service registry.
- Auth errors stay generic; distinguishing "no such user" from "wrong password"
  is how account enumeration starts.
