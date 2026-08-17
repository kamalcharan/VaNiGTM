# Onboarding — one agent, two tiers

**Written:** 2026-08-17 · spans `vani-app/` (this repo) and `kamalcharan/VaNiGTM`

Onboarding is an **agent**. It owns the engine; it owns no content. Each
*subject* declares the lane it wants run, and the engine runs any lane handed to
it.

```
Onboarding agent
  ├─ engine     resolve lane → read status → render step → complete → next
  └─ lanes      declared elsewhere, never built in
       product lane   subject = the organisation      VN-10 … VN-13
       agent lane     subject = (tenant, agent)       shipped with the agent
```

That separation is the point. If the engine knew about Vara, adding Nova would
mean editing the engine — the thing "agents extend, never modify" exists to
prevent. Instead an agent ships its lane with itself, and neither the engine nor
`platform/` changes.

Adding an agent's lane is:

1. a lane object in that agent's folder,
2. one `registerLane()` line in `src/skills/onboarding/lanes/index.ts`,
3. its steps in VaNiGTM's `backend/src/onboarding/lanes.ts` catalog.

---

## Storage: no new tables

`vn_tenant_onboarding` (migration 005) already exists, and its own comment says
step_id is "a convention-based identifier … Products can define their own
steps". So the lane lives in the identifier, not in a new column:

| step_id shape | lane |
|---|---|
| no colon — `user_profile` | the legacy GTM lane |
| `vani:<key>` | the VaNi product lane |
| `<agent>:<key>` | that agent's activation lane |

`step_id` is `VARCHAR(50)`; the whole namespaced id must fit.

The **agent tier's lane state** additionally has a home already:
`vani_tenant_agent.status` runs `provisioned → activating → live`. Per-step
progress goes in `vn_tenant_onboarding` under the `<agent>:` prefix; the lane's
overall state is that column.

### Why nothing is seeded, and why that matters

VaNiGTM's `frontend/src/components/auth/login-vault.tsx:72` routes on
`tenant.onboarding_complete`, which `/api/v1/auth/me` computes as **the count of
every pending onboarding row for the tenant**.

So seeding pending `vani:` rows at registration would push every existing GTM
tenant into their mission wizard and keep them there, because their UI never
completes a `vani:` step. That is a live product, and this is not a hypothetical.

The design that avoids it:

- **Reconcile on read.** `/status?lane=` compares the server catalog against
  stored rows. A pending step is an *absence*, not a row.
- **Insert on complete.** Rows are written only when a step is completed, so
  they are always `status='completed'` and never add to the pending count.

Consequences, all good: `/me` is untouched, no backfill migration is needed, and
a tenant created before a step existed picks it up the next time they open the
lane.

The product lane's first two steps reuse the GTM lane's **bare** ids
(`user_profile`, `business_profile`) on purpose — they are the same facts, so a
VaNi tenant satisfies both lanes rather than being asked twice.

---

## Two-phase commit, applied

A step both writes its data and marks itself done. Those must not half-apply:

- profile saved, step not marked → the user is asked again, and edits what they
  already entered;
- step marked, profile not saved → the org has a gap nothing will ever ask
  about again, and every agent inherits it.

So it is **one endpoint, one transaction**: `PATCH /api/v1/onboarding/step`
carries the step's payload, applies it, and upserts the completion inside the
same `BEGIN`/`COMMIT`. The UI never sequences two calls.

## Idempotency, applied

This endpoint is idempotent **by construction** rather than by a stored key:

- the completion is an upsert on the unique `(tenant_id, step_id)`,
- the payload writes are field assignments, not inserts with generated ids.

Replaying a request therefore produces the same row and the same response. **No
key store is needed here** — and that is not a general result. The first
endpoint that inserts a row with a generated id will need real store-and-replay,
which is a schema change to raise then, not to pre-build now.

---

## The enforcement gate

`RequireSession` gates on `needsOnboarding`, derived from `tenant.onboarding_complete`
in the `/me` payload the bootstrap already fetches — so the gate costs no extra
round trip, and the runner corrects itself against the lane when it loads.

- Signed out → `/login`
- Signed in, lane incomplete → `/onboarding`
- Signed in, lane complete → through

`/onboarding` lives in its own route group, **outside the console shell**, so a
gated tenant cannot click into the nav and wander a product they have not
finished declaring themselves to.

**There is no "skip for now".** A skipped declaration is a gap every agent
inherits and nothing asks about again. The escape is signing out, which the
runner always offers — a wizard that can trap someone is worse than no wizard.

Absent `onboarding_complete` is treated as **done**, deliberately: a missing
field must never lock a tenant out of the product.

---

## Status

| Piece | Where | State |
|---|---|---|
| Lane catalog | `VaNiGTM backend/src/onboarding/lanes.ts` | done |
| `GET /status?lane=` | `VaNiGTM backend/src/onboarding/onboarding.routes.ts` | done, reconcile-on-read |
| `PATCH /step` | same | done, one transaction, upsert |
| Engine | `vani-app/src/skills/onboarding/screens/OnboardingRunner.tsx` | done, lane-agnostic |
| Product lane | `vani-app/src/skills/onboarding/lanes/product.ts` | 2 of 5 steps live |
| Gate | `vani-app/src/platform/shell/RequireSession.tsx` | done |
| nginx allowlist | `docs/vani/nginx/api.vikuna.io.conf` | **needs applying on the VPS** |

### The three steps that are declared but not required

`vani:domain`, `vani:team` and `vani:llm_provider` are in the server catalog with
`enabled: false`. They write to the `vani_` platform spine —
`vani_tenant_domain`, `vani_membership`, `vani_llm_provider` — and **it is not
confirmed that `docs/vani/sql/001_vani_platform.sql` has been applied to
`vani_gtm_db`.** There is no live DB access from a Claude session to check.

Enabling a step whose table may not exist would trap every tenant behind a step
they can never complete, which is exactly what the gate makes unforgivable. So
they are declared, designed, and off.

**To turn them on:** confirm the spine is applied, flip `enabled` to `true`, add
each screen to `lanes/product.ts`, and add its writer to `applyStepPayload()`
inside the existing transaction. Nothing else changes.

VN-12 (per-agent role grants) is deliberately **not** in the product lane: a
grant needs an agent's declared role catalog, so it belongs to that agent's
activation lane.

---

## Verified

Fifteen checks against the production build, walking the lane end to end on the
mock transport: rail and progress render, the console shell is absent, sign-out
is present, both steps validate locally before any call, step 1 advances to step
2 with progress updating, industry is required, the completion screen and toast
fire once, and it auto-advances to `/dashboard`. No overflow at 390px.

**Not verified:** anything against the live API. The sandbox proxy blocks
`api.vikuna.io`. The first real run needs the nginx entries above.
