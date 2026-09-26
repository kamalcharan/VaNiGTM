@AGENTS.md

# vani-app — non-negotiables

These are not style preferences. Each one is here because its absence has
already cost something, or because breaking it costs data.

---

## 0. Where development happens

**Skeleton phase: develop and test against the deployed stack —
`vani.vikuna.io` → `api.vikuna.io`. Local-first development is deliberately
deferred.** The decision is Charan's, taken 2026-08-17 after a local-backend
attempt cost most of a session: the backend was up (`/health` ok, VPS Postgres
at 129ms) and the CORS preflight passed with the right origin, and the browser
still failed the login `fetch` at the network layer. While the surface is this
thin, the deployed path works and the local path costs more than it returns.

What that means in practice:

- Ship to the branch, merge, let Vercel and the VPS rebuild, test there.
- The **mock transport** (no `.env.local`) remains the right mode for pure UI
  work — states, layout, the onboarding pathway — and needs no backend at all.
- Do not spend session time on the localhost↔VPS path unless asked. When it is
  picked up again, everything below is still accurate and still applies.

---

## 0b. Local gotchas, for when local development is picked back up

**`next-env.d.ts` flips between dev and build.** `next dev` rewrites its imports
to `./.next/dev/types/…`; `next build` writes `./.next/types/…`. The committed
form is the BUILD one, because that is what Vercel produces. If it shows up
dirty after running the dev server, `git checkout -- vani-app/next-env.d.ts` —
do not commit the dev variant, and do not "fix" the file, which says not to edit
it.

**The variable is `NEXT_PUBLIC_API_ORIGIN`, and getting the name wrong fails
silently.** VaNiGTM's frontend uses `NEXT_PUBLIC_API_URL`; this app reads
neither that nor anything else. With the wrong name nothing throws —
`transport.ts` selects the **mock** transport and `RequireSession` stands down —
so the app looks like it is running against the API when it is talking to
nobody. If live data is not appearing, check the name before anything else.

**Localhost cannot hold a session against the live API — and that is about the
domain, not the port.** The refresh cookie is `sameSite: 'strict'` and `secure`
(VaNiGTM `auth.routes.ts`). `vani.vikuna.io` → `api.vikuna.io` share the
registrable domain `vikuna.io`, so they are same-site and Strict sends the
cookie. `localhost` → `vikuna.io` is cross-site: the browser will not send the
cookie, and cannot store it over `http://` because of `secure`. Separately,
nginx's `map $http_origin $cors_origin` defaults to `""`, so `localhost` is not
in the allowlist at all. Ports are irrelevant to SameSite — `localhost:3100` ↔
`localhost:3002` is same-site.

> **`CORS_ORIGIN` must be `http://localhost:3100`.** This table said `:3000` and
> that one wrong digit cost a full session's debugging. `npm run dev` here is
> `next dev --port 3100`, and VaNiGTM matches `CORS_ORIGIN` as an **exact
> string** (`backend/src/server.ts:25`), so `:3000` silently fails every browser
> preflight. It is not detectable by curl: `cors` with a string origin always
> returns 204 and echoes the *configured* value, so a probe that sends
> `Origin: http://localhost:3000` always looks like a pass. Compare the ACAO
> against the origin the browser really sends. Full write-up:
> `docs/vani/HANDOVER-2026-08-17.md` §5.

| Mode | Setup | What you get |
|---|---|---|
| **Mock** (default) | no `.env.local` | Whole UI including the onboarding pathway. No backend, no session. The right mode for UI work |
| **Local backend, local database** | `NEXT_PUBLIC_API_ORIGIN=http://localhost:3002`; run `vani-backend` locally with `NODE_ENV=development`, `CORS_ORIGIN=http://localhost:3100`, `DB_PRIMARY` → a local Postgres migrated with `npm run db:migrate` + `npm run db:seed` | **Everything, auth included** — verified end-to-end in a browser. The mode to develop in. Recipe in §5 of the handover |
| Local backend, VPS database | as above but `DB_PRIMARY` → the VPS Postgres | Same, *if* you can reach port 5432. **Not possible from a Claude web session** — outbound 5432 is blocked by the network policy |
| Live API, session-less | `NEXT_PUBLIC_API_ORIGIN=https://api.vikuna.io` + `"~^http://localhost(:\d+)?$"` added to nginx's `map $http_origin` | Real data on the in-memory token, but logged out on every reload — `silentRefresh()` cannot see the cookie. Making it persist would mean env-gating `sameSite`/`secure` in VaNiGTM, i.e. weakening the production cookie for a dev convenience. Decide that deliberately, do not drift into it |

If `npm run dev` reports `'next' is not recognized`, run `npm install` inside
`vani-app/` — it has its own lockfile, separate from the repo root.

---

## 1. Every screen carries the same five

A screen is not done until all five are handled. Four of them are handled *for*
you — reach for the helper rather than hand-rolling the state, because
hand-rolled states are how screens end up disagreeing with each other.

| State | How |
|---|---|
| **Loading** | `<DataBoundary skeleton={…}>`. Route-level fallback already exists at `app/(console)/loading.tsx` |
| **Error** | `<DataBoundary>` — includes the retry button and shows the server's own message |
| **Empty** | `<DataBoundary isEmpty={…} empty="…">`. "No data" and "not loaded" must never look alike |
| **Content** | the `children` render prop |
| **Outcome** | `useToast()` — every write says something, success or failure |

```tsx
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';

<DataBoundary
  query={q}
  label="agents"                       // used in every state's copy
  skeleton={<SkeletonRows rows={4} />}  // shape-matched, so nothing jumps
  isEmpty={(d) => !d?.agents?.length}
  empty="Agents appear here once registered."
>
  {(d) => d.agents.map(…)}
</DataBoundary>
```

**Why a boundary and not four `if`s:** `success: false` arrives with **HTTP
200**. The transport wraps every skill call in `{ success, data, error }`, so a
skill can refuse while the request itself is fine. Checking only `isError`
renders an empty screen and calls it success. The boundary checks both. So
must anything that does not use it.

**Ported screens need VaNiGTM's tokens defined, or their loaders vanish.** The
mission wizard and everything under `platform/vdf/` is written against
VaNiGTM's `--color-*` / `--font-*` names, injected there at runtime by a
ThemeScript this app does not have. Undefined custom properties do not fall
back — the browser discards the whole declaration. That shipped once: the
live-progress spinner is `border: 2px solid var(--color-primary-dim)` with
`border-top-color: var(--color-primary)`, so both being undefined meant no
border, an invisible spinner, and four minutes of research that looked frozen.
The aliases live in `src/styles/globals.css`; after porting any screen, check
every `var(--…)` it uses resolves before judging how it looks.

Loaders come in three kinds, and picking the wrong one is a real defect:

- **Known shape** (list, table, counters) → `Skeleton*`. No layout jump.
- **Action in flight** (a button working) → `Spinner` / `InlineLoader`.
- **First paint of a route** → `VaniLoader`.

`FullPageLoader`, `InlineLoader` and their `sm | md | lg` sizes are
**API-identical to VaNiGTM's `frontend/src/components/loader.tsx`**, and
`VaniLoader` mirrors `VdfLoader`. Keep them that way — code moves between these
repos, and a diverged signature turns a copy-paste into a debugging session.
`useToast().showToast({ message, type, duration, dismissible })` matches
VaNiGTM's toast for the same reason.

Never `console.log` an error and move on. A silent failure is worse than a loud
one: users resolve silence by clicking again, and that is how duplicate writes
get made.

---

## 2. Writes go through `useSkillMutation`. Always.

`useSkillQuery` reads; **anything that changes state** uses `useSkillMutation`,
which supplies four guarantees you would otherwise have to remember every time:

1. **No double submit** — refused at a ref, not at `isPending` state. Two calls
   in the same tick both read stale state; a ref does not. Disabling the button
   is a courtesy, not the guarantee.
2. **Idempotency key** — one key per logical attempt, reused across retries of
   that attempt, sent as `Idempotency-Key`.
3. **No stale writes** — a response arriving after a newer attempt started, or
   after unmount, is dropped. Late responses silently resurrect old state.
4. **It always says something** — success and failure both raise a toast.

### Idempotency — enforce it on BOTH sides

We own the UI and the backend. A write path is **not finished** until both
halves exist:

- **Client** — `useSkillMutation` mints one key per logical attempt, reuses it
  across retries of that attempt, and sends it as `Idempotency-Key`. Free; you
  get it by using the hook.
- **Server** — the handler in VaNiGTM must **store the key with its result and
  replay that result** on a repeat, inside the same transaction as the write.
  Not a uniqueness check bolted on afterwards: store-and-replay, so the second
  call returns the first call's answer rather than a conflict error.

Do not ship a write endpoint with only the client half. A key that nothing
honours is worse than no key, because the UI then looks safe to retry when it
is not. If you are adding a write, the backend change lands in the same slice.

**Current state:** the client half is in; **VaNiGTM does not honour the header
on any endpoint yet.** So until the first server-side implementation lands,
still do not tell a user a write is safe to retry, and do not auto-retry.
Retrofitting the existing write paths is tracked in the build plan.

### Two-phase commit — enforce it in the database

Multi-step writes that must not half-apply are **one transaction in VaNiGTM**.
`BEGIN`, all of it, `COMMIT`. The UI cannot make two HTTP calls atomic, so it
must never be asked to: if a flow needs four things to happen together, that is
one endpoint and one transaction, not four calls the UI sequences.

When you are writing the backend:
- One endpoint per atomic outcome. Do not expose the steps separately and hope
  the client calls them in order.
- Use `withTenantClient` so `set_config(..., is_local := true)` stays inside the
  transaction — it is transaction-scoped on purpose and survives pgBouncer
  transaction pooling.
- Where a genuine two-phase shape is needed (an external system in the middle),
  model it explicitly: a **prepare** call that stages and returns something
  inspectable, then a **confirm** call that commits. Staged rows carry their own
  status; they are never visible as committed.

When you are writing the UI:
- Never report success until the whole operation confirms. A per-step toast
  during a multi-step write reads as a commit that has not happened.
- Show what is about to happen before it happens, wherever prepare → confirm
  applies.
- If a step fails mid-flow, say precisely what did and did not happen. "Failed"
  after three of five steps sends people looking in the wrong place.

---

## 2b. UX preview — screens built before their backend

GTM's screens (Sprint 2, 2026-09-22) call skill functions that do not exist on
the API yet; the fixture decides the shape and the backend meets it later.
Because development happens against the deployed stack (§0), the live
transport answers those calls from the fixtures — **only** the ones listed in
`src/lib/preview.ts`, **only** stamped `preview: true`, and **only** with the
PREVIEW badge shown (`gtm-shell/PreviewBadge`). A function leaves the list
the day its backend lands, and a missing handler fails loudly again.

This is a declared exception to rule 12, not a fallback: it does not kick in
on failure, it is not per-request, and nothing on the screen pretends the
data is real. Never add a function to the list to cover a backend gap; add it
because the screen exists before the backend does, and say so in that skill's
`INTEGRATION.md`.

## 3. Race conditions

Assume every response can arrive late, out of order, or after the user has
moved on.

- **Queries** — TanStack Query keys by `['skill', skill, fn, params]` and
  discards superseded results. Do not bypass it with a bare `fetch` in an
  effect; that is the pattern with no ordering guarantee at all.
- **Mutations** — guaranteed by `useSkillMutation` (above).
- **Effects that set state** — check a mounted ref, or use the query layer.
- **Auth bootstrap** — `RequireSession` waits for `isLoading` to clear before
  deciding. Redirecting on `!isAuthenticated` alone bounces a signed-in user to
  `/login` on every reload, because the silent refresh has not resolved yet.
- **Anything server-rendered** — no `Math.random()` and no `Date.now()` in
  render. Server and client must agree or hydration breaks. Skeleton widths
  vary by index for exactly this reason.

---

## 4. The database is not yours to extend

**No new tables, columns, enums or indexes without Charan's explicit approval.**
Not "it's only one column". Not a helper table. Not a cache table.

Use what the specs and the running system already define:

- `docs/vani/sql/001_vani_platform.sql` — the 16 `vani_` platform tables
- `docs/vani/sql/002_vara_agent.sql` — Vara's `vara_` tables
- `docs/vani/sql/003_vara_learning_functions_seed.sql` — calibration, the
  guarded `vara_transition()`, DPDP purge, seed
- `docs/vani/vara-data-model-v1.0.html` — the authoritative model
- VaNiGTM's `vn_*` tables — the running application schema

If the model does not support what you are building, that is a **schema change
request**: state what is missing and why the existing model cannot carry it,
then wait. Do not work around it with a column, and do not work around it by
stuffing structured data into an existing JSONB field either — that is a schema
change wearing a disguise.

Invariants that outrank any convenience, from the platform spec:

- **Agents extend, never modify.** `vani_` tables never grow agent-specific
  columns. An agent ships its own prefixed tables plus registry declarations.
- **`model` is never a legal audit actor.** `actor_type` is
  `human | rule | timer | system`, enforced in the database. Rules close only on
  knockouts; timers expire only closing windows; system routes but never decides.
- **Append-only** for audit, comms log, metering and pack versions. The DPDP
  purge function is the single sanctioned bypass, and it audits itself.
- **Audit payloads reference ids, never raw PII** — that is what lets a purge
  leave the audit spine intact.
- **One declaration, N projections.** A tenant states a fact once at the
  platform; agents receive a delegation and never re-ask.

There is no live database access from a Claude session — `.mcp.json` configures
`gtm-postgres` but `GTM_MCP_BASIC` has never been set. Every schema claim must
be traced to a migration file or the spec, never to memory or a guess.

---

## 5. The registry boundary

Adding a skill or agent is **one folder under `src/skills/` and one line in
`src/skills/index.ts`**. If it needs an edit inside `src/platform/`, that is a
platform change request — logged and decided, not worked around. This is the UI
expression of "agents extend, never modify", and it is the stated test of the
integration contract.

**Logged platform changes** (decided, not worked around):

- **2026-09-22 — the agent journey.** `SkillModule` gains a `journey`
  declaration (ordered steps, each with a *done* predicate over data the
  console already reads) and `platform/pathway/` gains `AgentJourney`, the
  read-only renderer every agent landing and the dashboard's per-agent cards
  use. Approved by Charan; rationale and consumers in
  `docs/gtm-ux-poa.md` §2.4b. Lands in GTM Sprint 2 with Vara's landing moved
  onto it in the same change.
- **2026-09-26 — `SkillRoute.adminOnly`.** One optional boolean on the route
  declaration. The common pool is cross-tenant data only Vikuna's own tenant
  (`vn_tenants.is_admin`) may read or feed, and a destination the server
  answers with a 403 should not sit in every tenant's sidebar. The shell that
  renders a catalog filters on it (GtmShell does; the console shell has no
  admin-only route yet); the server still gates every call. Charan asked for
  the common pool as an admin surface; this is the smallest platform change
  that lets a skill declare one.

---

### The onboarding gate asks the lane, not `/me`

`/me` derives `onboarding_complete` from
`count(*) FROM vn_tenant_onboarding WHERE status != 'completed') = 0`. That
counts **rows**, so a tenant with **no rows counts as complete**. The lane's
`/api/v1/onboarding/status` reconciles the catalog instead, where an **absent row
is a pending step**. They disagree precisely where it matters, and it reached
production: a tenant created before registration began seeding steps signed in
and landed in the console with nothing onboarded.

`RequireSession` therefore gates on **either** signal saying incomplete — `/me`
as a free fast pre-signal (a fresh signup has two seeded `pending` rows and is
blocked with no extra request), the lane as the authority.

**Do not "fix" `/me`'s count to match.** It is shared with the GTM frontend, and
`GTM_LANE` carries the same two bare step ids, so making that count
catalog-aware would abruptly gate live GTM tenants who have no rows. Lane
awareness belongs per lane, in the lane's own endpoint — that is the point of
the lane model.

Two states the gate must keep separate, both learned the hard way:

- **Undecided.** While the lane query is in flight the answer is not "complete".
  Rendering children there is what let an un-onboarded tenant see the console
  for a beat before the redirect.
- **Refused.** `success: false` arrives with HTTP 200. The gate fails **open** to
  `/me`'s answer on an error or refusal, rather than trapping every user behind
  a transient 500.

## 6. Auth surface

- Access token **in memory only** — never `localStorage`, never a readable
  cookie.
- Refresh token is an httpOnly cookie the app never reads.
- Calls go **direct to `api.vikuna.io`** with `credentials: 'include'`. Do not
  proxy through Vercel: it replaces the browser origin and defeats the nginx
  origin allowlist.
- Response envelopes are `{ tokens: { access_token } }` and
  `{ error: { code, message } }`. Read them through `readAccessToken()` and
  `readError()`; both shapes have already been got wrong once, silently.
- Auth is the **only** non-generic surface. No skill gets its own REST endpoint.
- Sign-in errors stay generic. Distinguishing "no such user" from "wrong
  password" is how account enumeration starts.
- The signup gate in `lib/gate.ts` is a **front door, not a lock** — client-side,
  and `/api/v1/auth/register` is open on the API regardless. Do not describe it
  as access control.
