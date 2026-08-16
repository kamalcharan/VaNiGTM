# vani-app — build plan & methodology

**Written:** 2026-08-16 · companion to `vani-app-migration-plan.md`

Sequence: **core UX layer → auth/signup → onboarding → Vara → the rest, slowly.**

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

## P0 · Core UX layer

The shell and nothing else. No business functionality, no auth.

- Design tokens from the Org OS prototype — teal on near-black, distinct from
  the marketing site.
- App shell: nav, layout, routing, error and empty states, toasts.
- `platform/registry.ts` — skills declare routes, nav entries and required roles
  into it; the shell renders *from* the registry, never a hardcoded list.
- The generic skill transport, ported from `useSkillQuery`, with a **mock
  adapter** behind it.
- A dev-only "signed in as" switch so the shell can be built before auth exists.

**Exit criteria:** a throwaway demo skill can be added as one folder plus one
registry line and appears in the nav, with no diff inside `platform/`.

## P1 · Auth / signup

- Port `api-client`: access token in memory only, refresh token in the httpOnly
  cookie, `silentRefresh()` on mount, exactly one 401 retry.
- Login, logout, session restore across reload and cold tab.
- Remove the dev-only switch from P0 in the same slice it becomes redundant.

**Prerequisites on the VPS — none of these are optional:**
- SSL certificate on `api.vikuna.io`. The config is HTTP-only today, and the
  refresh cookie is `secure` in production, so it will not set over HTTP.
- `vani.vikuna.io` added to the `map $http_origin` allowlist.
- `/api/v1/auth/` allowlisted (already present in the config as written).

**Open conflict to settle before building signup:** VaNiGTM exposes
`/api/v1/auth/register`, but the VaNi Platform spec says v1 is
operator-provisioned with no self-serve tenant signup. Those cannot both be
true. Decide which before a signup screen is designed.

**Exit criteria:** reload keeps the session, a cold tab keeps the session, logout
revokes server-side, and a wrong password is indistinguishable from an unknown
account.

## P2 · Onboarding

The platform lane from the spec — the once-per-tenant declarations (stories
VN-10 … VN-13):

- Org profile and domain verification.
- Industry / domain-pack binding — declared once, delegated to every agent.
- Users, memberships, role families.
- Per-agent role grants from each agent's declared catalog.
- BYO LLM provider credentials, verified by test call.

**Exit criteria:** a tenant is declared once and an agent activating afterwards
re-asks none of it.

## P3 · Vara

The first agent through the integration contract, and the proof the contract
works.

- Agent registration: role catalog (`ta`, `hm`, `calibration_approver`), metering
  unit types, template set, pack namespace, activation checklist.
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
| SSL + CORS entry on `api.vikuna.io` | P1 | Infrastructure, not code |
| Signup vs operator-provisioned | P1 | Spec and code currently disagree |
| Which Vara UX prototype is canonical | P3 | Two in `docs/vani/`, same screens |
| Where the public funnel lives | Deleting `frontend/` | `/a/[slug]` and `/r/[token]` have live users and are the only reason VaNiGTM's frontend is still deployed |

## Not in scope

Platform-level orchestration engine, cross-agent knowledge graph / UNS, billing
execution — all explicitly deferred by the platform spec. The UI should not
imply they exist.
