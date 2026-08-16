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

## ⚠ VANI_API_ORIGIN is required for auth to work

`next.config.ts` proxies `/api/*` to the VPS. This is not a convenience — it is
load-bearing. VaNiGTM issues its refresh token as an httpOnly cookie with
`SameSite=Strict`, which a browser will not send on a cross-site request. Proxy
it and the cookie stays first-party, Strict keeps working, and the VPS needs no
public CORS surface.

Set it in the Vercel project (and `.env.local` for local work):

```
VANI_API_ORIGIN=https://api.vikuna.io
```

Unset, no rewrite is registered and auth calls fail closed with "The VaNi
service is not configured for this deployment" rather than leaking to a wrong
host.

## Vercel setup

- **Root Directory:** `vani-app`
- **Framework:** Next.js (auto-detected)
- **Environment:** `VANI_API_ORIGIN`
- **Domain:** `vani.vikuna.io`

## What exists (P0)

Login, logout, session restore across reloads, a guarded shell, a placeholder
home. No business functionality — that arrives one skill at a time, each
bringing its own endpoints into `src/lib/serviceURLs.ts`.

## Conventions carried over from VaNiGTM

- Access token in memory only; refresh token in an httpOnly cookie.
- `silentRefresh()` on every mount is what makes reloads survive.
- No component builds a URL — everything goes through the service registry.
- Auth errors stay generic; distinguishing "no such user" from "wrong password"
  is how account enumeration starts.
