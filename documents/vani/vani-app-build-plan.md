# vani-app — build plan & methodology

**Written:** 2026-08-16 · companion to `vani-app-migration-plan.md`

Sequence: **core UX layer → auth/signup → onboarding → Vara → the rest, slowly.**

---

## Where we are — 2026-08-17

| Phase | Status |
|---|---|
| **Infrastructure** | **Done.** `vani.vikuna.io` on Vercel, `api.vikuna.io` on the VPS with TLS, nginx origin allowlist and CORS verified end to end from the public internet. Closed — see the VPS runbook. |
| **P0 · Core UX layer** | **Done.** Shell renders from the registry, generic transport with a mock adapter, 15 routes declared (3 live, 12 planned), zero-platform-change test proven. |
| **Consolidation** | **Done** (unplanned, added because the seam leaked). One VaNi surface: the story, sign-in and console all live at `vani.vikuna.io`. Marketing `/vani` and `vani-page.html` deleted and redirected. |
| **P1 · Auth** | **In progress.** Gated signup, login redirect, session guard and real sign-out are in and verified. Remaining: the live skill transport, and a first registration against the real API. |
| **P2 · Onboarding (VaNi tenant lane)** | **Built, not merged.** Onboarding is an agent — one engine, product and agent lanes. Product lane: 2 of 5 steps live, gate enforcing, verified on the mock. See `onboarding-architecture.md`. Held off `main` pending the live transport and the nginx entries |
| P3 · Vara | Not started |

Two things changed the plan as written below: the theme decision (the console
carries vikuna.io's palette and fonts, not the Org OS teal that P0 specified),
and the consolidation (the public VaNi story moved *into* the console app, so
`vani-app` is no longer console-only).


Settled architecture: the UX layer lives in this repo under `vani-app/`, deploys
to Vercel as `vani.vikuna.io`. Backend, worker and database stay on the VPS.
VaNiGTM's frontend is discarded; its backend is the API.

---

## Why UX-first is safe here

Building screens before the wiring usually produces screens the API cannot feed.
It is safe in this case because of one property of the existing system:
`useSkillQuery(skill, fn, params)` is a **generic transport**. Every skill is
reached by naming a skill and a function — there is no per-skill plumbing.

That gives us a seam. Screens are built against a mock adapter behind the same
interface, and switching to the live backend is a transport swap, not a rewrite.
The seam is the methodology's load-bearing element; everything below depends on
keeping it intact.

## The seven rules

1. **Contract before screen.** No screen begins without knowing its
   `(skill, function, params)`. If the backend function does not exist yet, the
   function is specified first — the screen does not invent one.
2. **Mock, then wire.** Every screen ships first against the mock adapter, then
   flips to live. A flip that requires touching the screen means the seam leaked.
3. **No bespoke endpoints.** Auth is the *only* non-generic surface. The moment a
   skill gets its own REST endpoint, the two-repo split starts costing what
   two-repo splits normally cost.
4. **One nginx allowlist entry per skill.** A skill is not migrated until its
   path is allowlisted on `api.vikuna.io`. Per-skill, never `/api/v1/skills/` —
   that narrowness is the only thing keeping 18 skills off the public internet.
5. **The zero-platform-change test.** Adding a skill or agent is one folder plus
   one registry line. If it needs an edit inside `platform/`, that is a platform
   change request — logged and decided, not worked around. This mirrors the
   database invariant the platform spec already enforces: agents extend, never
   modify.
6. **Vertical slices, not horizontal layers.** Ship one skill end to end rather
   than all the components, then all the hooks, then all the screens.
7. **Done means done.** A slice is complete when: screens exist, they are wired
   live, the nginx entry is in, roles are declared, it works at 390px, and
   `git diff platform/` is empty.

---

## P0 · Core UX layer — DONE

The shell and nothing else. No business functionality, no auth.

- ~~Design tokens from the Org OS prototype — teal on near-black, distinct from
  the marketing site.~~ **Superseded.** The console carries vikuna.io's palette
  and three faces instead: one brand across both domains, because the move from
  site to console has to be invisible. Accent rule: orange is the action, gold
  identifies VaNi.
- App shell: nav, layout, routing, error and empty states, toasts.
- `platform/registry.ts` — skills declare routes, nav entries and required roles
  into it; the shell renders *from* the registry, never a hardcoded list.
- The generic skill transport, ported from `useSkillQuery`, with a **mock
  adapter** behind it.
- A dev-only "signed in as" switch so the shell can be built before auth exists.

**Exit criteria:** a throwaway demo skill can be added as one folder plus one
registry line and appears in the nav, with no diff inside `platform/`.

## P1 · Auth (login / logout / signup) — IN PROGRESS

**Signup is in, behind a gate.** Operator-provisioned was never the same thing
as operator-typed. Whoever is given the shared access phrase creates their own
tenant from the UI; whoever is not never sees the form. That keeps provisioning
deliberate without putting a person in the middle of every account.

The flow: `/login` → "Create an organisation" → `/gate` → phrase → `/signup` →
201 with a session → `/dashboard`. Registration returns tokens and sets the
refresh cookie, so a new user is signed in on the spot rather than bounced back
to the login screen to retype what they typed ten seconds ago.

**What the gate is not: a security boundary.** The check runs in the browser and
the guard on `/signup` is client-side, so the phrase is stored as a SHA-256
digest — enough that reading the bundle does not hand it over, not enough to
stop someone determined. `POST /api/v1/auth/register` is open on the API
regardless of what the UI does. It is a front door, not a lock. The real fix is
a server-issued invite code checked inside `register()`, which is backend work
in VaNiGTM and is logged below rather than faked in the client.

### Contract, read from source not assumed

Verified against `backend/src/auth/auth.routes.ts` and `auth.service.ts` in
`kamalcharan/VaNiGTM`. Two mismatches were found in the ported client and fixed;
either one alone would have made a correct password fail silently:

- `/login`, `/register` and `/refresh` answer `{ tokens: { access_token, … } }`.
  The client read `data.access_token` — top-level, where nothing is. Now read
  through one `readAccessToken()` so the shape lives in a single place.
- Errors are `{ error: { code, message } }`, an object. The client expected
  `error` to be a string, so every server message was discarded and replaced by
  the generic fallback.

`register` creates a **new tenant per signup**: `vn_tenants` row, profile,
owner/admin/planner roles, first user as owner, and a `TENANT_REGISTERED` event.
Validation is name 2–100, valid email, password 8–128 with at least one
uppercase and one digit — mirrored live on the form so a 400 is never how
someone learns the rules.

### Gap ledger

| # | Gap | Status |
|---|---|---|
| 1 | Login redirected to `/home`, a route that does not exist | **fixed** — goes to `/dashboard`; a correct password used to land on a 404 |
| 2 | No route guard on the console | **fixed** — `RequireSession` waits for the bootstrap to resolve, then redirects. Stands down when `NEXT_PUBLIC_API_ORIGIN` is unset, so UX work continues without a backend |
| 3 | Sign out did not sign out | **fixed** — calls `logout()`, revokes server-side, clears the query cache, then leaves |
| 4 | Transport hardwired to the mock | **open, and now a PREREQUISITE.** The onboarding gate cannot ship to production on the mock: the mock cannot persist a completion, so `/me` would keep reporting the lane incomplete and every new signup would loop back into the wizard. Merging onboarding to `main` is blocked on this |
| 5 | `isLoading` computed and never consumed | **fixed** — consumed by the guard, which is what stops a signed-in user being bounced on every reload |
| 6 | Response-shape mismatches (above) | **fixed** |
| 7 | Org name and slug hardcoded in the shell | **fixed** — from `/api/v1/auth/me`, falling back while unauthenticated |

### Verified

Fifteen checks against the production build: the login → gate → signup path;
`/signup` typed directly bounces to `/gate`; a wrong phrase is rejected without
navigating and clears the field; the phrase tolerates case and surrounding
space; password rules light up as they are met; name and email are validated
before any network call; the gate persists within a tab and a new session is
re-gated; the console still renders with no API origin; 390px does not overflow.

Not verified, and cannot be from here: an actual signup against the live API.
The sandbox proxy blocks `api.vikuna.io`, so the first real registration is
yours to run.

### Settled — operator-provisioned, now with a gated UI

The platform spec's position (VN-01) is unchanged in substance: accounts are not
public. What changed is who does the typing.

The `vn_tenants` / `vani_tenant` split is **not resolved by this** and is now
more visible, not less. `register()` writes `vn_tenants`/`vn_tenant_profiles`;
the platform layer reads `vani_tenant`, and `vani_tenant_agent` has a foreign
key to it. A tenant created through the gate can sign in and use the console,
but cannot have an agent subscribed to it — nothing surfaces that until someone
tries to activate Vara. Reconciling the two is backend work in VaNiGTM and is
P2's blocker.

**Exit criteria:** reload keeps the session, a cold tab keeps the session, logout
revokes server-side, a wrong password is indistinguishable from an unknown
account, no console route renders without a session, and a gated signup produces
a working tenant.

## P2 · Onboarding — BUILT, NOT MERGED

Onboarding is an **agent**: one engine, and lanes declared by their subjects.
Full design and the reasoning behind every storage choice is in
**`onboarding-architecture.md`** — read that before touching it. Summary:

- **Two tiers, one mechanism.** `?lane=` selects the subject. Product lane for
  the organisation; an agent's lane when that agent activates. Adding an agent's
  lane is a `registerLane()` line — no diff in the engine, none in `platform/`.
- **No new tables.** The lane lives in `step_id` (`vani:`, `<agent>:`), which is
  what migration 005 says that column is for.
- **Nothing seeded.** GTM's login routes on `onboarding_complete`, which counts
  every pending row — so pending `vani:` rows would trap live GTM users in their
  mission wizard. Reconcile on read, insert on complete. `/me` untouched.
- **One transaction per step.** Payload and completion commit together.
- **Idempotent by construction.** Upsert on `(tenant_id, step_id)`; no key store
  needed for this endpoint, and the code says why that does not generalise.
- **The gate has no skip.** Sign-out is the escape, and the runner always offers it.

Live: `user_profile` (VN-11), `business_profile` (VN-10). Declared but disabled:
`vani:domain`, `vani:team`, `vani:llm_provider` — they write to the `vani_` spine
and it is not confirmed that spine is applied to `vani_gtm_db`. VN-12 belongs to
an agent lane, not here.

### Blocked on two things before it can merge to `main`

1. **The live skill transport** (P1 gap 4). On the mock a completion cannot
   persist, so `/me` keeps saying the lane is incomplete and a new signup loops
   back into the wizard. This is why gap 4 stopped being optional.
2. **nginx allowlist** — `/api/v1/onboarding/` and `/api/v1/tenant/`. Already in
   `docs/vani/nginx/api.vikuna.io.conf`; needs applying on the VPS. Without them
   the browser gets the catch-all 404.

Backend lives on `kamalcharan/VaNiGTM` branch **`claude/onboarding-agent`** — not
merged there either, since it is a live backend.

**Exit criteria:** a tenant is declared once, and an agent activating afterwards
re-asks none of it — the spec's "one declaration, N projections" invariant, made
observable.

## P3 · Vara

The first agent through the integration contract, and the proof the contract
works.

- Agent registration: role catalog (`ta`, `hm`, `calibration_approver`), metering
  unit types, template set, pack namespace, activation checklist.
- **Vara's own onboarding** — its activation lane and readiness gate, the second
  tier of onboarding and the template every later agent follows.
- Screens: JD and versions, candidates, applications, the ranked shortlist, the
  probability map, calibration.
- State changes go through `vara_transition()` — the guarded function is the only
  way `vara_application.state` moves.

**Exit criteria — this is the real test of everything above:** Vara's activation
required **zero** changes inside `platform/`. If it did not, the contract is not
yet real and the gap is fixed before P4 begins.

## P4+ · The rest, slowly

One skill per slice, each bringing its own nginx entry, its own registry
declaration and its own folder. `ls skills/` answers what has moved.

---

## Decisions that block phases

| Decision | Blocks | Note |
|---|---|---|
| ~~SSL + CORS entry on `api.vikuna.io`~~ | — | **Done** — verified externally, see the VPS runbook |
| ~~Signup vs operator-provisioned~~ | — | **Settled: operator-provisioned.** No signup in v1 |
| ~~Where the VaNi story lives~~ | — | **Settled: in `vani-app`.** Two copies drifted; the marketing route and static page are deleted and redirected |
| ~~A live VaNi credential on the VPS~~ | — | **Resolved by the gate.** Accounts are now created from the UI by anyone holding the access phrase |
| Server-side invite codes | Nothing yet | The gate is client-side and `/register` is open on the API. Backend work in VaNiGTM; worth doing before the phrase circulates widely |
| Which tenant table is authoritative | P2 | `vn_tenants` (what `register()` writes) vs `vani_tenant` (what the platform reads). Backend work in VaNiGTM; P1 does not touch it |
| Which Vara UX prototype is canonical | P3 | Two in `docs/vani/`, same screens |
| Where the public funnel lives | Deleting `frontend/` | `/a/[slug]` and `/r/[token]` have live users and are the only reason VaNiGTM's frontend is still deployed |

## Not in scope

Platform-level orchestration engine, cross-agent knowledge graph / UNS, billing
execution — all explicitly deferred by the platform spec. The UI should not
imply they exist.
