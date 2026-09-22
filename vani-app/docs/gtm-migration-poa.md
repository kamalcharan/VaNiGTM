# GTM migration — plan of action

**Date:** 2026-09-22 · **Status:** plan. Nothing ported yet.
**Build order superseded 2026-09-22 by `gtm-ux-poa.md`** — the UX layer is built
first (journey map → playground → screens on mock transport); §3 below is now
the INTEGRATION order that follows it. §2 invariants and §5 decisions stand.
**Reads with:** `gtm-agent-migration-audit.md` (the inventory — what exists,
what is dead, how big), and VaNiGTM's `documents/design-notes-outreach-and-
delivery.md` (the channel/consent decisions that gate the later slices).

The audit answered *what is there*. This answers *in what order, and what has
to change on the way*.

---

## 0. What changed since the audit was written

Four things were decided after it, and each moves the plan:

1. **Smart Profile is tenant-level; agents get their own.** The Mission Wizard
   is already ported into `skills/onboarding` and is NOT GTM's. GTM needs its
   own agent onboarding that READS the Smart Profile and declares only what is
   GTM's. (`vani-app/CLAUDE.md` §4: one declaration, N projections.)
2. **Four themes, light and dark.** Every ported screen uses tokens. A hex
   literal now applies to one theme in eight.
3. **Outreach decisions.** Consent/suppression does not exist and blocks every
   send surface. Channels, the cadence governor and the story library are built
   with no console at all.
4. **`/agents/vani` is a planned orchestrator that was never built**, because
   `AGENT_REGISTRY` already does its job. It has to become something or go.

---

## 1. The structural finding that makes this cheap

**A second agent workspace needs ZERO `src/platform/` edits.**

`VaraShell` is not a framework — it is a composition of the generic
`<Shell skills={…} org slug onSignOut>` plus Vara's own persona switcher and
breadcrumb. So GTM's shell is the same composition with a different nav
catalog, and it lives in `src/skills/gtm-shell/`.

(Vara's own shell sits in `src/platform/shell/VaraShell.tsx`, which is slightly
over the line. Do not copy that placement — put GTM's in its skill folder. Vara
can move later; it is not worth a migration of its own.)

What a second agent costs, structurally:

```
src/skills/gtm-shell/gtm-nav.ts        GTM_SKILLS: SkillModule[]
src/skills/gtm-shell/GtmShell.tsx      <Shell skills={GTM_SKILLS} …>
src/app/(gtm)/agents/gtm/layout.tsx    wraps the group in GtmShell
src/skills/index.ts                    one line
```

---

## 2. Invariants every slice must respect

Not style. Each is here because breaking it has already cost something.

| Invariant | Why |
|---|---|
| **`success: false` arrives with HTTP 200** | a refusal is not a network error. Use `<DataBoundary>`; it checks both. This bug shipped twice in JD Studio |
| **Writes through `useSkillMutation`** | the ported code uses raw react-query options and has no idempotency key |
| **Tokens only, never hex** | four themes × two modes; a literal is right in one of eight |
| **Deep-link, never duplicate** | anything the Smart Profile or the onboarding pathway owns is a `<Link>`, not a second form. Two editors for one field is how they drift |
| **Every empty state carries a next action** | rule 9b. Most GTM screens are empty on day one, so this is the whole first impression |
| **Port endpoints by following screens** | `frontend/serviceURLs.ts` has 107 entries, a whole block of which belongs to another product |

---

## 3. The slices

Each ships something a tenant can use. Ordered so the screen that has DATA
comes before the screen that needs data to exist.

### Slice 0 — GTM exists
`gtm-shell` + `/agents/gtm` landing + the registry line.
**Adjustments:** decide `/agents/vani` — GTM's landing, or removed.
**Done when:** the sidebar swaps on entering `/agents/gtm/*`, and the landing
says what GTM does and what to do first. No backend work.

### Slice 1 — GTM has no onboarding of its own, and that is the finding
The obvious candidate was **target industries** — the one GTM-specific
declaration the schema models (`gt_tenant_target_industries`, migration 194).
That work is **scoped to the Nova project migration** (Charan, 2026-09-22), so
it is not GTM's to build and not a gate on anything here.

What is left for a GTM onboarding? Nothing. Company, vocabulary, competitors,
brand and offers are the Smart Profile's. Personas are per-CAMPAIGN, not a
setup step. So **GTM ships with no agent-level declaration**, and goes straight
from its landing to a working surface.

Worth saying out loud because the pull is to mirror Vara. Vara has role
families to declare before a JD makes sense; GTM does not have an equivalent,
and inventing a step to match would be a wizard that buys the tenant nothing.

**Cost carried, not fixed:** until Nova's taxonomy lands, the domain-pack spine
keeps keying on free text, so two tenants who type the same industry
differently still each pay for enrichment. That bug exists today; GTM does not
make it worse. §6.

### Slice 2 — People
`gtm/people` + `[id]` (788 lines) on `contact-skill` — 16 functions, the most
complete backend in the repo.
**Why first among the real screens:** pure reference surface, no pathway state,
and a tenant who imported anything already has rows.
**Needs:** `VdfBadge`, `VdfStatusBadge`, `VdfEmptyState`, `VdfSearchBar`.

### Slice 3 — G1, Build the audience
`gtm/audience/find` (1,591) then `qualify/[ref]` (612), on `research-skill`
(17 fn) + `prospect-skill` (7).
**The big one.** Split it: `find` ships alone and is useful alone.
**Needs:** `VdfDrawer`, `VdfModal`, `VdfStatCard`, `VdfTabs`.

### Slice 4 — G3, Today
`today` + `today/storyteller` (388) on `attention-skill` + storyteller REST.
**After G1 deliberately** — a queue of what has gone quiet is an empty screen
until something is in motion.

### Slice 5 — Surface what is already built and invisible
Channels (`gt_channels`), the **cadence governor** (`gt_cadence_policy`,
`gt_touch_reservations`), the story library (`gt_journey_stories`,
`gt_content_kinds`), the touch log. Read-only first.
**This is the differentiator and no console shows it.** Migration 223's header
is the best reasoning in the repo and no user has ever seen its effect.
**Gate:** nothing that SENDS ships here. Consent/suppression does not exist
(design note §5). Read-only is fine; a send button is not.

### Slice 6 — G2, Put them in motion
`gtm/motion` + `[id]` (845), `gtm/journeys` (269) on campaign/sequence/channel
/journey skills.
**Gate:** same — composition and scheduling may ship; sending may not.

### Slice 7 — War Room, Offers, Teach
`war-room` + analytics + agent-runs (544) on `gtm-analytics-skill`;
`brain/offers` (430); `brain/teach` (194).
Offers and Teach are BRAIN, so they belong beside the Smart Profile, not inside
the GTM agent. Place them accordingly.

### Deferred — Import / ETL
`import` + `import-dashboard` (2,016 lines) on `/api/v1/etl`. Biggest single
piece, and the pathways may absorb most of what it does. Revisit after Slice 3.

---

## 4. Cross-cutting adjustments

**The 11 VDF components**, by usage in the pages being ported:
`VdfBadge` (27) · `VdfEmptyState` (17) · `VdfStatusBadge` (14) ·
`VdfStatCard` (12 — check `VdfKpiCard` first) · `VdfMission*` (13, wizard-only,
may not be needed) · `VdfDrawer` (7) · `VdfModal` (5 — copy the native
`<dialog>` pattern from `vara-onboarding/StructureDialog`) · `VdfInsightsCard`
(4) · `VdfSearchBar` (3) · `VdfToggleGroup` (2) · `VdfTabs` (1).
`VdfLoader` needs no port — `platform/feedback` matches it by design.

**Two dead skills.** `frontend` calls `'client-skill'` and `'import-skill'`;
neither exists in `backend/src/skills/`. Find what replaced them or drop the
screen. Do not port the call.

**The mutation-hook shape differs.** `frontend` throws on `success: false`;
vani-app returns it as data. Every ported write needs its refusal path written,
not translated.

---

## 5. Decisions that gate slices

| Decision | Gates | Status |
|---|---|---|
| `/agents/vani` — GTM's landing or removed? | Slice 0 | **settled 2026-09-22: neither — it stays.** Orchestration is already handled internally (`AGENT_REGISTRY`), so the entry is accurate; its summary now says the function is live and only the page is missing. GTM lands at `/agents/gtm` beside it |
| Industry taxonomy | nothing here — **moved to Nova** (2026-09-22) | settled |
| Consent + suppression schema | Slices 5, 6 (any send) | **open, needs approval** |
| Is Import worth porting at all? | Deferred slice | open, revisit after Slice 3 |
| Do GTM and Vara share `gt_channels` and one cadence budget? | Slice 5 | open (design note §8) |

---

## 6. The industry taxonomy — Nova's, not GTM's

**Ruling, Charan 2026-09-22: the industry migration is part of the overall
NOVA project migration.** It is not a GTM prerequisite and no slice above waits
on it.

The state, so Nova does not rediscover it: `gt_industries` has **zero rows**,
`gt_industry_aliases` and `gt_tenant_target_industries` are read by **zero**
TypeScript files, and the domain-pack spine keys on
`slugifyIndustry(vn_tenant_profiles.industry)` across 19 call sites — the free
text migration 194 explicitly says is not joinable.

What GTM carries in the meantime: two tenants who type the same industry
differently get different pack domains, so "already researched" never fires and
both pay for a 20-minute enrichment run. Present behaviour, unchanged by this
port.

A seed-and-adopt draft exists at
`VaNiGTM/documents/drafts/254_gt_industry_seed_and_adopt.sql.draft` — seeds and
adoption only, no structural change. It is **deliberately not in
`backend/migrations/`**, because `npm run db:migrate` applies every `.sql` in
that folder and a draft left there is a draft that ships. Renumber before use.

## 7. Explicitly not migrated

- `(public)/design/*` — 13 internal mockups
- `demo-data`, `smoketest`, `dev-colors` — dev tools
- `(auth)/*` — vani-app has its own
- the assessment funnel (`(vani)/a/[slug]`, `/r/[token]`, `assessment-skill`) —
  a different product surface; decide separately
- `common-pool` — admin-only, and rule 13 governs it
