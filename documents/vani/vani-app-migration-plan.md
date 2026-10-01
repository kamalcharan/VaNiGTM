# vani.vikuna.io — UI split from VaNiGTM

**Written:** 2026-08-16 · against `kamalcharan/vanigtm` @ `e494974` (main)

Target: a VaNi UI at `vani.vikuna.io` deployed on Vercel, with backend and
database staying on the VPS. Build the UX first; transition functionality
slowly. Login/logout is the base slice.

---

## 1. What VaNiGTM actually is

Read before planning any move — the two halves are not equally portable.

| | Stack | Portability |
|---|---|---|
| `frontend/` | **Next.js 16 App Router, React 19**, TanStack Query, CSS Modules, lucide-react | Components and hooks port cleanly. App Router pages, route groups and `'use client'` do not survive a move to Vite. |
| `backend/` | **Express 5, pg, jsonwebtoken, bcryptjs, cookie-parser, zod**, Anthropic SDK | Stays on the VPS. Nothing to move. |

Note the mismatch that governs everything below: **vikunawebsite is React 18 +
Vite; VaNiGTM's frontend is React 19 + Next.js.** They are not the same app and
should not be forced into one.

## 2. The auth layer, as built

Genuinely well-designed — worth keeping rather than reinventing.

- **Access token in memory only** (`_accessToken`), never localStorage.
- **Refresh token in an httpOnly cookie**, rotated on every refresh.
- `silentRefresh()` runs on every app mount to restore the session across
  reloads, new tabs and cold starts.
- `apiFetch` retries once through `silentRefresh()` on a 401.
- `serviceURLs.ts` is a single endpoint registry — no `.tsx` file builds a URL.

**19 auth endpoints exist.** The base slice needs four:

| Endpoint | Purpose |
|---|---|
| `POST /auth/login` | credentials → access token + refresh cookie |
| `POST /auth/refresh` | rotate; the cookie carries it |
| `POST /auth/logout` | clears cookie, revokes the DB session |
| `GET /auth/me` | user + tenant hydration |

The other fifteen (register, invite, team, sessions, forgot/reset password,
switch-env, onboarding, profile) are **out of the base slice** — they come with
the functionality that uses them.

## 3. ⚠ The deployment decision that is easy to get wrong

`backend/src/auth/auth.routes.ts:34` sets the refresh cookie with:

```js
httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'strict'
```

`SameSite=Strict` plus a host-only cookie means **the refresh cookie is not sent
on a cross-site request**. Split UI and API naively and the symptom is nasty:
login appears to work, then every reload silently logs the user out, because
`silentRefresh()` never receives the cookie.

Three ways out, in order of preference:

1. **Proxy the API through Vercel (recommended).** A rewrite sends
   `vani.vikuna.io/api/*` to the VPS. The browser only ever sees one origin, so
   the cookie is first-party, `SameSite=Strict` keeps working untouched, and
   **there is no CORS at all**. No backend change required.
2. **Put the API on a `vikuna.io` subdomain** (`api.vikuna.io`). Same *site*, so
   Strict still passes, but it needs `CORS_ORIGIN=https://vani.vikuna.io` and
   `credentials: 'include'` on every call.
3. **Relax to `SameSite=None; Secure`.** Works from any origin, but it is a real
   weakening of CSRF posture and should be the last resort.

Option 1 also means the VPS never needs a public CORS surface.

## 4. What moves, and when

### Moves now — the base slice
| From VaNiGTM | Notes |
|---|---|
| `lib/api-client.ts` | Token store, `silentRefresh`, 401-retry. Port nearly as-is. |
| `lib/serviceURLs.ts` | Trim to the four auth endpoints; keep the registry pattern. |
| `context/auth-provider.tsx` | Drop the theme-sync effect (that is a later concern). |
| `components/auth/login-vault.tsx` | 413 lines + 941 lines of CSS Module. Port the shape; restyle to the Org OS tokens. |

### Moves later — with the functionality that needs it
Skills, agent-core, the assessment flow, onboarding wizard, team/invite
management, session management, env switching, theme sync.

### Never moves
`backend/` in its entirety, migrations, the worker, and anything touching
`vani_gtm_db`. Those are VPS concerns and stay there.

## 5. Stack recommendation for the new UI

**Next.js 16, matching VaNiGTM exactly** — not Vite.

The whole point of this exercise is to transition VaNiGTM functionality over
time. On Next, every component, hook and provider moves 1:1. On Vite, each one
gets rewritten at the moment it moves, and the work is paid twice. Vercel is
also Next's native deployment target.

The cost is a second framework in this repository, which is acceptable because
the app is fully self-contained in its own folder with its own dependency tree
and its own Vercel project (Root Directory = the app folder). The marketing site
build is untouched.

If the app outgrows the folder, it should become its own repository — the folder
layout deliberately does not prevent that.

## 6. Phases

- **P0 — Shell and login/logout UX.** The four auth endpoints, the API proxy,
  the Org OS design tokens, an authenticated shell with a working logout. No
  business functionality.
- **P1 — Session truth.** Verify refresh survives reload and a cold tab against
  the real VPS. This is where the cookie decision proves itself; do not build on
  top until it holds.
- **P2 onward — One skill at a time**, each bringing its own endpoints from the
  registry. Nothing moves without its API contract moving with it.

## 7. Open questions

- Where does the API actually terminate today — a `vikuna.io` subdomain, a bare
  VPS IP, or the Hostinger host? The answer decides between options 1 and 2 above.
- Does `vani.vikuna.io` become a second Vercel project on this repo, or its own
  repo? Recommended: second project now, own repo when it earns it.
- Which of the two Vara UX prototypes in this folder is current (see README).
