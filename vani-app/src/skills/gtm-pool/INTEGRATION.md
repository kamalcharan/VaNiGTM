# gtm-pool — integration notes

`/agents/gtm/pool` is the retired `frontend/src/app/(app)/common-pool` page
(`RecordsPage` with scope `pool`), ported 2026-09-26, plus the two things it
pointed elsewhere for.

## Retired common pool → now

| Retired feature | Now | Backend |
|---|---|---|
| Admin gate: "Admin tenants only", said plainly, not an empty table | same; the nav entry is also `adminOnly` (logged platform change) and hidden for everyone else | `vn_tenants.is_admin` via `/auth/me` → `tenant.is_admin`; server refuses non-admins regardless |
| Intro: these are source rows, one per record per delivery, never merged | same, plus the coverage-honesty note from the design note (§1.2) | — |
| Stats: source rows, deliveries, avg completeness, avg validity, share an identifier, merged into a company | same six | `prospect-skill.get_records` scope `pool` → `stats` (REAL) |
| Rejected-fields note (`undefined+`) | same | `stats.with_rejected_fields` |
| Search · possible duplicates · industry / tag / domain selects · paging | same (the cluster / segment / research / relationship filters were `mine`-only on the retired page too) | `get_records` params + `facets` |
| Records table: company, domain, location, industry, quality (two numbers), source, tags | same | — |
| Detail modal: every mapped field, quality pair, then the raw source row | side panel, same content | `records[].raw` |
| Tagging selected rows, column chooser, segments | **not on the pool** — the retired page disabled all three for scope `pool` (segments and direct tags are a tenant's working-set concept) | — |
| "Import a directory from Import Data, choosing Common pool dataset" (a link away) | **Add a delivery** opens the import wizard here, fixed to the common-pool posture, with the delivery's region and publisher code | `POST /etl/sessions {destination: universe_companies, source_code, load_region, load_as_of, tag_ids}` |
| — (not on the retired page) | **Deliveries**: every `gt_source_loads` row of the pool with publisher, region, as-of, live rows, quality and tags | `prospect-skill.get_loads` scope `pool` (REAL, new, admin-gated) |

## Not offered, and why

Retiring a delivery. `gt_source_loads.status = 'retired'` exists (193) and is
what rollback is meant to be, but `gt_record_view` (205) does not read it —
pool rows are `is_active = true` unconditionally — so a retire would change
nothing a reader can see. Honouring it is a view change (a migration) and is
Charan's call; until then it stays an operator action, and the page says so.

## Preview

Nothing. In mock mode (no session) the shell treats the viewer as admin so the
screen can be looked at; on the live transport `tenant.is_admin` decides.

## P1-B (2026-10-02) — the pool as companies

The source rows above are now matched into **companies** by a worker job
(`POOL_RESOLVE_REQUESTED`, `backend/src/etl/pool-merge.ts`) and each company
runs the **Complete test**; only a company passing all eight checks is in the
core pool. Screens, all admin only, all on `pool-skill` (REAL):

| Surface | Route | Backend |
|---|---|---|
| The pool by state + "Match unmatched rows now" | `/agents/gtm/pool` (top) | `pool-skill.sources` → `pool`; `pool-skill.resolve` |
| Sources: licence, may enter pool, tier, what each delivered | `/agents/gtm/pool` | `pool-skill.sources` |
| Deliveries with companies counted by state; Open rows; Retire (confirm first) | `/agents/gtm/pool` | `pool-skill.deliveries`, `pool-skill.retire_delivery` |
| A delivery's rows by state, each with "Complete n of 8" and its open checks | `/agents/gtm/pool/deliveries/[id]` | `pool-skill.delivery_rows` |
| A company: the eight checks with reasons, the decision it needs, which source won each field, every row behind it | side panel | `pool-skill.company`, `pool-skill.decide` |
| The industry master with counts | `/agents/gtm/pool/industries` | `pool-skill.industries` |

Retiring a delivery is now offered: the companies screens honour it (a
retired delivery stops counting in survivorship). The older **source rows**
table still reads `gt_record_view`, which does not.

Not here yet: taxonomy proposals (they arrive with the review queue, P5 —
the industry page says so), and live run progress on these screens (the
stream exists; the run-feed component is Sprint 0b, pending approval).
Mock mode answers from `pool-mock.ts`.
