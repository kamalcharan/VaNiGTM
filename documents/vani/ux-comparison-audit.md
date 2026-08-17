# UX comparison audit — Org OS prototype vs VaNiGTM

**Written:** 2026-08-16 · to settle what the first delivery is
**Compared:** `VaNi Org OS — interactive prototype` (proposed) against
`kamalcharan/vanigtm` @ `e494974` frontend (built, live)

---

## 1. What each one actually is

| | Org OS prototype | VaNiGTM frontend |
|---|---|---|
| Views | Landing, Login, **Signup**, App | Landing, Login, Register, Forgot/Reset, Invite |
| Nav groups | 4 — Organization, Workspace, Agents, System | 5 — Today, Brain, GTM, Nova, Settings |
| Nav items | 15 | ~19 |
| Dashboard | Activity feed + agent cards | `/today` — Ideal Customer, Your Agents, Storytelling, Outreach *(coming soon)*, Sequences *(coming soon)* |
| Onboarding | Platform lane (org, slug, provider) | `/brain/mission` — Mission Wizard, full-screen |
| Responsive | Desktop only | Sidebar rail + mobile header + 5-tab bottom nav |
| Component library | None — single HTML file | `vdf/` — sidebar, loader, error screen, metric label, benchmark bar |

### Org OS navigation
```
Organization   Dashboard · Smart Profile · Knowledge · Knowledge Graph
Workspace      Accounts (46) · Contacts · Orders & Invoices · Content
Agents         All Agents (4) · Aria·GTM · Nova·Digital · Ledger·O2C · Add agent
System         Runs & Traces (2) · Settings
```

### VaNiGTM navigation
```
Today
Brain      Mission Wizard · Teach VaNi · Knowledge
GTM        Build the audience · Put them in motion · Research · Prospects ·
           VaNi Leads · People · Journeys
Nova       Fix the digital estate · Run a campaign
Settings   Settings · Import Data · Import Dashboard · Common Pool ·
           Reports · Demo Data
```

---

## 2. The finding that matters most

**Org OS is agent-centric. VaNiGTM is function-centric.**

Org OS gives every agent a first-class destination and adds a marketplace row
("Add agent"). VaNiGTM organises by functional area — GTM, Nova, Brain — that
happen to be agent-backed.

The Org OS shape is the one that matches the platform spec: agents register into
a fabric, declare their own role catalogs and metering units, are separately
priced, and are activated or deactivated per tenant. VaNiGTM's navigation
predates that architecture and cannot express it — there is nowhere to *add* an
agent, and no per-agent surface to activate or suspend.

**Adopt the Org OS information architecture.** It is not a nicer skin on the same
product; it is the navigation the platform spec implies.

## 3. What the prototype has that VaNiGTM lacks

- **Runs & Traces.** The observability surface. The platform spec already
  mandates the machinery — one `vani_audit_log` across agents, `actor_type` never
  "model" — and `gt_agent_runs` / `gt_events` already exist because the worker
  writes them. This is the biggest capability gap in the current product and it
  is largely buildable today.
- **An agent marketplace.** "Add agent" is per-agent commerce made visible. VaNiGTM
  has no concept of it.
- **`org://` scoping.** Every agent carries an explicit scope
  (`org://vikuna/accounts/**`). That reads as the UI expression of the spec's
  tenant isolation, and it makes agent permissions legible.
- **Signup.** The prototype collects org name and slug — a real tenant-creation
  flow.

## 4. What VaNiGTM has that the prototype lacks

Do not discard these when moving to the new IA:

- **Responsive layout.** Mobile header, 5-tab bottom nav, hover-to-expand rail.
  The prototype is desktop-only; the product is not.
- **A component library.** `vdf/` is real and reusable — loader, error screen,
  metric label, benchmark bar.
- **Data ingestion.** Import, import dashboard, common pool, demo data. Unglamorous
  and load-bearing.
- **Honest empty states.** `/today` already ships "coming soon" tiles rather than
  pretending. Keep that habit.

## 5. Settled decisions

**Settled:** VaNi is the head — the orchestrator. Each agent sits under it with its
own goals, its own role catalog and its own metering. **Vara is the first agent;
others are built later.**

That resolves what looked like a naming clash. The prototype's four agents were
illustrative, not a commitment — its "Dean · Org Orchestrator" is VaNi itself,
and Aria / Nova / Ledger are placeholders for agents not yet built. Vara's
absence from the prototype was never a contradiction.

So the Agents group is buildable now: **VaNi** at the head, **Vara** beneath it,
and an **Add agent** row for what follows. Only one naming question is left, and
it is cosmetic rather than blocking — whether the orchestrator row reads "VaNi"
or carries a separate name of its own.

**Settled — onboarding is two tiers, not two products.** The onboarding built
now is the **VaNi tenant lane**: the once-per-tenant declarations in the platform
spec (VN-10 … VN-13) — org profile, domain verification, industry pack binding,
users and memberships, the role-family graph, per-agent role grants, and the BYO
LLM provider.

**Every agent then carries its own onboarding**, which is exactly Flow F1 step 3
in the spec: subscribe, run the agent's own activation lane, pass its declared
readiness gate, go live. VaNiGTM's Mission Wizard is not a rival to the platform
lane — it is an agent-level lane that belongs *after* it, and it becomes the
template for how each agent onboards.

So Vara's onboarding is part of Vara's phase, not part of P2.

**Signup — two conflicts, and the second is the serious one.**

*Policy.* The spec's out-of-scope callout says "self-serve public tenant signup
(operator-provisioned in v1)", and VN-01 has the operator creating the tenant and
issuing a wizard link to the named Tenant Admin. `/api/v1/auth/register` does the
opposite: unauthenticated, takes `tenant_name`, creates tenant + profile + user in
one transaction and returns tokens — the caller is logged straight in. There is no
invite code, no allowlist, no domain check and no approval step; the tenant is
written `status: 'active'` with `activated_at: now()`.

*Schema — the one that bites.* `register()` inserts into **`vn_tenants`** /
`vn_tenant_profiles`, the legacy schema. The platform spec's tenant is
**`vani_tenant`**, net-new in `001_vani_platform.sql`, whose header states it
"coexists with legacy VN_/GTM tables; no history is migrated". They are unrelated
tables.

So a signup screen built against `/register` today succeeds, and lands the user in
a tenant the platform layer cannot see. `vani_tenant_agent` has a foreign key to
`vani_tenant(id)`, so **no agent could ever be subscribed to that tenant** — no
pack binding, no role families, no per-agent grants, no audit spine rows. The
failure is invisible until someone tries to activate Vara.

That is a wiring gap, not a preference. Either `/register` also creates the
`vani_tenant` row, or registration moves to the platform layer — both backend work
in VaNiGTM, which would put P1's critical path on the VPS side.

**Settled: operator-provisioned for v1.** No signup screen is built. Not because
self-serve is wrong long-term, but because the two tenant records have to be
reconciled either way, and under deadline pressure from a signup screen is the
worst moment to decide which table is the source of truth.

*(Smaller tell of the same lineage: `register()` hardcodes tenant type `'mfd'` —
mutual fund distributor, left over from the KI-Prime/ProKey era.)*

---

## 6. Recommended first delivery

Adopt the Org OS information architecture, ship only the frames that are real,
and take VaNiGTM's responsive patterns with you.

**In:**
1. **Shell** — sidebar with the four Org OS groups, plus VaNiGTM's mobile header
   and bottom nav. Rendered from `platform/registry.ts`, never a hardcoded list.
2. **Dashboard** — the prototype's activity feed and agent cards, fed by mock data
   behind the generic transport.
3. **Runs & Traces, read-only** — the highest-value surface that already has a
   backend, and the one that proves the audit spine. Low risk: it only reads.
4. **Every other nav item registered but rendering an honest "not yet"** — the
   habit `/today` already has.

**Also in, now that the agent model is settled:** the Agents group — VaNi at the
head, Vara beneath it, Add agent below. Vara's own screens stay at P3; this is
the group and its frames only.

**Out of the first delivery:**
- Onboarding — it is P2, and it needs the platform lane decided first.

**Already done and reusable:** the `/vani` marketing landing page and the login
screen both exist in `vani-app/`. The login page needs its API prefix corrected
to `/api/v1/auth/…` and its transport pointed at `api.vikuna.io` directly rather
than proxied.

**Exit criteria for delivery one:** a demo skill can be added as one folder plus
one registry line and appears in the nav; the shell works at 390px; and
`git diff platform/` is empty after adding it.
