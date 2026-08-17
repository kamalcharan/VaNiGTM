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
| **P1 · Auth** | **Next.** Code is written but not connected — see the gap list below. |
| P2 · Onboarding (VaNi tenant lane) | Not started |
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

## P1 · Auth (login / logout) — NEXT

**The code is written; it is not connected.** `api-client.ts`, `auth-provider.tsx`
and `login-form.tsx` all exist and are correct in shape — token in memory,
refresh cookie httpOnly, `silentRefresh()` on mount, exactly one 401 retry,
generic error on every failure. What is missing is the wiring between them and
the console, and each gap is small and specific:

| # | Gap | Where | Why it matters |
|---|---|---|---|
| 1 | Login redirects to `/home`, a route that does not exist | `components/auth/login-form.tsx` | A correct password currently lands on a 404. The registry has `/dashboard`, not `/home`. |
| 2 | No route guard on the console | `app/(console)/layout.tsx` | `/dashboard` renders for anyone. An unauthenticated visitor should be sent to `/login`, and a signed-in one arriving at `/login` sent on to `/dashboard`. |
| 3 | Sign out does not sign out | `app/(console)/layout.tsx` | `onSignOut` pushes to `/` without calling `logout()`, so the server session and the refresh cookie both survive. |
| 4 | Transport is still hardwired to the mock | `app/(console)/layout.tsx` | `setSkillTransport(mockTransport)` at module scope. Needs a live transport posting to the skill endpoint, selected by config — the swap the seam exists for. |
| 5 | Bootstrap has no loading state | `context/auth-provider.tsx` | `isLoading` is computed and never consumed. Without it the console flashes signed-out on every reload before the silent refresh resolves. |

Order matters: 1–3 make the loop closeable, 5 makes it not flicker, 4 is the
first real use of the transport and can follow.

**Prerequisites on the VPS — all met.** TLS on `api.vikuna.io`, `vani.vikuna.io`
in the `map $http_origin` allowlist, `/api/v1/auth/` allowlisted. Verified
externally over the public internet; preflight returns `204` with the origin
echoed exactly. Nothing infrastructural blocks this phase.

**Settled — operator-provisioned, no signup screen in v1.** The platform spec's
position stands (VN-01: the operator creates the tenant and issues a wizard link
to the named Tenant Admin). `/api/v1/auth/register` is not wired into the UI.

That was the right call for a reason beyond policy: `register()` writes to
`vn_tenants`/`vn_tenant_profiles`, while the platform layer reads `vani_tenant`.
`vani_tenant_agent` has a foreign key to `vani_tenant(id)`, so a self-signed-up
tenant could never have an agent subscribed to it — and nothing would surface
that until someone tried to activate Vara. Reconciling those two tenant records
is real backend work in VaNiGTM, and it is now sequenced deliberately rather
than forced by a half-built screen.

**A live credential is needed to finish this phase.** Because signup is
operator-provisioned, there is no way to create an account from the UI — the
exit criteria cannot be demonstrated until one user exists in the VaNi tenant on
the VPS and its password is known to whoever verifies.

**Exit criteria:** reload keeps the session, a cold tab keeps the session, logout
revokes server-side, a wrong password is indistinguishable from an unknown
account, and no console route renders without a session.

## P2 · Onboarding — the VaNi tenant lane

Onboarding is **two tiers**. This phase builds only the first: the VaNi tenant
lane, declared once per organisation. Each agent brings its own activation lane
later, inside that agent's own phase (spec Flow F1 step 3) — so Vara's
onboarding is P3's work, not this one's.

The once-per-tenant declarations (stories VN-10 … VN-13):

- Org profile and domain verification.
- Industry / domain-pack binding — declared once, delegated to every agent.
- Users, memberships, role families.
- Per-agent role grants from each agent's declared catalog.
- BYO LLM provider credentials, verified by test call.

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
| A live VaNi credential on the VPS | P1 exit criteria | Operator-provisioned means no account can be made from the UI. One user in the VaNi tenant, password known to the verifier |
| Which tenant table is authoritative | P2 | `vn_tenants` (what `register()` writes) vs `vani_tenant` (what the platform reads). Backend work in VaNiGTM; P1 does not touch it |
| Which Vara UX prototype is canonical | P3 | Two in `docs/vani/`, same screens |
| Where the public funnel lives | Deleting `frontend/` | `/a/[slug]` and `/r/[token]` have live users and are the only reason VaNiGTM's frontend is still deployed |

## Not in scope

Platform-level orchestration engine, cross-agent knowledge graph / UNS, billing
execution — all explicitly deferred by the platform spec. The UI should not
imply they exist.
