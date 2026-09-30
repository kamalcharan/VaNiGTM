# GTM — Specification v1.0 (intended) · 2026-09-30

> **Posture.** This spec is INTENDED (POA-2026-09-30 §0 principle 1, ruled): where
> the product deviates, the product is corrected. Every "Built today" cell is
> traceable to a file opened on 2026-09-30 in `VaNiGTM` (backend, `main` checkout
> at `/home/user/VaNiGTM`) or `vikunawebsite/vani-app` (console). Nothing here was
> checked against the production database; a claim about production says
> "unverified". There was no prior GTM spec — this is written fresh from the
> design notes, the journey map, HANDOVER's standing decisions and the code.
>
> **Legend.** ✅ built and reachable · ◐ partly built (backend without console,
> console on fixtures, or a slice) · ✗ not built · **PREVIEW** = a console
> function answered from `vani-app/src/lib/preview.ts` fixtures on the live
> transport, badge shown, `preview: true` stamped.

---

## 1. Positioning & scope

**The ten-minute promise** (`documents/gtm-journey-map.html`, v1 draft, 22-Sep):
*a founder has a product and a list of companies they think should buy it. They
are not here to build a CRM — they want to know which of these are worth a
message, and to whom, by this afternoon.* Everything VaNi already knows about
the tenant (offers, buyer, vocabulary, brand) only pays off if it arrives as
decisions to confirm, not forms to fill.

GTM is the go-to-market **agent** in the VaNi console. It **reads the Smart
Profile** — the Brain: `gt_tenant_profile`, `gt_semantic_clusters` (market
vocabulary), confirmed `Competitor` KG nodes, `gt_offers`, `gt_tenant_brand`,
`gt_kg_nodes/edges` — and **never owns a copy of it** (CLAUDE.md "Product
model": if an agent stores its own copy of contacts, offers or brand, that is a
bug). The Smart Profile is the feeding engine for every agent (POA §0 p5,
ruled).

| Layer | GTM's relationship | Tables |
|---|---|---|
| BRAIN | read, never owned; missing objects are named and linked, never re-asked | `gt_tenant_profile`, `gt_semantic_clusters`, `gt_offers`, `gt_tenant_brand`, KG |
| THE UNIVERSE (GTM's own, tenant-scoped) | written and read by GTM | `gt_prospects`, `gt_account_briefs`, `gt_contacts`, `gt_segments`, `gt_fit_lessons` |
| THE MOTION (built, never shown until 2026-09) | written by skills; shown read-only before anything sends | `gt_journeys`, `gt_journey_stories`, `gt_cadence_policy`, `gt_touch_reservations`, `gt_touch_log`, `gt_channels` |
| THE POOL (platform, cross-tenant, companies only) | fed by Vikuna admin, read by tenants through an entitlement (not built) | `gt_data_sources`, `gt_source_loads`, `gt_universe_company_sources`, `gt_universe_companies` |

**Pathways, not destinations.** Pathways are verbs (things you DO): **G1 Build
the audience** (find → qualify → find people → enrich), **G2 Put them in
motion** (segment → journey → fill stages → activate), **G3 Work the queue**
(`/today`). Reference surfaces are nouns (things you LOOK AT): Companies,
People, Journeys, Imports, Channels & cadence, Common pool (admin). No new
top-level destination; extend a pathway or add a drill-down (CLAUDE.md).

**What GTM is NOT** (standing rulings, HANDOVER "STANDING PRODUCT DECISIONS"):

| Not this | Ruling / source |
|---|---|
| Not a CRM | journey map §intro; `gt_touch_log` header: "seven columns and not a CRM" (221) |
| No web-scraped buyer discovery | "we are not there yet — we will only work on available data"; prospects come from upload, the pool, or the tenant's own provider key. Research crawls a company the tenant already holds — that is qualification, not discovery |
| No email (or any) sending until a consent/suppression model exists | design-notes-outreach §5; POA D9; there is no suppression table anywhere in the repo (grepped migrations + `src`: none) |
| No LinkedIn/X automation, ever | assisted channels only; browser automation bans the tenant's own account (outreach §6) |
| Research output never enters the common pool (rule 13) | schema-enforced: `gt_account_briefs.prospect_id` FK → tenant-scoped `gt_prospects` (207) |
| The pool is companies only, own data only | 195 header; HANDOVER "Out of scope"; CLAUDE.md "The pool's sources are decided" (400k held + 200k bought outright + directories); Apollo/Clay are tenant-key connectors for PEOPLE, never the pool |
| No agent framework, no DAG runner | POA §0 p3–p4, ruled; orchestration is the event bus made visible; journey reader now, pathway definitions next (POA D5) |
| No second editor for a Brain object | journey map "Offers editable in two places" break; the console renders the Smart Profile's `OffersScreen` at `/agents/gtm/offers` — one editor, two doors (`gtm-nav.ts`) |

---

## 2. Personas

| Persona | Who | What they do in GTM | Sees |
|---|---|---|---|
| **Founder / GTM owner** | the tenant's decision-maker; first audience | opens the landing, reads what VaNi knows about them, brings a list, confirms cohorts, reads briefs and rules on each, picks people, approves stories, sees the cadence window, works `/today` | every pathway; Offers as a door into the Brain |
| **Operator** | a rep or marketer inside the tenant | runs imports, resolves merge conflicts, tags, promotes contacts, logs touches and outcomes, marks assisted touches sent | pathways + reference surfaces; the same functions, per-user `created_by`/`decided_by` |
| **Viewer** | anyone inside the tenant without write intent | reads Companies, People, Journeys, Channels & cadence (read-only) | reference surfaces; no role model exists today — every JWT in a tenant has every function (unverified: `vani_membership` roles are Vara-side) |
| **Vikuna admin (pool)** | `vn_tenants.is_admin = true` | feeds the common pool: uploads a directory as a delivery with publisher, region, as-of, tags; sees pool stats and deliveries; retires a load (operator SQL today) | `/agents/gtm/pool` (`adminOnly` in `gtm-nav.ts`); server refuses `scope:'pool'` for non-admins (`prospect-skill/functions/get-records.ts:59`) |

Not a persona: the agent. It proposes; a human confirms at every gate (offer,
brief verdict, person, story, stage decision, lesson, attention decision).

---

## 3. Key flows

### 3.1 The six stations (journey map) with today-state

| # | Station | Tenant | GTM | System | Today (2026-09-30) |
|---|---|---|---|---|---|
| 1 | **Land** — "here is who you sell to" | signs in, reads a page about themselves | reads the profile, scores readiness, names the weakest Brain object and one action | reads `gt_tenant_profile`, `gt_semantic_clusters`, brand, offers; writes nothing | ◐ `/agents/gtm` route exists (`gtm-nav.ts` `gtm-landing`); readiness comes from **PREVIEW** `gtm.readiness` and the journey rail from **PREVIEW** `gtm.journey` — no `gtm` skill exists on the API (`backend/src/skills/` has none). `PROFILE_COMPLETE` is emitted (`profile.routes.ts:210`, `vani.agent.ts`) and consumed by nothing (`worker.ts:227` commented out) |
| 2 | **Bring** — the hot list, and where it comes from | reads a proposed hot list; optionally drops a spreadsheet; or pastes a provider key that never comes back | pulls from the pool by vocabulary + ICP; says where each row came from and how fresh; maps an upload's columns before anything lands | pool `gt_universe_*` entitlement-gated; upload `ki_import_staging → gt_source_loads → gt_prospects`; own provider → `gt_prospects` only | ◐ Upload is REAL end to end (`ImportWizard.tsx`, `etl.routes.ts`, `landing.ts`); the hot list IS the tenant's own prospects (`prospect-skill.get_records`, REAL). Pool: schema + landing of source rows only, no golden record, no entitlement, no `gt_connectors` (grep: none). Own provider key: ✗ nothing |
| 3 | **Find** — companies that match, with why | unticks the obviously wrong | builds the cohort, shows completeness/validity/freshness per row | `prospect-skill.build_cohort`, `save_segment`, `tag_prospects` | ✅ backend; ◐ console `FindStep.tsx` uses `get_records` + `get_budget` + `start_research` (REAL); `build_cohort`/`tag_prospects` have no console call (grep of `gtm-*`) |
| 4 | **Qualify** — briefs, and a decision per company | reads a brief, decides worth it / not / later | research batch with a visible budget; fit per offer blind to commitment; opens with the entry ask; proposes lessons | `research-skill.start_research` → SearXNG + site crawl → `gt_account_briefs`; `decide_brief`, `propose_lessons` | ✅ backend (17 functions, `research-skill/functions/`); ✅ console `QualifyStep.tsx` on REAL `get_briefs`/`decide_brief`/`batch_status`. `SEARXNG_URL` on the Main VPS: unverified |
| 5 | **People** — who, at each company worth it | picks two or three, promotes them | finds people from the brief; tries providers in order; never invents a contact | `contact-skill.list_brief_contacts`, `promote_from_brief`, `add_channel` → `gt_contacts` CONT-0001 | ✅ backend (16 functions); ✅ console `PeopleStep.tsx` on REAL calls. No enrichment waterfall because no provider exists — the row shows the one source there is (the page the name was read on) |
| 6 | **Today** — the queue exists now | opens each morning, decides per row | ranks wake due / owed reply / gone quiet, suppressing anyone already reserved | `attention-skill.get_attention` over `gt_touch_log` + `gt_journey_events` + `gt_touch_reservations`; `decide_attention` | ✅ backend (`attention-skill`, migration 238, `config/attention.config.ts`); ◐ console `TodayQueue.tsx` exists at `/agents/gtm/today` but calls **PREVIEW** `attention-skill.get_attention` / `decide_attention` (in `TODAY_MOCK_READS`, not in `preview.ts` `REAL`) — the queue has still never been shown from real data |

The "first week" stations (G2: 7 Segment · 8 Story · 9 Cadence · 10 Activate,
locked) are in §3.3.

**The other lane — Smart Profile not ready.** GTM says which Brain object is
missing, links to the Smart Profile screen that owns it, and stops: no offer →
cannot score fit; no buyer → cannot frame a cohort; no vocabulary → research has
no terms; no brand → a story has no voice. Never a second form.

### 3.2 G1 — Build the audience

```
Brain ready? ──► Bring (hot list | upload | own key) ──► Find (cohort, segment, tag)
            ──► Qualify (brief per company, budget, verdict, lessons)
            ──► People (named contacts from the brief → gt_contacts, channels with source_url)
            ──► Enrich (provider waterfall; today = "what was in the upload", said honestly)
```

- Research is **upstream of campaigns, never inside them**: one brief per
  company, reusable across every campaign (design-notes-research §1).
- Fit and "what to open with" are two questions: the model scores fit blind to
  `gt_offers.commitment`; `chooseOffer()` takes the lowest rung within
  `FIT_MARGIN` 0.15 (212). `recommended_offer` (agent) is never overwritten by
  `human_offer` (213).
- A rule change never touches a decided brief (R7); what moves is membership,
  reported as `unresearched` on the segment.
- Every brief claim carries `{claim, url, excerpt}` with `source: website | search`
  (220); an unreadable site is `status='unreadable'` with the real reason, never
  a guessed brief.

### 3.3 G2 — Put them in motion

| Station | Tenant | GTM | System | Today |
|---|---|---|---|---|
| 7 Segment | accepts "hospitals, contract-management pain, entry ask" or splits it | groups by fit-offer and pain, names groups in the tenant's vocabulary | `prospect-skill.save_segment`, `get_segments` (219: definition, not member list) | ✅ backend; ◐ console `SegmentStep.tsx` via `useMotion.ts` on **PREVIEW** `prospect-skill.get_segments`/`save_segment` |
| 8 Story | reads, edits in their voice, approves | writes from profile + brand + brief evidence; says what it read and dropped | `story-skill.create_story`/`approve_story`; `gt_journey_stories`, `gt_content_kinds.scope` asset vs move | ✅ backend (R-S1 trace, R-S2 similarity, R-S3 human approval — `story-skill/trace.ts`); agent drafting ✗ (`author='human'` only; `prompt_key` nullable); ◐ console `StoryStep.tsx` on **PREVIEW** `story-skill.*` |
| 9 Cadence | sees "3 of 14 already have a touch this week" before committing | reserves per contact; refuses over the cap with the reason; assisted touches consume slots | `cadence-skill.get_cadence`, `reserve_touch`; 223 | ✅ backend (`governor.ts` pure, `cadence.service.ts` row-locks the contact); ◐ console `CadenceStep.tsx` on **PREVIEW** `gtm.cadence_plan`, `cadence-skill.reservations` (no such backend function), `reserve_touch` |
| 10 Activate (LOCKED) | sees the step, the lock, the reason | nothing sends | `gt_channels` (161) exists; no consent/suppression table | ✗ correct. `SendStep.tsx` renders the lock; `gtm-nav.ts` journey step `sending.locked` |

The journey ledger underneath (222, `journey-skill`): `sourced → researched →
qualified → addressed → ready → waiting → answered → won`, exits `ruled_out |
parked | lost`; `ready` repeatable; `arc` acquisition/lifetime with Arc 2
unmodelled (D8). Who moves it today: `account.agent.writeBrief`
(sourced→researched), `decide_brief`, `promote_from_brief confirm_addressed`,
`approve_story` (→ready), `log_touch` (→waiting), `set_touch_outcome`
(→answered), `advance_journey` (human, anything legal). Stage decision
(`STAGE_DECISION_REQUESTED`) and campaign runs (`gt_campaign_runs`) are designed
(journey-campaign §5–6, D2) and ✗.

### 3.4 G3 — Work the queue (`/today`)

Not a dashboard: a ranked list of who has gone quiet, why, and what it costs
to leave them, with a decision per row. Reasons (`attention.config.ts`):
`wake_due` (no wait), `owed_reply` (no wait), `story_unsent`, `follow_up_due`
(own shorter clock, default 7d = governor window), `gone_quiet`,
`never_touched`. Only `IN_PLAY_STATES` (qualified…answered) are candidates;
`parked` enters only at `wake_at`. "Mark as contacted" IS
`research-skill.log_touch`, not a second write. Decisions are append-only
(238, trigger refuses UPDATE), `shown` frozen so a decision can be replayed
against the weights that produced it. Five `empty_state` verdicts, each with a
next action (rule 9b).

### 3.5 The import lifecycle — one action

```
file ─sha256─► ki_file_uploads ─► headers ─► DETECT (deterministic, columns not files)
     ─► session {relationship: contacts|customers|dataset, destination, load as-of, tags}
     ─► STAGE (always succeeds; raw_data kept; quality scored per row)
     ─► LAND: people → gt_contacts (+channels) ALWAYS tenant · companies → gt_prospects
              or (admin, destination=universe_companies) → gt_universe_company_sources
     ─► only genuine clashes come back: processing_status='conflict' + field_diff
        recommended keep/take per field; campaign_locked rows never bulk-accepted
```

Rulings enforced in code: import is ONE action (HANDOVER "The import
lifecycle"); the tenant declares the RELATIONSHIP, the ETL detects the ENTITY
(`etl/entity-detector.ts` header — no LLM); the same file cannot be imported
twice — matched on **sha256, not filename** (`etl.routes.ts:136–164`
`ALREADY_IMPORTED`; unique index, migration 202; retiring the load is the only
reload); tags sit on the LOAD (`gt_load_tags`, 199) with direct record tags
added later (`gt_prospect_tags`, 203); every upload is a load with an as-of
(`gt_source_loads`, 193); the quality model is a RECOMMENDATION, the tenant
decides (`landing.ts` "Quality model — a RECOMMENDATION, never a decision").
Never dress a partial success as failure: migration 249 (`needs_review`) fixed
the case where 2,882 companies landed and the person was told it failed.

**EVERYTHING enters through staging, then the pool** (Charan, 2026-09-26):
there is ONE road in — file, directory, exhibitor list, Apollo, any connector —
staging as delivered, then a re-runnable CLEANUP job, then landing.
`landing.ts` is the pool's only writer. Cleanup as a worker job (normalise ·
domain from corporate email · name→domain · liveness · crawl · flag shared
identifiers · attach child file) is ✗ and needs Charan's explicit go, because
the `cleanup` source puts model-derived text in the pool for the first time.

### 3.6 The pool

| Concern | Intended | Today |
|---|---|---|
| Entitlement | tenants read the pool "based on business model" — a plan grant, not a default (HANDOVER); one entitlement model for all agents (POA D4 `vani_entitlement`) | ✗ only `is_admin` gates `scope:'pool'` reads; no tenant can read the pool at all |
| Provenance | every row → `load_id` → `gt_source_loads` → `gt_data_sources`; `source_codes[]` on the golden row; `field_sources` per field | ✅ source rows carry it; golden row ✗ |
| Freshness | banded from `source_as_of` (≤6mo current · ≤18 recent · ≤36 ageing · stale); FTCCI is `ageing` today, `stale` from 2026-10-26 | ✅ in `gt_record_view` (205) |
| Quality | components never one number: completeness, validity, tier, freshness; `field_score = validity × tier × freshness` | ✅ components at staging and on source rows; merge ✗ |
| Identity | block on `domain_normalized` else `name_key|pin`; resolve within block on name similarity; below threshold → distinct + `needs_review`; late merge via `gt_universe_company_aliases` | ✗ `gt_universe_companies` referenced by no `src/*.ts` (grep) — stays empty |
| Dedup key | source's own id when mapped, else a hash of the normalised row (fixed 2026-09-26: domain-as-key collapsed sister companies) | ✅ `landing.ts:659` |
| Coverage | `gt_universe_coverage` (industry × state × freshness) gates the CRO push and ranks what data to buy | ✗ not created |
| Retire a delivery | `gt_source_loads.status='retired'` stops rows contributing | ◐ column exists; `gt_record_view` ignores it (pool rows always active) — view change pending Charan (`gtm-pool/INTEGRATION.md`) |
| Sources | own data only: ~400k provider-shape records held, ~200k bought outright, member directories, public registries. Vendor invoice must say "unrestricted use" | data not loaded; datasets still to be obtained as CSV exports |

### 3.7 Outreach — story → governor → channels

```
approved story (move, per journey) ─► reserve_touch (rolling window, per contact, all opportunities)
   ─► channel: email api | whatsapp api+template | sms api+DLT | linkedin ASSISTED | x ASSISTED
   ─► log_touch (consumes reservation, story → sent, journey → waiting, had_brief frozen)
   ─► set_touch_outcome (replied | meeting | not_interested | bounced | no_response)
```

- The platform owns orchestration, story, cadence, consent and evidence; the
  tenant owns identity and delivery. First-party tenants may send as the
  platform; everyone else always as themselves — one flag on the tenant
  (outreach §3). ✗ flag not built.
- Assisted (LinkedIn, X): the agent drafts, queues, deep-links to the native
  compose; a person sends; **"mark as sent" is mandatory** and consumes the
  slot; a queued move expires and releases its reservation. ✗ not built;
  `gt_touch_log.created_by` already admits a human-logged touch.
- Sandbox: 10–15 lifetime sends on a Vikuna subdomain, flagged in
  `gt_touch_log`, after a day-zero send to the tenant's own inbox. ✗.
- Sequence (outreach §7): consent + suppression → channel taxonomy (`delivery`,
  `identity_owner`, `requires_template_approval`, `consent_basis`; add `sms`,
  `x`) → surface story library → surface governor → email, tenant-owned →
  assisted queue → WhatsApp/SMS templates.

### 3.8 Signals spine

Touches and signals are two different spines (outreach §9). `gt_touch_log` =
what WE did: outbound, a known person, **consumes** a cadence slot.
Signals = what THEY did or was observed (GA4, ad analytics, replies, filings):
arrive unresolved, immutable source rows keyed by the source's own event id,
resolution as a separate revisable link with method + confidence,
tenant-scoped, never the pool, **never counted by the governor**. Putting a
pageview in the touch log makes the most engaged prospect the one you go
silent on. Three grains: person (our minted click id), pseudonymous (GA4),
aggregate (ads → informs the story, never the individual). ✗ no signals table;
`gt_activity_feed` has one writer, the demo seeder (`docs/gtm/attention-query.md`).

---

## 4. Epics & user stories

### E1 — Land on the Brain

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-01 | As a founder I open GTM and read what VaNi knows about me — buyer, offers, vocabulary, brand — not a form | landing renders profile + counts; readiness names ONE weakest Brain object with why it matters to GTM and one link; writes nothing | ◐ `/agents/gtm` (`gtm-nav.ts`); readiness = **PREVIEW** `gtm.readiness`; intended: `brain.context('gtm.readiness')` (POA D2, ✗) |
| G-02 | The journey rail says where I am (Profile ready → Audience built → People found → In motion → Sending locked) with done-predicates over data the console already reads | each step `done` computed server-side from `gt_tenant_profile.is_complete && offers>0`, briefs decided, contacts, journeys active; `sending` locked with reason | ◐ steps declared in `gtm-nav.ts.journey`; progress = **PREVIEW** `gtm.journey`; journey reader (POA B4) ✗ |
| G-03 | When the profile crosses the line, GTM proposes an audience | `PROFILE_COMPLETE` consumed → proposal run visible in the run feed | ✗ `PROFILE_COMPLETE` emitted (`profile.routes.ts:210`), no handler (`worker.ts:227`); first wire of pathway definitions (POA D5) |
| G-04 | If a Brain object is missing, GTM says which, links, and stops — never a second editor | no offers form inside GTM; `/agents/gtm/offers` renders the Smart Profile's `OffersScreen` | ✅ `gtm-nav.ts` `gtm-offers`; `research-skill.get_offers`/`save_offer` REAL; `gt_offers.confirmed_at` (239) |

### E2 — Bring

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-05 | I upload a spreadsheet in one action: say what it is to me, drop, confirm detection + mapping, land | relationship cards contacts/customers (dataset for admins); detector reasons; unresolved columns shown never guessed; 17 company targets + N person slots; preview; results with VaNi's reading; "staged, not landed" when landing fails | ✅ `ImportWizard.tsx` → `POST /etl/upload`, `GET /etl/headers/:fileId`, `POST /etl/sessions`, `POST /etl/sessions/:id/process` (`etl.routes.ts`); `mapping-plan.ts` qualified keys `person.1.full_name` |
| G-06 | The same file cannot be imported twice; a refreshed delivery can | second upload of identical bytes → `ALREADY_IMPORTED` naming the earlier load; different sha256 loads and clashes go to review | ✅ `etl.routes.ts:136–164` + migration 202 unique index; retire = only reload path |
| G-07 | Only genuine clashes come back to me, per field, with a recommendation; rows under a live campaign are never bulk-accepted | `conflict` rows with `field_diff {existing, incoming, recommended, reason}`; `campaign_locked` excluded from `accept_recommended` | ✅ `landing.ts`; `POST /etl/sessions/:id/conflicts/resolve`; migration 200; console `ImportsDashboard` drawer keep/take |
| G-08 | Every import is a delivery with an as-of date and tags; records inherit tags through the load | undated = scored less fresh; tags created by the user; platform vs tenant tag namespaces | ✅ 193/199; `GET/POST /etl/tags`; admin platform-tag creation under RLS write policy — known gap (CLAUDE.md 235) |
| G-09 | I see every past import row by row and can retry failed rows, recount, land staged rows, or clear staging | `/agents/gtm/imports` with counts, filters, drawer edit + reprocess | ✅ `gtm-imports` (REAL: `etl.sessions/status/records/reprocess/patch_record/sync_stats/delete_staging`, `prospect-skill.get_loads`) |
| G-10 | GTM opens on a HOT LIST from global data (the pool) filtered by my ratified vocabulary and ICP, each row saying where it came from and how fresh | pool rows adopted into `gt_prospects` (copied, `universe_company_id`, `adopted_at`); entitlement checked; "not yet connected" said plainly while unfed | ✗ hot list today = my own prospects (`BringStep.tsx` → `get_records scope mine`, REAL); no entitlement; pool unfed; adoption ✗ |
| G-11 | I paste my own Apollo/Clay key; results land in my prospects only, never the pool; the key never comes back | posture `byok` beside `upload`/`platform`, copying `vani_llm_provider` (per-tenant HKDF key, hint only in responses); no cap, usage metered, never fails over | ✗ no table, no key store, no puller (journey map station 2) |
| G-12 | A big delivery (600k rows) uploads chunked and lands as a worker job | chunked upload; landing as an event; progress visible; measured at 2,913 rows in one request today | ✗ (HANDOVER §3: "proven at 50k locally", not merged — unverified) |

### E3 — Find & qualify (cohorts, segments, tags)

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-13 | I see every company I hold with quality as components (completeness, validity, freshness), duplicates flagged not merged, tags inherited + direct, research status | `gt_record_view` one shape; `PROS-0001` refs never PKs; facets | ✅ `prospect-skill.get_records` (`gtm-companies` REAL); 204/205 |
| G-14 | I collapse free-text industries onto a cluster and tag the cohort; exclusions come back with the term that excluded them; a tag is never revoked on re-run | `build_cohort {cluster, tag_label, dry_run}` → `industry_canonical`/`industry_sub` (206/218), `tagged_no_longer_matching` | ✅ backend; ✗ no console call; rules are a TS file (`etl/industry-normalizer.ts`) — platformising to editable data is LATER (research §7) |
| G-15 | I save the filter I am looking at as a segment; it stores the definition, shows saved vs live count, says when the rules moved and how many members are unread | `save_segment`, `recount` explicit, `rules_moved`, `unresearched` | ✅ 219 + `prospect-skill/segments.ts`; console via **PREVIEW** `get_segments`/`save_segment` (`useMotion.ts`) |
| G-16 | I pick which companies to research and see the split before spending anything: selected / no website / already researched / to research, priced in companies against my budget | `list_targets`, `start_research {preview}`, `get_budget {affordable_companies, tracked}` | ✅ REAL in `FindStep.tsx` |
| G-17 | Research runs as a visible batch; a crash at 60/100 keeps 59 briefs; a budget stop is a STOP, not a failure; it never fails over to Claude to beat our own cap | `batch_status` verdicts `never_run/queued/running/worker_down/failed/completed`; checkpoints per account (191) | ✅ `account.agent.ts` on `ACCOUNT_RESEARCH_REQUESTED`; `QualifyStep.tsx` polls REAL |
| G-18 | Each brief shows the hook first, fit for EVERY offer with reason, evidence inline on the claim with a third-party badge, and the smallest sane first ask | `fit {offer_key:{score,reason}}`, `best_fit_offer` vs `recommended_offer` + `fit_margin`, `raw_evidence.source` | ✅ 207/211/212/220; `get_briefs` views `with_offer/no_fit/smaller_ask/fit_unclear/unevidenced` |
| G-19 | I rule on a brief — approved / rejected / no_contact — with a reason required for any no; my ruling is a record, never overwritten by a re-score | `decide_brief`; `human_offer` beside `recommended_offer` (213); decided briefs never re-judged | ✅ REAL; journey → `qualified`/`ruled_out` in the same tx |
| G-20 | Editing an offer stales judgements, not facts; re-score is one call per company, no crawl | `facts_at`/`judged_at`/`offers_fingerprint` (211); `needs_rescore` in `start_research` | ✅ |

### E4 — People & enrichment (tenant-scoped)

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-21 | For each approved brief I see the people it named, whether each has a name and a reachable channel, and promote the two or three who matter | `list_brief_contacts` marks R-C1/R-C2; `promote_from_brief` idempotent on (brief, index); channel carries `source_url` (224); `confirm_addressed` only with a channel | ✅ REAL in `PeopleStep.tsx`; `gt_contacts.brief_id` |
| G-22 | Every person is one record with channels, provenance and a CONT-0001 id; a lead captured by the assessment is the same person | `contact-skill` 16 functions; `gt_lead.contact_id` bridge (231) | ✅ `gtm-people` REAL (`get_contacts`, `get_contact`); detail deltas (`prospect_ref`, `touches[]`, `journey`) ✗ |
| G-23 | "Enrich" tries providers in order and shows each hit or miss; with no provider it says "what was in the upload" — no fake spinner | waterfall over connectors; honest single-source row today | ◐ honest today (`gtm-audience/INTEGRATION.md`); waterfall ✗ (no connector) |
| G-24 | A people delivery (vendor export: company string, name, title, headline) is staged as delivered, matched to companies in code, and only the gap goes to Haiku; an unmatched person stays, held | `company-matcher.ts`: key/acronym/token/headline; ≥0.85 match, 0.55–0.85 gap with shortlist; measured 61/68, 0 wrong | ◐ matcher built + 11 tests (`src/etl/company-matcher.ts`); landing of people deliveries, link rows, gap register ✗ (pending approval, §6.6) |
| G-25 | Each person carries a persona (economic/technical buyer, champion, user, gatekeeper × function) from title rules, the model only on the residue | `gt_personas` + `gt_person_persona` | ✗ PROPOSED. Note the legacy `icp-skill` personas are per-CAMPAIGN (`gt_personas`, 160) — a different object with the same name; reconcile at approval |
| G-26 | People are never in the pool; nobody is contacted until suppression exists | schema: no platform people table without the decision; `gt_suppression` approved together with any people asset | ✅ posture holds today (people only in `gt_contacts`); decision PENDING (§8) |

### E5 — Common pool (admin)

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-27 | As a Vikuna admin I add a delivery to the pool — publisher, region, as-of, tags — through the same wizard, and see every delivery with live rows and quality | `POST /etl/sessions {destination:'universe_companies', source_code, load_region, load_as_of, tag_ids}`; `get_loads scope pool` | ✅ `gtm-pool` (REAL, admin-gated; `vn_tenants.is_admin` from JWT, `ki_import_sessions.destination` 197) |
| G-28 | Pool source rows are immutable, one per record per delivery, never merged silently; sister companies on one website are flagged, never collapsed | upsert `(source_id, source_record_id)`; dedup key = source id or row hash | ✅ `landing.ts:645–683`; FTCCI measured 2,912 rows, 137 flagged |
| G-29 | Golden records are derived field by field (validity × tier × freshness), re-runnable; late merges keep aliases so adopted prospects keep resolving | `gt_universe_companies`, `gt_universe_company_aliases`, `field_sources` | ✗ merge engine — before the second delivery of any list |
| G-30 | Pass 1: Haiku reads every pool description once → industry, offering, buyer, B2B/B2C, `is_individual`; domain relation `same | brand_or_group | unrelated`; company LinkedIn/X from the footer | cleanup source with its own tier; ≈$900 at 600k; Laya rejected on measurement (31% agreement) | ✗ needs Charan's go (cleanup source) |
| G-31 | A list label from a provider ("growth stage startups") lands as a tag on the LOAD, never a column, shown as "tagged by <provider>" | `gt_load_tags` | ✅ mechanism; convention documented (CLAUDE.md) |
| G-32 | Coverage per industry × state × freshness gates what a tenant is shown and ranks what to buy | `gt_universe_coverage` | ✗ |
| G-33 | I retire a bad delivery and its rows stop contributing, without deletion | `status='retired'` honoured by `gt_record_view` | ◐ column exists (193); view ignores it — migration pending |

### E6 — Journeys & motion

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-34 | Every company I hold has one journey: state, reason, wake date, owner, offer, contact; the ledger is append-only and the state is its tail | `gt_journeys` unique per (tenant, is_live, prospect); `gt_journey_events`; R-J1 reason on exits and backward moves | ✅ 222 + `journey-skill` (`get_journey`, `list_journeys`, `advance_journey`); backfilled once from prospects + briefs + touches |
| G-35 | I see the board by state and the count behind every state; a person and offer per row | `list_journeys {state, arc, owner_id, due, search}` | ◐ backend ✅; `JourneysList.tsx` on **PREVIEW** `journey-skill.list_journeys` |
| G-36 | Segments are proposed from verdicts + best-fit offer with a name in my vocabulary; I confirm or split | `save_segment` + `why/offer/ask/people[]` deltas | ◐ backend `save_segment` ✅ (definition only); proposal from verdicts ✗; console PREVIEW |
| G-37 | A story is a MOVE about them, per journey, approved every time; every sentence traces to the brief's evidence or it cannot be approved; it cannot repeat an earlier story's argument without a recorded override | `create_story` returns `trace`; `approve_story` re-runs R-S1/R-S2, moves journey to `ready` | ✅ `story-skill` (trace.ts); console `StoryStep.tsx` PREVIEW |
| G-38 | The agent drafts the story from profile + brand + brief + earlier stories, says what it read and what it dropped; I edit in my voice | `author='agent'`, `prompt_key` per kind, `charBudgetFor` trimming reported | ✗ (POA-journey-campaign Phase 6); the `buildDeck` spine in `storyteller.agent.ts` is the reusable part |
| G-39 | Assets (deck, one-pager, success story) live in one library, approved once, attached to moves by id | `gt_presentations` + `kind/arc/stages/body` (D7 ruled) | ◐ deck only (`storyteller-skill`, 186, share token); `kind/arc/stages/body` columns ✗; `gt_content_kinds` seeded with 8 kinds (225) |
| G-40 | Before anything is scheduled I see the rolling window for these people — who is reserved, quiet hours, slots this plan takes — and a refused slot says why and when it clears | `reserve_touch` → `{scheduled_at, moved, reason, blocked_by, competing}`; policy chain channel → tenant → built-in (2/7d, quiet weekends, 19:00–09:00 Asia/Kolkata) | ✅ `cadence-skill` (5 fns, `governor.ts` exhaustively tested); console `CadenceStep.tsx` + `ChannelsFrame` cadence tab on PREVIEW `get_policy`/`reservations`(✗ no such function)/`gtm.cadence_plan` |
| G-41 | One governor, one budget per tenant, agent-agnostic — a candidate who is also a prospect is one person | contact-keyed; sent + held both count; no filter by opportunity/channel | ✅ by design (223); Vara/GTM sharing not stated (outreach §8 open) |
| G-42 | A campaign run is one channel, one step, delivering approved stories across a frozen member list; it moves a journey exactly twice | `gt_campaign_runs`, `gt_campaign_members`; `states.CAMPAIGN_MOVES` | ✗ tables (D2); ✅ `CAMPAIGN_MOVES` in `journey-skill/states.ts:152`; legacy `gt_campaigns/gt_sequences/gt_sequence_steps` (160/161) DORMANT by ruling, not deleted |
| G-43 | After an outcome, the agent proposes another story / advance / stop with evidence; I rule | `STAGE_DECISION_REQUESTED` → `awaiting` | ✗ (Phase 5); analytics never triggers a story on its own |

### E7 — Work the queue

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-44 | `/today` ranks quiet accounts by reason and cost of inaction; anyone already reserved or snoozed is suppressed; day one says what to put in motion and where | `get_attention` items + `context` + `empty_state` + `tuning` | ◐ backend ✅ (`attention-skill`, `queries/_candidates.sql` prefix); `TodayQueue.tsx` on **PREVIEW** |
| G-45 | I act, snooze (with date) or dismiss (with reason); undo is a new `reopened` row; what I saw is frozen with the decision | 238 append-only, trigger refuses UPDATE/DELETE, `shown` JSONB | ✅ backend; console PREVIEW |
| G-46 | "Mark as contacted" is `log_touch`; "they replied" is `set_touch_outcome` — no second write path from the queue | `research-skill.log_touch {contact_id}` consumes the reservation; `follow_up_due` → `owed_reply` | ✅ backend wiring (attention SKILL.md); console ✗ (no `log_touch` call in `gtm-*`) |
| G-47 | Parked journeys surface at `wake_at` — surfaced, never auto-sent (D4) | `wake_due` scan | ✅ `attention-skill` (first thing to ever scan `wake_at`) |
| G-48 | Follow-up tasks and meeting pulses (`pulse-skill`) sit beside the queue, not in it | `ki_pulses` retargeted to contacts (190) | ◐ backend exists (9 fns); no GTM console surface; `ki_` tables stay by disposition |

### E8 — Outreach & delivery (gated)

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-49 | Nothing sends on any channel until a consent + suppression record exists; the Activate step is visible, locked, with that reason | append-only suppression: identifier hash, channel, reason `unsubscribed/bounced/complained/manual/never_contact`, source, when; platform-wide or tenant | ✗ table (D9); ✅ lock shown (`SendStep.tsx`, `gtm-nav.ts`) |
| G-50 | My channels declare `delivery api|assisted`, `identity_owner tenant|platform`, template approval, consent basis; SMS and X exist as types | `gt_channels` + 4 columns + 2 types; `gt_channel_types` master (226) | ◐ `gt_channels` (161: email/whatsapp/linkedin, `config` holds the tenant's own SMTP/WABA/token refs); `channel-skill` 7 fns; new columns ✗; console `ChannelsFrame` on PREVIEW `get_channels` |
| G-51 | First-party tenants may send as the platform; every other tenant sends as themselves | one flag on the tenant | ✗ |
| G-52 | Day zero: the whole engine runs with my own inbox as the only recipient; then 10–15 lifetime sandbox sends flagged in the touch log; then domain/WABA/DLT | sandbox counter per tenant; `gt_touch_log` flag | ✗ |
| G-53 | An assisted LinkedIn/X move is drafted, queued, deep-linked; I must mark it sent; an unconfirmed draft expires and releases its slot | queue + expiry + mandatory confirm | ✗; `log_touch` with `channel='linkedin'` works by hand today |
| G-54 | I log a touch and, days later, its outcome; `had_brief` is frozen; reply rate per story is a query; the pilot verdict withholds below 20 concluded sends | `log_touch`, `set_touch_outcome`, `get_touches`, `pilot_result` | ✅ backend; touch log tab on **PREVIEW** `gtm.touch_log` (no backend function lists `gt_touch_log` by tenant) |

### E9 — Signals & analytics

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-55 | Analytics events (GA4, ads, our minted click ids, filings) land in their own spine — immutable, keyed by the source's event id, resolved by a separate revisable link, tenant-scoped — and never consume a cadence slot | signals tables; governor reads touches only | ✗ (design only, outreach §9) |
| G-56 | Dated signals relight a node on the opportunity map and push it onto the agenda; a node below freshness ×0.20 cannot be an opening | `gt_event_log` with node refs; half-life 60d | ✗ (journey-campaign §6b; Q5/Q6 unruled) |
| G-57 | The war room shows what worked and what to do next, never seven zeros | narrative over campaign/sequence/touch data; every empty state carries a next action | ◐ `gtm-analytics-skill` 7 fns read `gt_campaign_metrics`/`gt_activity_feed`/`gt_contact_assignments` — legacy campaign tables, demo-seeded (`campaign-skill.seed_demo_data`); no console surface; superseded in intent by `/today` + journey board |

### E10 — Research (competitors, account briefs, fit lessons)

| # | Story | Acceptance | Built today |
|---|---|---|---|
| G-58 | Competitors are found outward from the ratified vocabulary (≤4 queries → SearXNG → shortlist → verify on the candidate's own site → KG `Competitor` nodes with evidence); I keep/remove in the wizard | `COMPETITOR_RESEARCH_REQUESTED` → `research.agent.ts`; resumable; `verified=false` kept and labelled | ✅ backend; surface is the Smart Profile wizard (`/vani/competitors/*`), not GTM — GTM reads confirmed nodes. `SEARXNG_URL` on VPS unverified |
| G-59 | Account research reads the company's site (up to 6 hint pages) AND search for every company, labels each block, refuses to blend two sources into one claim | `research-skill.account_extract` v2 (220); `source` on evidence | ✅ |
| G-60 | The agent proposes fit lessons from ≥6 decisions, each citing companies; I accept, reword or reject; only accepted rules reach the prompt; rejected are kept | `FIT_LESSONS_REQUESTED` → `lesson.agent.ts` → `gt_fit_lessons` (214); `decide_lesson {edited_lesson}` | ✅ backend (`get_lessons`, `propose_lessons`, `decide_lesson`); no console call in `gtm-*` |
| G-61 | Sources are per segment (`gt_sources`), evidence carries a tier, spend follows qualification | source repository; tiering; staged cost | ✗ LATER (research §7) |
| G-62 | Brief fields are a universal core + segment-specific JSONB, not manufacturing-flavoured columns | `what_they_make/scale_signals/service_signals/digital_maturity` → core + extras | ✗ (research §6 item 1) |

---

## 5. Architecture

### 5.1 Skills and their functions (backend `src/skills/<name>/functions/`)

| Skill | Functions (file list) | Reads Brain? | Console |
|---|---|---|---|
| prospect-skill | `get_records`, `get_loads`, `get_prospect`, `get_segments`, `save_segment`, `delete_segment`, `tag_prospects`, `build_cohort` | no | REAL: records/prospect/loads · PREVIEW: segments |
| research-skill | `get_offers`, `save_offer`, `get_briefs`, `decide_brief`, `start_research`, `batch_status`, `list_targets`, `get_budget`, `set_budget`, `delete_briefs`, `get_lessons`, `propose_lessons`, `decide_lesson`, `log_touch`, `set_touch_outcome`, `get_touches`, `pilot_result` | offers (`gt_offers`), profile in the competitor agent | REAL: 6 (offers, briefs, decide, start, status, budget); none for touches/lessons |
| contact-skill | `create_contact`, `get_contacts`, `get_contact`, `update_contact`, `delete_contact`, `reactivate_contact`, `add_channel`, `delete_channel`, `assign_to_campaign`, `update_stage`, `get_pipeline`, `get_stats`, `get_prospect_contacts`, `add_contact_manually`, `list_brief_contacts`, `promote_from_brief` | no | REAL: 4 |
| journey-skill | `get_journey`, `list_journeys`, `advance_journey` (+ `journey.service.ts` used by every mover) | no | PREVIEW: list |
| story-skill | `create_story`, `approve_story`, `list_stories`, `list_kinds`, `recommend_topic` | intended: profile, brand, brief evidence (agent draft ✗) | PREVIEW: 3 |
| cadence-skill | `reserve_touch`, `cancel_reservation`, `get_cadence`, `get_policy`, `set_policy` | no | PREVIEW: policy, reserve; console also calls non-existent `reservations` |
| attention-skill | `get_attention`, `decide_attention` | no | PREVIEW: both |
| channel-skill | `get_channel_types`, `get_channels`, `get_channel`, `create_channel`, `update_channel`, `delete_channel`, `test_channel` | no | PREVIEW: `get_channels` |
| storyteller-skill | routes `/storyteller/build`, `/:id`, `/:id/approve`, `/:id/qa`, public `/share/:token` | profile + KG (`storyteller.agent.ts`) | none in GTM |
| campaign / sequence / icp / gtm-analytics / pulse | 8 / 10 / 7 / 7 / 9 functions | no | none — dormant by ruling (journey-campaign §2.4; POA-journey-campaign §3) |
| etl (`src/etl`, REST not skill) | `/etl/upload`, `/headers/:fileId`, `/sessions` (GET/POST), `/sessions/:id/process|status|records|reprocess|sync-stats|staging(DELETE)|conflicts/resolve|records/:recordId(PATCH)`, `/tags` (GET/POST) | no | REAL via `live-transport.ts` `PLATFORM_ROUTES` `etl.*` |

Every skill function: `(params, ctx) => Promise<Result>`, `ctx = {tenant_id,
is_live, user_id, db, is_admin}` from the JWT; writes via `ctx.db.transaction`;
SQL in `queries/`; RLS via `withTenantClient`. Idempotency-Key is sent by the
console on every write and honoured by no endpoint yet (`gtm-audience/INTEGRATION.md`;
POA schema `vani_idempotency`).

### 5.2 Agents and events (`agent-core/worker.ts` `AGENT_REGISTRY`)

| Event | Handler | Emitted by | Human gate |
|---|---|---|---|
| `COMPETITOR_RESEARCH_REQUESTED` | `CompetitorResearchAgent.run` | `POST /vani/competitors/research` | wizard keep/remove |
| `ACCOUNT_RESEARCH_REQUESTED` | `AccountResearchAgent.run` (`account.agent.ts`) | `research-skill.start_research` | `decide_brief` |
| `FIT_LESSONS_REQUESTED` | `FitLessonAgent.run` (`lesson.agent.ts`) | `research-skill.propose_lessons` | `decide_lesson` |
| `PROFILE_COMPLETE` | **none** (`worker.ts:227` comment) | `profile.routes.ts:210`, `vani.agent.ts`, `profile.service.ts:472` | — the trigger fires into silence (rule 12 violation per POA §0 p7) |
| `KNOWLEDGE_UPDATED` | profile recalc + vocabulary draft (`generateClusters`) | ingestion | wizard ICP card ratifies clusters |
| designed, ✗ | `CONTACTS_PROPOSED`, `STORY_REQUESTED`, `STAGE_DECISION_REQUESTED` (journey-campaign §5); `PROSPECTS_IMPORTED` (PRD M6 — dropped in favour of landing + research) | | `awaiting` + REST answer, existing pattern |

Run mechanics carried from the platform: `gt_events` claim by CTE (never `IN
(SELECT … LIMIT)`), heartbeat `started_at`, `reclaimStaleEvents`,
`WORKER_MAX_ATTEMPTS`; `llm.gate.ts` one platform LLM call at a time;
`charBudgetFor` for any prompt that pastes crawl text or nodes; failover only
with `allow_failover` when `HAIKU_DEFAULT=false`; BYOK never fails over.

### 5.3 The ETL pipeline (`src/etl/`)

`excel-parser` → `entity-detector` (header matching, `COMPANY_FIELD_MAP` /
`CONTACT_FIELD_MAP`, de-indexes `REP_BY1/POST1`) → `mapping-plan` (qualified
keys; human override is law) → staging (`ki_import_staging.mapped_data =
{company, people[]}`, `raw_data`, `completeness`, `validity`, `reject_reasons`,
`dedup_key`) → `landing.ts` (set-based; conflicts held; `campaign_locked`;
people → `gt_contacts` always; companies → `gt_prospects` or pool source rows)
→ `company-matcher.ts` (people → company, code first; not yet wired into
landing). `field-normalizers`: `normalizeDomain` rejects non-hosts, takes the
first of a list; email domain when no website (`domain_source:'email'`),
`FREE_MAIL_DOMAINS` guard; PIN → `state_code`. `industry-normalizer.ts`:
manufacturing + 8 sub-clusters, hardcoded (pilot-shaped).

### 5.4 The governor (223, `cadence-skill`)

Rolling window (never calendar); prospective (a reservation is what the next
planner collides with); sent + held both count; keyed on the CONTACT, blind to
opportunity and channel by design; a moved slot carries `requested_at`,
`scheduled_at` and a reason (CHECK refuses a silent move); saturation writes
nothing and returns when the window clears; policy resolution channel → tenant
default → built-in (`source:'built-in'` reported). Timezone on the policy.
In-process, one tenant, one governor. Assisted touches must consume slots
(outreach §6) — enforced only if they are logged.

### 5.5 What reads the Brain today, and intended

| Reader | Today | Intended |
|---|---|---|
| competitor agent | `gt_tenant_profile` (`load_profile`), approved clusters (note `research.agent.ts:221` — clusters ratified at step 3 but consumed at step 2, so they may never fire; unverified after the vocabulary reorder) | `brain.context('competitor_research')` |
| account agent | `gt_offers` catalogue + `gt_prospects.industry_raw`; nothing from the KG (research §4 "every brief is produced in isolation") | `brain.context('account_fit')` with offers, lessons, vocabulary, brand |
| storyteller | `gt_tenant_profile` + all KG nodes, trimmed by `charBudgetFor` with dropped-node count | same through `brain.context('story')` + brief evidence |
| GTM landing | **PREVIEW** fixtures | `brain.context('gtm.readiness')` — profile completeness, offers confirmed, clusters approved, brand approved, competitors confirmed → weakest object + link |
| `brain.context(purpose)` | ✗ (grep `agent-core/`: no `brain.*`) | POA Track D2: one service, profile + relevant subgraph + vocabulary + offers + brand under `charBudgetFor`; retrieval (D4) once the graph exceeds the window |

### 5.6 Console skills and routes (`vani-app/src/skills/gtm-*`, `gtm-nav.ts`)

| Route | Module | Group | Real / preview |
|---|---|---|---|
| `/agents/gtm` | gtm-shell (landing) | organization | PREVIEW `gtm.journey`, `gtm.readiness` |
| `/agents/gtm/offers` | Smart Profile `OffersScreen` in the GTM shell | organization | REAL |
| `/agents/gtm/today` | gtm-today `TodayQueue` | organization | PREVIEW attention-skill |
| `/agents/gtm/audience` (+`?step=people`) | gtm-audience `AudiencePathway` → Bring/Find/Qualify/People | workspace | REAL data; PREVIEW position `gtm.audience_state/advance/restart` (resets on reload; `gt_pathway_state` is a schema question) |
| `/agents/gtm/import`, `/agents/gtm/imports` | gtm-audience `ImportWizard`, gtm-imports | workspace | REAL (`etl.*`, `get_loads`) |
| `/agents/gtm/pool` (admin) | gtm-pool | workspace | REAL |
| `/agents/gtm/motion` | gtm-motion Segment/Story/Cadence/Send | workspace | PREVIEW throughout (`gtm.motion_*`, `gtm.cadence_plan`, segments, stories, cadence, channels) |
| `/agents/gtm/companies`, `/people`, `/journeys` | reference surfaces | workspace | REAL / REAL / PREVIEW |
| `/agents/gtm/channels` (+`/cadence`, `/stories`, `/touches`) | gtm-channels `ChannelsFrame` | workspace | PREVIEW (`get_channels`, `get_policy`, `reservations`, `list_stories`, `list_kinds`, `gtm.touch_log`) |

The console's registry boundary: a skill is one folder plus one line in
`src/skills/index.ts` (vani-app/CLAUDE.md §5); five states per screen through
`<DataBoundary>`; writes through `useSkillMutation`.

### 5.7 Journey reader + pathway definitions (intended)

- **Journey reader (POA B4, now):** one platform renderer (`AgentJourney`)
  reads `gtm.journey` from the server; each step's `done` is a predicate over
  data the console already reads (`gt_tenant_profile.is_complete && offers>0`,
  `briefs_decided>0`, `contacts>0`, `journeys_active>0`, `sending` locked).
  Vara declares its own on the same renderer. No new column.
- **Pathway definitions (POA D5, next):** server-side, code not schema: per
  pathway an ordered step list, done predicates, and the event each completion
  emits. `PROFILE_COMPLETE → propose an audience` is the first wire. The
  pathway's POSITION today lives nowhere (`gtm.audience_state` fixture) — either
  derived from data + run feed, or a `gt_pathway_state` row (schema request).
- **No DAG.** Steps are predicates and events on the existing bus, made
  visible in the run feed.

---

## 6. Data model

All tenant tables: `tenant_id UUID NOT NULL`, `is_live` from the JWT, RLS
policy in the hardened `NULLIF` form (234), forced where owned by
`vanigtm_app` (236; `gt_attention_decision` forced from creation). Cross-tenant
infrastructure (no `tenant_id`, RLS off by design): `gt_data_sources`,
`gt_source_loads`, `gt_load_tags`, `gt_universe_*`, `gt_industries`,
`gt_events`, `gt_prompts`. Tenant-facing ids via `gt_next_seq` over
`gt_seq_counters` (189): `PROS-0001`, `CONT-0001`; raw PKs never in a URL.

### 6.1 Universe / pool model

| Table (migration) | Purpose | Key columns | Invariants |
|---|---|---|---|
| `gt_data_sources` (193) | publishers | `code` (`upload/ftcci/apollo` seeded), `kind directory/provider/upload`, `tier` 0–100 configurable, `default_as_of` | tier is data, re-tune = UPDATE + re-merge |
| `gt_source_loads` (193, 202) | one row per delivery | `source_id`, `label`, `region`, `state_code`, `as_of`, `default_industry_id`, `tier_override`, `tenant_id` (NULL = pool), `file_checksum` sha256, `row_count`, `status active/retired/failed` | unique active checksum per owner (202); rollback unit; tags via `gt_load_tags` |
| `gt_universe_company_sources` (195) | immutable per-source company rows | `(source_id, source_record_id)` UNIQUE, `load_id`, `company_id` (nullable), `name_key` generated, `domain_normalized`, address/pin/state, `industry_raw`, `industry_id`, bands, `linkedin_url`, `description`, `raw`, `source_as_of`, `completeness`, `validity`, `field_quality`, `blocking_key` | never merged; upsert idempotent; companies only |
| `gt_universe_companies` (195) | golden record, derived | same business fields + `field_sources`, `source_codes[]`, `quality_score`, `best_as_of`, `merged_into_id`, `needs_review` | EMPTY today; a loser is aliased, never deleted |
| `gt_universe_company_aliases` (195) | late-merge resolution | `(alias_company_id, company_id)` | tenant prospects resolve through it |
| `gt_industries`, `gt_industry_aliases`, `gt_tenant_target_industries` (194) | taxonomy; per-source alias with `confidence`, `mapped_by rule/llm/human`; ratified tenant industries | | unmapped is visible, never dropped; `icp_industry` prose stays on the profile |
| `gt_record_view` (204/205) | ONE shape over `gt_prospects` + pool source rows | `scope mine/pool`, freshness band, `duplicate`, tags, `is_active` as a column | callers MUST filter `scope`/`tenant_id`/`is_live`; pool only to admins |
| `gt_tags` (199), `gt_load_tags` (199), `gt_prospect_tags` (203) | vocabulary; load tags; direct record tags | `tenant_id NULL` = platform tag; `slug` generated | tags never override derived data (`state_code` from PIN wins) |

### 6.2 Tenant universe

| Table | Purpose | Key columns | Invariants |
|---|---|---|---|
| `gt_prospects` (196, 197, 200, 206, 218) | the tenant's companies | `ref`, `load_id`, `universe_company_id`, `source upload/universe/byo:*/platform:*`, copied company fields, `raw`, quality pair, `source_as_of`, `relationship prospect/customer`, `industry_canonical`, `industry_sub`, `status`, `score` | one active row per domain per tenant/env; adoption COPIES, never references; `industry_raw` never rewritten |
| `gt_contacts` (187, 189, 196, 198, 224) | people | `contact_no`, `normalized_name` (repaired 198), `job_title`, `company_*`, `linkedin_url`, `source`, `external_ref`, `raw`, `score`, `prospect_id`, `brief_id`, load/as-of/quality (198) | always tenant-scoped; no parallel person model |
| `gt_contact_channels` (187, 224) | reachability | `channel_type email/mobile/whatsapp/instagram/twitter/linkedin/other`, `channel_value`, `subtype`, `is_primary`, `source`, `verified_at`, `source_url` | R-C1 as data: every channel says where it was read |
| `gt_account_briefs` (207, 210–213, 220) | what a tenant learned about one company | `prospect_id` FK, `run_id`, `pages_read`, `site_health`, `what_they_make`, `scale_signals`, `service_signals`, `digital_maturity`, `certifications`, `named_contacts`, `fit`, `best_fit_offer`, `recommended_offer`, `human_offer`, `fit_margin`, `hook`, `raw_evidence`, `facts_at`, `judged_at`, `offers_fingerprint`, `status drafted/…/unreadable/extract_failed`, `decision_note` | one per prospect per env; NEVER pooled (rule 13); failure never deletes an earlier brief |
| `gt_offers` (209, 212, 239) | Brain object GTM reads | `offer_key`, `signals[]`, `disqualifiers[]`, `price_band`, `proof`, `commitment entry/project/retainer`, `source`, `confirmed_at`, `is_ready` derived | research refuses until every offer is ready; commitment never in the prompt |
| `gt_segments` (219) | saved definition | `definition` JSONB (same shape as the list filter), `member_count`, `counted_at`, `rules_version` | never auto-recounted |
| `gt_fit_lessons` (214) | Learning Graph | `lesson`, `edited_lesson`, `kind`, `applies_to`, `evidence[]`, `status proposed/accepted/rejected`, `lesson_key` | only accepted reach the prompt; rejected kept |
| `gt_semantic_clusters` (192) | market vocabulary (Brain) | `primary_term`, `related_terms[]`, `cluster_type category/offering/buyer/pain/outcome`, `approved_at` | read by research; Phase 2 adds `vector(768)` (POA D7) |
| `gt_tenant_brand` (193_gt_tenant_brand) | Brain object | voice, visual, proof, `approved_at` | present on disk in this checkout — CLAUDE.md's 2026-08-17 note ("exists in no branch") is stale here; production state unverified |

### 6.3 Staging model (`ki_` by disposition, do not rename)

| Table | Key columns | Notes |
|---|---|---|
| `ki_file_uploads` (104) | file, `processing_status pending/processing/completed/failed` | sha256 computed in the route, stored on the load |
| `ki_import_sessions` (104, 197, 200, 201, 249) | `import_type company`, `destination gt_prospects/universe_companies`, `load_id`, `relationship contacts/customers/dataset`, `extraction_plan`, `status pending/staged/processing/completed/completed_with_errors/needs_review/failed/cancelled` | destination checked against `is_admin`, never the body |
| `ki_import_staging` (104, 197, 200) | `raw_data`, `mapped_data {company, people[]}`, `completeness`, `validity`, `reject_reasons`, `dedup_key`, `processing_status pending/processing/success/failed/duplicate/skipped/conflict`, `conflict_kind in_file/existing`, `conflict_target_table`, `field_diff`, `campaign_locked` | staging always succeeds; the audit trail and replay point |

### 6.4 Cadence / touch model

| Table | Key columns | Invariants |
|---|---|---|
| `gt_touch_log` (221, 223, 225) | `prospect_id NOT NULL`, `contact_id` (nullable — pre-223 rows), `offer` text, `channel email/phone/linkedin/whatsapp/other`, `touched_at`, `outcome` (NULL = no response YET), `outcome_at`, `had_brief` frozen, `story_id`, `created_by` | what WE did; every row consumes fatigue; connectors never write here |
| `gt_cadence_policy` (223) | `scope contact/account`, `channel` (NULL = default), `max_touches`, `window_days`, `quiet_dows`, `quiet_from/to`, `timezone` | built-in 2 per 7 days reported as `source:'built-in'` |
| `gt_touch_reservations` (223) | `contact_id NOT NULL`, `prospect_id`, `journey_id`, `channel email/phone/linkedin/whatsapp/other`, `requested_at`, `scheduled_at`, `moved_reason`, `status held/sent/cancelled/expired`, `note`, `touch_id` → `gt_touch_log` | CHECK `scheduled_at = requested_at OR moved_reason IS NOT NULL`; contact row-locked on grant; `expired` already exists in the CHECK — the assisted-queue expiry (G-53) has a home, nothing writes it yet |
| `gt_channels` (161, 227) | `channel_type email/whatsapp/linkedin`, `status`, `config` (tenant's own creds refs), `channel_type_id` | tenant-owned identity by schema; needs `delivery`, `identity_owner`, `requires_template_approval`, `consent_basis`, `sms`, `x` (pending) |
| `gt_channel_types` (226) | master list, `kind direct/broadcast/asset` | picker + FK for stories |

### 6.5 Journey model

| Table | Key columns | Invariants |
|---|---|---|
| `gt_journeys` (222) | `prospect_id` UNIQUE per (tenant, env), `arc`, `state` (11 values CHECK), `state_reason`, `entered_state_at`, `wake_at` (only when parked), `owner_id`, `offer` (copied at decision), `contact_id`, `story_count` | state is the tail of the events; reason required on exits/backward moves |
| `gt_journey_events` (222) | append-only: actor, from, to, reason, payload (override notes land here) | the truth |
| `gt_content_kinds` (225) | `kind_key`, `scope asset/move`, `channel`, `prompt_key`, `arc`, `stages[]`, system vs tenant rows | open registry (D7), never a CHECK; 8 seeded |
| `gt_journey_stories` (225) | `journey_id`, `seq` UNIQUE per journey, `kind_key`, `author human/agent`, `author_id`, `offer`, `subject`, `body NOT NULL`, `evidence_refs TEXT[]`, `asset_ids BIGINT[]`, `status draft/approved/sent/archived`, `notes`, `approved_by/at`, `sent_as_touch` → `gt_touch_log`, `sent_at` | CHECKs: approved ⇒ approver + time; sent ⇒ `sent_as_touch` + `sent_at`; R-S1/R-S2 re-run at approval; a story with no brief evidence cannot be written |
| `gt_attention_decision` (238) | `prospect_id`, `decision acted/snoozed/dismissed/reopened`, `reason` (required on dismiss), `snooze_until` (iff snoozed), `shown` JSONB, `decided_by` | append-only by trigger; RLS forced |
| `gt_presentations`, `gt_qa_log` (186) | deck assets, share token, audience Q&A | to become the asset library (`kind/arc/stages/body`, D7) |
| dormant by ruling: `gt_campaigns`, `gt_personas` (160), `gt_sequences`, `gt_sequence_steps`, `gt_contact_assignments`, `gt_campaign_metrics` (161), `gt_activity_feed` | | left in place, not read by any pathway; the second touch is a new story, not a scheduled step (D2) |

### 6.6 Proposed additions — PENDING APPROVAL (no SQL until Charan says so)

**The ICP data structure** (`documents/design-notes-icp-data-structure.md`, PROPOSED 2026-09-26):

| Table | Shape | Why |
|---|---|---|
| `gt_universe_people_sources` | immutable per-delivery person rows: `source_id`, `load_id`, `source_record_id` (profile URL else hash of name|company), `full_name`, `name_key`, `title_raw`, `headline_raw`, `company_string`, `email`, `phone`, `profile_url`, `raw`, `source_as_of`, quality pair | the people set as delivered. **Platform-level only if Charan rules people are a shared asset; otherwise the same table takes `tenant_id`** |
| `gt_person_company_link` | `person_source_id`, `company_source_id` (NULL while unmatched), `method key/acronym/tokens/headline/model/human`, `score`, `status matched/gap/none/confirmed/rejected`, `shortlist` JSONB, `decided_by/at` | the club, revisable; a wrong match is a new link, the delivered row untouched |
| `gt_cleanup_gap` | `entity_type`, `entity_id`, `step` (company_match, industry, domain_relation, is_individual, persona…), `reason`, `candidates`, `status open/model_resolved/human_resolved/dismissed`, `resolved_value`, `resolved_by`, `model_cost_tokens` | **Haiku's ONLY work queue** (`WHERE status='open'`); doubles as the correctness report per step per load |
| `gt_personas` + `gt_person_persona` | platform taxonomy (buyer role × function); per-person link with `source list_filter/title_rule/model`, `confidence` | title rules in code; model on the residue via the gap |
| `gt_suppression` | `identifier_hash`, `kind`, `reason`, `source`, `tenant_id NULL = platform-wide`, `created_at`, append-only | prerequisite for contacting anything in the people set; approved together with the people asset, never the asset alone |

Order once approved: chunked upload + landing as a worker job → the migration
(one file, guarded) → companies Pass 0 (code) / Pass 1 (Haiku) → people landing
+ matcher + link rows + gap register → gap worker → persona rules → merge engine
before the second delivery of any list.

**Signals spine** (outreach §9): immutable signal rows keyed by source event id;
revisable resolution link (method, confidence); tenant-scoped; the governor
never reads it. Shape copied from the universe's source/golden split.

**`gt_connectors`** (universe §4.8; never written — the note's "198" is
`gt_contacts_provenance`): `provider`, `base_url`, `auth_method`,
`credentials_ref` (encrypted per tenant like `vani_llm_provider`),
`mapping_template`, `tenant_id NULL = platform`, `is_active`, plus posture
`platform | byok`. A byok pull writes loads + staging rows, lands in
`gt_prospects`, never the pool.

**Also pending, smaller:** `gt_pathway_state` (or derive); `gt_campaign_runs` +
`gt_campaign_members` (D2); `gt_channels` columns + types (outreach §6);
`gt_presentations.kind/arc/stages/body` (D7); `gt_record_view` honouring
`retired` loads; `gt_universe_coverage`; `vani_idempotency`; a tenant
first-party flag.

---

## 7. Non-functional

Pointers to the platform documents (Track A; ARCH.md and AGENTS.md are being
written alongside this spec — rule names below are the ones this spec relies
on and should resolve there):

| Concern | Rule (where) | GTM-specific consequence |
|---|---|---|
| Tenant + environment isolation | ARCH.md "Tenant isolation" (CLAUDE.md rules 1, 8; RLS via `withTenantClient`) | every list query filters `tenant_id` + `is_live`; pool reads are admin-only until entitlement; `gt_record_view` callers filter `scope` |
| Transactions | ARCH.md "Every write in a transaction" (rule 2) | journey moves take the caller's `tx`; `approve_story` moves the journey in the same tx |
| No silent fallbacks | AGENTS.md "Rule 12" | budget stop is a STOP; unreadable ≠ guessed; PREVIEW is a declared, badged list, never a fallback; unconsumed events (`PROFILE_COMPLETE`) are a violation to fix |
| Agent proposes, human confirms | AGENTS.md "Human gate" (rule 9) | seven gates: offer, verdict, person, story, stage, lesson, attention |
| Evidence | AGENTS.md "No claim without evidence" (rule 9d) | `raw_evidence`, `source_url` on channels, R-S1 on stories, lessons must cite companies |
| Research never pools | ARCH.md "Rule 13" | FK-enforced; no code path may add one |
| Token/cost | AGENTS.md "Budget is the authority" (`charBudgetFor`, `llm.gate`, per-tenant cap opt-in 217) | `get_budget` in companies; BYOK uncapped, metered, never failed over |
| Append-only records | ARCH.md "Ledgers" | `gt_journey_events`, `gt_attention_decision`, `gt_touch_log.had_brief`, future suppression |
| Idempotency | ARCH.md "Store-and-replay" (`vani_idempotency`, pending) | every console write sends a key; unfinished until the server half lands |
| Empty states | vani-app/CLAUDE.md five states; CLAUDE.md 9b | `get_attention.empty_state`; hot list unfed says "bring a list, or connect a source" |
| Dates | `lib/format.ts` `DD-MMM-YYYY` | as-of, freshness, wake dates |
| Migrations | manual, guarded, idempotent; next number 254; never reuse | every table in §6.6 is one guarded file |
| Deploy facts | worker on the Main VPS runs but its supervisor is not in the repo; `SEARXNG_URL`, `/api/v1/etl/` nginx location | re-check before planning on the queue or on search |

---

## 8. Open decisions (each carries a default until ruled)

| # | Decision | Owner | Default until ruled | Blocks |
|---|---|---|---|---|
| O-1 | **People at platform level** — a shared people asset keyed to pool companies, or tenant-scoped only | Charan | tenant-scoped (`gt_contacts`); the proposed table takes `tenant_id` | E4 G-24/25, the vendor people dataset |
| O-2 | **Consent / suppression model** (POA D9) — one design for GTM outreach and Vara intake, append-only | Charan (design first) | nothing sends; Activate stays locked and says so | E8 entirely; O-1 |
| O-3 | **Cleanup source go** — model-derived text (Pass 1 industry/offering/buyer, domain relation, `is_individual`) enters the pool under its own tier | Charan | not started; pool holds delivered data only | E5 G-30, coverage, hot list quality |
| O-4 | **Datasets as CSV** — the ~400k + ~200k company records and the people export obtained as real exports (not screen copies), profile URL kept, one invoice line saying "unrestricted use" | Charan | nothing landed from pastes | E5, E2 G-10 |
| O-5 | **Entitlement for the pool** — which plans read it (POA D4 `vani_entitlement`), and whether a tenant with zero matched coverage is shown a number at all | Charan | admin-only; tenants see "not yet connected" | E2 G-10, CRO push |
| O-6 | Where a new GTM tenant lands — landing with the rail (recommended) vs Today | Charan | landing | E1 |
| O-7 | Pathway position — `gt_pathway_state` row or derived from data + run feed | Charan | derived (no schema) | E1 G-02, motion stepper |
| O-8 | Vara and GTM share `gt_channels` and one cadence budget | Charan | yes (governor is contact-keyed) | E6 G-41 |
| O-9 | Journey `state` (what we owe) vs `posture` (where they stand) — two vocabularies coexist? (Q5) | Charan | state only | E9 G-56 |
| O-10 | Bulk story approval (D5) | Charan | later; every move approved individually | E6 |
| O-11 | Retiring a pool delivery honoured by `gt_record_view` | Charan | operator SQL | E5 G-33 |
| O-12 | Provider-licensed company data (the 27-record shape) — pool-grade only if the licence permits cross-tenant sharing | Charan, before buying | ask first | E5 |

---

## 9. Superseded / source documents

**Superseded (read for intent, not for state):**

| Document | Status |
|---|---|
| `PRD-VaNi-GTM.md` §4 M3–M9 (May) | M3 → research-skill (built, outward from vocabulary). **M4 Digital Audit → Nova N1, not GTM.** M5 Campaigns → dormant tables; the journey model replaced multi-step sequences (D2). M6 Prospects: CSV upload ✅; "universal BYO connector" → the three postures (upload/platform/byok), `gt_connectors` ✗; "platform credits" and a **Scoring Agent vs personas → dropped** in favour of research fit + human verdict; `PROSPECTS_IMPORTED` never emitted. M7 Storyteller v1 ✅; v2 → story-skill moves + asset library. **M8 Outreach executor → not built and now consent-gated**; "sender hygiene" → the governor. M9 War Room → superseded by `/today` + journey board; the analytics skill reads demo-seeded tables. M10 Creative → later. §5 agent fleet: Prospecting, Scoring, Outreach, Conversion, Feedback, Orchestrator ✗ |
| `POA-VaNi-GTM.md`, `GTM-AGENT-ROADMAP.md` (May) | superseded by `POA-2026-09-30-platform.md` |
| `design-notes-gtm-pipeline-v2.md` (five stages) | stages 1, 3, 4 landed as research / ICP / story; "business model analysis" never committed; deck removed from the critical path (done) |
| `design-notes-marketing-playbooks.md` | blueprint for agent drafts (story kinds, campaign brief shape, brand-review gate); nothing built from it yet |
| CLAUDE.md "Deliberately not being built": email sending · Storytelling/Campaigns/Follow-ups; KG as a product surface | both SUPERSEDED (2026-09-22, 2026-09-26) — see CLAUDE.md for the replacement rulings |
| journey map "Today: `/today` shows the Brain card" | partly stale: `TodayQueue.tsx` exists at `/agents/gtm/today`, on fixtures |
| CLAUDE.md "gt_tenant_brand exists in no branch" (2026-08-17) | `193_gt_tenant_brand.sql` is on disk in this checkout; production unverified |
| universe note's migration numbers (193–201) | drifted: 194 is industries, 196 is prospects, 198 is contacts provenance, no 198 connectors |

**Sources (authority, in this order):**

1. `HANDOVER.md` — STANDING PRODUCT DECISIONS; §3 GTM (2026-09-29); START HERE; WHAT IS VERIFIED.
2. `CLAUDE.md` — Product model; EVERYTHING enters through staging; FTCCI through the real pipeline; The pool's sources are decided; Charan's stated priority; Deliberately not being built (superseded parts); Touches and signals; rule 12, rule 13.
3. `documents/gtm-journey-map.html` (22-Sep, six stations + G2 + ten breaks + six decisions + the declared journey); `documents/gtm-ux-playground.html` (synthetic, the shapes only).
4. `documents/design-notes-research.md` · `design-notes-prospect-universe.md` · `design-notes-icp-data-structure.md` (PROPOSED) · `design-notes-outreach-and-delivery.md` · `design-notes-journey-campaign.md` (+ `POA-journey-campaign.md` §5 status) · `design-notes-gtm-pipeline-v2.md` · `design-notes-marketing-playbooks.md`.
5. `documents/POA-2026-09-30-platform.md` §0, §2 (D4, D5, D9), §6 Track D, §9 Track G, §10.
6. `docs/gtm/attention-query.md`.
7. Schema: `backend/migrations/` 104, 160, 161, 186, 187, 189, 192, 193 (×2), 194–207, 209–214, 217–227, 231, 238, 239, 249.
8. Code: `backend/src/skills/{prospect,research,contact,journey,cadence,attention,story,storyteller,campaign,sequence,channel,icp,gtm-analytics,pulse}-skill/SKILL.md` + `functions/`; `backend/src/etl/{landing,company-matcher,entity-detector,mapping-plan,etl.routes}.ts`; `backend/src/agent-core/worker.ts`; `backend/src/config/attention.config.ts`.
9. Console: `vani-app/src/skills/gtm-shell/gtm-nav.ts`, `gtm-shell/mock.ts`, `gtm-{audience,motion,people,pool,companies,imports}/INTEGRATION.md`, `gtm-*/mock.ts`, `gtm-*/screens/*.tsx`, `src/lib/preview.ts`, `src/lib/live-transport.ts`.

*Not consulted (unverified for this spec):* production `vani_gtm_db`; the Main VPS worker log; `vani-app/docs/gtm-ux-poa.md` beyond its preview inventory line; `documents/gtm-engine-ui/*.html` mockups.
