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

## 5. Three conflicts to settle before the nav is built

**Agent names disagree across every source.**

| Source | Agents |
|---|---|
| Org OS prototype | Dean (Orchestrator), Aria (GTM), Nova (**Digital**), Ledger (O2C) |
| Platform spec | Vara (Talent) first, Nova (**Marketing**) next |
| VaNiGTM nav | GTM, Nova |
| Build plan | Vara is P3 |

Nova exists in two of them with different roles, and **Vara — the agent with a
full specification, data model and migrations — does not appear in the prototype
at all.** The Agents group is the spine of the new navigation; it cannot be built
on names that disagree.

**Onboarding is two different products.** VaNiGTM's Mission Wizard teaches an
agent. The spec's platform lane declares an organisation — profile, domains,
industry pack binding, users, role families, per-agent grants, LLM provider.
The spec's version is the one the architecture requires; the Mission Wizard is
an agent-level step that should sit *after* it.

**Signup contradicts the spec.** The prototype has a signup view, VaNiGTM ships
`/register`, and the platform spec says v1 is operator-provisioned with no
self-serve signup. Three sources, two answers.

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

**Out of the first delivery:**
- The Agents group beyond a placeholder, until the naming is settled.
- Signup, until the operator-provisioned question is answered.
- Onboarding — it is P2, and it needs the platform lane decided first.

**Already done and reusable:** the `/vani` marketing landing page and the login
screen both exist in `vani-app/`. The login page needs its API prefix corrected
to `/api/v1/auth/…` and its transport pointed at `api.vikuna.io` directly rather
than proxied.

**Exit criteria for delivery one:** a demo skill can be added as one folder plus
one registry line and appears in the nav; the shell works at 390px; and
`git diff platform/` is empty after adding it.
