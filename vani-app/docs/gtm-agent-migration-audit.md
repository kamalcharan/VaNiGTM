# Migrating VaNiGTM `frontend/` into vani-app as the GTM agent — audit

**Date:** 2026-09-22 · **Status:** audit only, nothing moved yet.

Charan, 2026-09-22: *"vaniGTM - frontend ... this should now come into vani-app
as a GTM agent -- do audit to migrate ... note --- onboarding is there so match
apples to apples."*

## Why this is a deviation worth naming

`vani-app` renders **VaNi · Orchestrator** and **Vara · Talent** as the two
agents. Vara is live. VaNi is `status: 'planned'` with no page — while the
entire GTM product (audience, journeys, people, pulses, war room) sits in
`VaNiGTM/frontend/`, an app that is retired, not deployed, and reachable by
nobody.

So the console today shows a tenant an orchestrator that does nothing and hides
the product that does. The deviation is not that GTM was built wrong; it is that
GTM has no home in the console, and "VaNi" got used for three different things
(see §7).

## 1. The number that decides the shape of this

| | lines |
|---|---|
| `frontend/src/app/(app)` — 31 pages | 13,449 |
| `frontend/src/components` | 14,663 |
| `frontend/src/hooks` | 919 |

**~29k lines**, of which `components/vdf` alone is 5,981 across 65 files. This
is not a lift-and-shift. It is a per-pathway port, and the audit below is
ordered so each slice ships something a tenant can use.

## 2. The good news: the call layer is already identical

`useSkillQuery` / `useSkillMutation` have the **same signature in both apps**
and both reach the same generic executor (`POST /api/v1/skills/:skill/:fn`).

```
frontend:  useSkillQuery<T>(skill, fn, params, options?)
vani-app:  useSkillQuery<T>(skill, fn, params = {}, options?)
```

**So page logic ports without touching a single call site.** What changes is
imports and the component layer. Two differences to respect, both in vani-app's
favour:

- vani-app's `useSkillMutation` takes `{ successMessage, errorMessage, onSuccess }`
  and mints an `Idempotency-Key`; frontend's takes raw react-query options and
  has no idempotency. Ported writes adopt vani-app's — that is the repo rule,
  not a preference (`vani-app/CLAUDE.md`).
- frontend converts `success: false` into a thrown `ApiError`. vani-app returns
  it as data and the screen renders a failure state. **The ported screen must
  handle `success: false` explicitly** — this is the exact bug that made JD
  Studio show nothing, twice.

## 3. The VDF gap — 11 components, all small

vani-app already has `src/platform/vdf/`: `VdfButton`, `VdfCard`, `VdfInput`,
`VdfPageHeader`, `VdfKpiCard`, `VdfKgLoader`, `VdfApprovalCard`,
`VdfReadinessRing`, `VdfMissionMemory`, `VdfMissionArtifact`, `VdfWizard`,
`VdfErrorScreen`, plus `PathwayShell` and the `feedback` set (toast,
DataBoundary, loader, skeleton).

Used by `(app)` pages and **not yet ported**, by usage count:

| Component | uses | note |
|---|---|---|
| `VdfBadge` | 27 | trivial |
| `VdfEmptyState` | 17 | must carry a next action (rule 9b) |
| `VdfStatusBadge` | 14 | trivial |
| `VdfStatCard` | 12 | `VdfKpiCard` may already cover it — check before porting |
| `VdfMissionSection` / `MissionChips` / `MissionRows` | 13 | wizard-only; may not be needed outside it |
| `VdfDrawer` | 7 | |
| `VdfModal` | 5 | `StructureDialog` in vara-onboarding is the native `<dialog>` pattern to copy |
| `VdfInsightsCard` | 4 | |
| `VdfSearchBar` | 3 | |
| `VdfToggleGroup` | 2 | |
| `VdfTabs` | 1 | |

`VdfLoader` (24 uses) maps to `platform/feedback`'s loader — same API by
design, no port needed.

## 4. Page-by-page: what moves, what is already here, what is dead

### Already ported — do NOT port again
| frontend page | lines | vani-app |
|---|---|---|
| `brain/mission` | 1,913 | `skills/onboarding/screens/MissionWizard.tsx` (2,013) — same seven step ids: company, vocabulary, competitors, icp, brand, role, type |
| `brain/mission/icp-builder` | 552 | `skills/onboarding/screens/icp-builder/` (553) |

**This is the apples-to-apples point.** The Mission Wizard IS step 1 of the
Smart Profile, and it is already in vani-app's **onboarding** skill, with
`smart-profile` as the read-back surface. A GTM agent must deep-link into those,
never re-implement them, or there are two editors for one field.

### Real pages with a live backend — the migration
| frontend page | lines | backend | pathway |
|---|---|---|---|
| `gtm/audience/find` | 1,591 | research-skill (17 fn), prospect-skill (7) | G1 |
| `gtm/audience/qualify/[ref]` | 612 | research-skill, prospect-skill | G1 |
| `gtm/people` + `[id]` | 788 | contact-skill (16) | reference |
| `gtm/motion` + `[id]` | 845 | campaign-skill (8), sequence-skill (10), channel-skill (7) | G2 |
| `gtm/journeys` | 269 | journey-skill (3) | G2 |
| `pulses` | 399 | pulse-skill (9) via `components/pulses` (1,939) | G3 |
| `today` + `today/storyteller` | 388 | storyteller REST, attention-skill (2) | G3 |
| `war-room` + analytics + agent-runs | 544 | gtm-analytics-skill (7) | reference |
| `brain/offers` | 430 | research-skill | Brain |
| `brain/teach` | 194 | `/api/v1/ingest` REST | Brain |
| `gtm/audience/people` + `[leadId]` + `partners` | 636 | assessment-skill (5) | G1 |
| `import` + `import-dashboard` | 2,016 | `/api/v1/etl` REST | ops |

### Stubs — port the intent, not the file
`brain/knowledge`, `nova/estate`, `nova/campaign` are `<ComingSoon>`.
`gtm/audience` and `gtm/audience/enrich` are a redirect and a re-export.
vani-app already renders planned routes from the registry with no page file, so
these become one line each in a skill's `index.ts`.

### Do not migrate
- `(public)/design/*` — 13 mockup pages, internal only.
- `demo-data`, `smoketest`, `dev-colors` — dev tools.
- `(auth)/*` — vani-app has its own auth.
- `(vani)/a/[slug]`, `(vani)/r/[token]`, `assessment-*` — the **assessment
  funnel**, a different product surface from the GTM agent. Decide separately.
- `common-pool` (51 lines) — admin-only, and rule 13 governs it. Not a tenant
  surface.

## 5. Dead references found while auditing

`frontend` calls two skills that **do not exist** in `backend/src/skills/`:
`'client-skill'` and `'import-skill'`. Whatever those screens do fails at
runtime today. Do not port the call; find what replaced it, or drop the screen.

`frontend/src/lib/serviceURLs.ts` holds **107 endpoints**, of which a large
block (`/market/*`, `/market-analysis/*`, `/nav/aliases*`) belongs to a
different product entirely. Only ~11 endpoint groups are used by `(app)` pages.
Port endpoints by following the screens, never by copying the file.

## 6. Proposed shape — one GTM agent, not a second console

The registry boundary (`vani-app/CLAUDE.md` §5) is one folder plus one line in
`src/skills/index.ts`. GTM should arrive the same way Vara did:

```
src/skills/gtm-shell/        nav catalog for /agents/gtm/*   (mirrors vara-shell)
src/skills/gtm-audience/     G1  find → qualify → people → enrich
src/skills/gtm-motion/       G2  journeys, campaigns, sequences
src/skills/gtm-today/        G3  the queue, pulses, attention
src/app/(gtm)/agents/gtm/**  routes, mirroring (vara)/agents/vara/**
```

`/agents/vani` stops being a planned orchestrator page and becomes the GTM
agent's landing, or is removed — see §7.

**Order, each slice shipping something usable:**

1. **Shell + landing** — `gtm-shell`, the nav swap, `/agents/gtm`. Proves the
   registry boundary holds for a second agent. No backend work.
2. **G3 Today** — smallest real pathway (388 lines + attention-skill), and it is
   the screen a returning tenant opens. Needs `VdfBadge`, `VdfEmptyState`, `VdfStatCard`.
3. **People** — `contact-skill` is the most complete backend (16 functions);
   a pure reference surface, no pathway state to get wrong.
4. **G1 Build the audience** — the big one (2,800+ lines). Port `find` first.
5. **G2 Put them in motion** — campaigns/sequences/journeys.
6. **Pulses, War Room, Offers, Teach** — after the pathways.
7. **Import/ETL** — 2,016 lines and `etl` processing still answers 501 until
   prospect-skill lands. Last, or never, if the pathways absorb it.

## 7. The "VaNi" name means three things — fix before building

1. **`VaNi · Orchestrator`** in the sidebar: `planned`, no page. Its summary says
   "intake, resolve, route, policy, close".
2. **`vani-skill`** in the backend: live, but it is the **profile conversation**
   agent, not an orchestrator.
3. **`AGENT_REGISTRY`** in `worker.ts`: the thing that actually routes events to
   agents. Code, not an agent.

The orchestrator was never built because the bus already does its job. Before
GTM lands, decide whether `/agents/vani` becomes **GTM's landing page** or is
removed. Shipping a GTM agent next to a permanently-planned orchestrator keeps
the confusion that caused this audit.

**Related, and live:** signup emits `TENANT_REGISTERED`; `vani-skill` handles it
by parking a run at `awaiting` for a conversation surface that **no app has ever
had** — neither `vani-app` nor the retired `frontend/` calls `/vani/gather`.
Every registration therefore leaves a permanently stuck `awaiting` run, which
makes that status useless as a signal. Stop emitting it, or build the surface.

## 8. What this audit did not check

No live database or VPS access from the session that wrote this, so every claim
here is read off the two repos at `580bf21` (VaNiGTM) and `3f65535` (vani-app).
Nothing about what is actually running is asserted. Per the repo's own lesson:
an environmental finding is true of a moment, not of the system — re-check
before planning on one.

---

## Appendix — themes (added 2026-09-22)

The console now carries **three themes, each with a light and a dark variant**,
stored **per user on the server**. Relevant to the migration above because every
ported screen must use tokens, never hex:

- `src/config/theme/` — types, the three theme files, registry, `tokens.ts`
  (the one place a colour is produced), `ThemeScript` (pre-paint).
- `src/context/theme-provider.tsx` — runtime, persistence, `useTheme()`.
- `/appearance` — the picker.
- `globals.css` now holds **no colour at all**, only control metrics.

Theme files use the SAME `ThemeConfig` shape as VaNiGTM's, so a theme copies
between the repos unchanged.

**Porting rule:** if a screen needs a colour that is not in `tokens.ts`, add it
there. A hex value in a stylesheet applies to one theme out of six.
