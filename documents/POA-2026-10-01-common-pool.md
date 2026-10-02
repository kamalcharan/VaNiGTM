# POA — The common pool, enrichment and the road to a campaign · 2026-10-01

> Source: Charan's spec "VaNi GTM — Common Pool & People Data" (1-Oct-2026,
> 16 pp.) and the discussion that followed it the same day. This plan
> replaces the spec's table design with the one already in the repo and
> records every decision taken. Companion to `POA-2026-09-30-platform.md`
> (where it is Pending 7, "the common pool").
>
> Discussion only so far — **no code until P0 is approved.** Each phase is two
> sprints, each ending in a checkout (§3); agents follow `AGENTS.md` §6a–§9a
> (risk classes, eval tiers, self-awareness, agentic IX).

---

## 0. Decisions (Charan, 2026-10-01)

| # | Decision |
|---|---|
| D-P1 | **Opt-out as D9-a.** Unsubscribe is per tenant; bounce, complaint and erasure are platform-wide |
| D-P2 | **Suppression as D9-b.** Keyed hash (`SUPPRESSION_HASH_KEY`), not plain sha256 |
| D-P3 | **Duplicates are flagged, never merged.** A shared domain is a strong candidate for review, not an automatic merge (FTCCI: 137 rows share a domain with a different company) |
| D-P4 | **Pool enrichment is Vikuna's.** Admin starts it; its output (crawl, model classification) may enter the pool, labelled with its own source. A tenant's segment never triggers pool enrichment |
| D-P5 | **People's names never enter the pool** — not from a crawl, not from a directory |
| D-P6 | **The pool is the master; a tenant works on its own copy.** Adoption copies (as `gt_prospects` already does, migration 196); pool improvements reach a tenant as an offer to refresh with a diff; tenant edits never flow back |
| D-P7 | **Everything enters through staging, and reaches the pool only when it passes the Complete test** (§1) |
| D-P8 | **VPS space is Charan's to provide; proper isolation (the `vanigtm_app` cutover) lands before the people layer** |
| D-P9 | **Projects (ContractNest, DristiQ under Vikuna) are deferred.** Not a blocker for the pool. One yellow flag for P7: under D-P1 an unsubscribe from one project silences the other, because both are one tenant — decide before the people layer |
| D-P10 | **Junk is a state, not a deletion** |
| D-P11 | **Enrichment is started by a person:** admin for the pool and Vikuna's own copy; a tenant for its own copy only. Daily limits per kind of work, tightest where the model is used |
| D-P12 | **Every enriched value names its source** — website, file, LinkedIn, X, Facebook, MCA, Udyam, chamber, trade show, provider, manual |

Judgement calls Charan delegated ("I will leave the best judgement to you"):

| # | Call | Why |
|---|---|---|
| J1 | Email "risky" / "catch-all" never pass Exit for an automated send; allowed for a manual one-to-one email a person sends themselves | Automated sends to unverifiable addresses are how a sending domain loses its reputation, and every tenant on it suffers |
| J2 | Role addresses (`info@`, `sales@`) pass Exit, tagged company-level: the story is written to the company, never as if to a named person; at most one role address per company per campaign | They are often the only reachable address, and they are not personal data in the same way |
| J3 | **Superseded by Charan, 2026-10-01** (P0-mapping §10): a tenant is capped in TOKENS — 100,000/day and a monthly cap, covering all intelligence, every model lane; the admin enters the number of records per run. Code and crawl keep only infrastructure rate limits. Paid providers keep a monthly ₹ cap, unset = refused | the cap is a tier decision, shown to the tenant in records as well as tokens |
| J4 | Coverage weights: response 25 · people 20 · verified contact points 15 · identity 10 · firmographics 10 · research 10 · signals 5 · freshness 5 | A reply is worth more than any amount of data; people are the asset (Charan, 26-Sep) |
| J5 | Junk: admin marks and reverses on the pool; a tenant marks and reverses on its own copy, and can *report* a pool row, which goes to the admin's review queue | A tenant must not be able to hide a company from everyone else |
| J6 | LinkedIn, X and Facebook are sources of **URLs and owned exports** (a company page linked from its own site, a URL the tenant gives us, Charan's LinkedIn data export) — never scraped content | Scraping breaks their terms, risks the tenant's account and has been litigated; the spec already puts scraping out of scope |

---

## 0b. Decisions (Charan, 2026-10-02) — enrichment first; supersede where they conflict

| # | Decision |
|---|---|
| D-Q1 | **Order: upload → stage → ENRICH (qualify) → research → … The same order for a tenant's own upload and for the pool.** Matching across sources is a LATER stage; with one source per company it is a no-op and it never leads the screen. (P1-B built the matching first — that was the wrong order; the code stays underneath as the anchor each record's mini KG hangs on, and runs silently.) |
| D-Q2 | **Enrichment reuses the Smart Profile agent** — the same site reader, pointed at a company in the list — and writes that company's **mini knowledge graph** (ontology v1) plus its typed fields. Homes: the pool company graph (admin, R2) and a tenant's **account graph** keyed to `gt_prospects` (tenant, R1) — needed now, not at P7. |
| D-Q3 | **The common pool screen is the admin's enrichment workbench**: how much is ready for Exit, what is missing, which enrichment fills it, and the percentages rising after each run. Admin only; tenants never see it. |
| D-Q4 | **Score 0–100 in seven parts** (weights agreed): Identity 20 · Firmographics 20 · Digital presence 10 · Contact points 20 · People 15 · Research 10 · Signals & response 5. People, research and response are tenant-side, so a pool company tops out near 70. *(Contact points took freshness's 5 — confirm.)* |
| D-Q5 | **Levels:** Raw 0–19 · Identified 20–39 · Qualified 40–59 (passes Complete) · Reachable 60–74 · Campaign-ready 75–89 (and the Exit gate passes) · Strong 90–100. |
| D-Q6 | **Exit is a gate, never a score** (§1.2): company Complete/active/not junk/no open duplicate; a named person with a persona and lawful basis; a verified channel; `mayContact` + a governor slot. Not configurable. |
| D-Q7 | **Weights and level boundaries are configurable**: a platform default (admin) and an optional per-tenant profile (owner/admin), versioned, re-scored on change, every score naming its version. The pool always uses the platform default. (S17) |
| D-Q8 | **Freshness is not scored.** Every record and delivery shows "Last refreshed" (the later of its delivery date and its last enrichment run). |
| D-Q9 | **The industry master moves to Settings, admin only.** |
| D-Q10 | **One tenant context** (`tenant.context`), read by agents, routes and the console: commercial status, tokens, agents, model, scoring profile, brand, industry (→ the master), consent, domains. Read-only aggregation over the owners' tables; the Brain stays separate. |
| D-Q11 | **Commercial:** the product will be paid by tenants; billing is not built, so every tenant is active and treated as paid. `vani_tenant.status` (active/suspended) is the switch. |
| D-Q12 | **Tokens:** 100,000 a day and 2,000,000 a month per tenant (`.env` defaults; a tenant's own limit overrides). The daily limit never rises. **A top-up is a balance**: once the day's (or month's) base is used, calls draw from the top-up until it is spent, then stop with the numbers. Admin adds top-ups by hand until billing exists (S18). Own-key (BYOK) tenants are not capped; usage is always metered. Today NO cap is enforced (migration 217 cleared them) — this decision is built in P2-B. |
| D-Q13 | **Enrichment does not complete without the model rotation (Charan, 2026-10-02):** "only qwen and haiku won't be sufficient". The rotation moves from P3 to **P2-R, ahead of the enrichment agent**. It lives in `agent-core` under `callLLM`, not inside enrichment, so the reused Smart Profile agent goes through it without knowing it exists. |
| D-Q14 | **Providers and routes come from `.env`, in Charan's shape:** `LLM_PROVIDERS=groq,openrouter`; per provider `LLM_<CODE>_URL / _KEY / _MODEL / _CTX`, plus `_RPM`, `_DAILY`, `_DATA_TERMS` (`no_training · may_train · unknown`); routes `LLM_ROUTE_HIGH / _MEDIUM / _LOW` = ordered provider codes. `qwen` in a route means the existing platform model (`LLM_PRIMARY_*`) and `haiku` the existing Claude settings — never defined twice. Each step declares its class (HIGH = judgement: industry from a description, domain-matches-company; MEDIUM/LOW = short extraction, normalising). Startup refuses a route naming an undeclared provider, a provider missing any setting, or an empty route. Supersedes the `LLMPOOL_*` names in P0 §9.5. |
| D-Q15 | **How a route moves:** a 429, a timeout or a spent quota moves the call to the next provider, cools the first one down, and shows as a step in the run. A bad answer (validation failed) is not retried silently elsewhere — it goes to the next rung or to abstain (P0 §9.1). Before each call the data gate skips `may_train`/`unknown` providers for tenant data and people data. Every answer carries `provider:model`. Every token counts against the tenant's budget (D-Q12), whichever provider served it. BYOK tenants never enter the routes. |
| D-Q16 | **Settled (Charan, 2026-10-02):** (a) Haiku is the explicit last rung of the HIGH route, replacing the separate failover for routed calls. (b) **S19** — one usage row per model call (provider, model, step, route, rung, tokens, outcome, latency), from which quotas, cooldown evidence and tenant usage are counted; it absorbs the per-call telemetry table of Sprint 0a part 2 and S13's `gt_enrichment_usage` — **approved 2026-10-02**. |
| D-Q17 | **The admin switches each model on or off for enrichment; whatever is on runs (Charan, 2026-10-02).** `.env` declares what a provider IS (URL, key, model, window, quota, data terms); the switch decides whether enrichment may USE it. A route skips switched-off providers; a route with nothing on stops its steps and says so (rule 12 — never sent to an off model, never guessed). Switching Haiku off means enrichment spends nothing on paid models. A switch applies to new calls; a running call finishes. Every switch records who and when. Stored in **S20** (**approved 2026-10-02**); a provider newly added to `.env` starts **off**, so nothing new is used — or paid for — until the admin switches it on. Applies to enrichment only; interactive Smart Profile calls keep their route. |
| D-Q18 | **Review of the P2-A prototype (Charan, 2026-10-02):** the token budget is the TENANT's — every token a tenant's run spends counts, whichever model served it (D-Q15 stands); the admin's pool runs are limited by record count, not tokens. After research, the company page adds the tenant's fit — ICP, TAM and offers relationships — as edges in the tenant's account graph only (rule 13). Contact points = 20 confirmed (D-Q4). |
| D-Q19 | **Release 4 — enrichment, agreed by Charan 2026-10-02 (E1–E7):** **E1** model-derived company facts may enter the common pool, as a separate `enrichment` source ranked below delivered data, every value labelled with its page, model and confidence, and withdrawable run by run (a run is a load) — research output still never does (rule 13). **E2** S16 approved (pool company graph, tenant account graph, concept catalogs), built in the second half of the release, after typed fields and scores. **E3** pool first: pool company facts are public and may use the free models; tenant enrichment follows (Haiku within the tenant's tokens, or adopting enriched pool facts once tenant lists are matched). **E4** pool runs are limited by RECORDS a day from `.env`, metered apart from any tenant's tokens. **E5** v1 enriches companies that already have a domain; domain discovery (SearXNG) is its own task. **E6** JavaScript-only sites are marked "site unreadable" with the reason; the headless reader (n8n) comes later. **E7** Groq's data terms are read before tenant data may reach it. |

## 1. The three tests

Every record is judged three ways. Only the first two are gates.

| Test | Question | Gates |
|---|---|---|
| **Complete** | Is this a real, identified business we can stand behind? | staging → pool |
| **Exit** | Can a campaign legally and usefully reach someone here, on this channel? | pool / own copy → campaign |
| **Coverage** | How much do we know, and how far do we trust it? | ranking only |

### 1.1 Complete — a company is admitted to the pool when it has

1. a clean name — normalised; not a placeholder, test string or address;
2. **one identity anchor** — verified domain, or CIN / LLPIN / GSTIN, or name + PIN;
3. a location — at least state or city;
4. an industry — NIC code or our own category;
5. a domain lookup *attempted* — found, or recorded "none found";
6. a match decision — new, linked, or flagged duplicate;
7. a type — company, or individual practitioner (CA, advocate);
8. a legal status where a source gives one — active, struck off, dormant.

Gaps after that are allowed and recorded; Coverage reflects them.

### 1.2 Exit — the minimum for a contact to enter a campaign (per channel)

**Company** — Complete; active (not struck off); not junk; no unresolved duplicate flag.

**Person** — a named person linked to the company, *or* a role address marked as one (J2); a title mapped to a persona; source and lawful basis recorded.

**Channel**
- Email — verified `valid` within 180 days (J1); not free-mail; legacy-directory addresses only after re-verification.
- WhatsApp — a valid mobile **and** opted in.
- SMS — opted in, and DLT registration in place.

**Gate** — `comms/may-contact.ts` allows it (not suppressed; the tenant's DPDP acknowledgement in force) and the cadence governor (223) has a free slot.

### 1.3 Coverage — 0 to 100 (J4)

Identity · firmographics · people (count, a decision-maker present) · verified
contact points · research (a brief exists) · signals (trade show, new
registration, chamber) · **response** (replies, visits) · freshness.

Response comes from the **signals spine**, never `gt_touch_log`: engagement
raises strength without consuming the governor's budget
(`design-notes-outreach-and-delivery.md` §9).

### 1.4 A record's lifecycle in staging

```
received → parsed → ┬ JUNK (reason)              kept; reversible (J5)
                    ├ DUPLICATE of X (flagged)   linked; never merged
                    └ matched → enriching ┬ COMPLETE → admitted to the pool
                                          └ HELD → a person decides
```

Junk reasons: placeholder / test · unreadable · consumer (B2C) · defunct ·
out of scope (e.g. foreign in an India list) · spam source.

---

## 2. The spec's tables, mapped onto what exists

The spec's 14 `pool_*` tables are indicative; it asks for this mapping
before anything is created. **Extend, don't duplicate** — two pools is the
worst outcome, and rule 5 says `gt_`.

| Spec | Exists | Change needed |
|---|---|---|
| `pool_source` | `gt_data_sources` | + licence class, + may-enter-pool flag |
| `pool_ingest_batch` | `gt_source_loads` (+ checksum guard, 202) | + cost, + who ran it |
| `pool_raw_record` | `ki_import_staging` | + lifecycle state (§1.4), + junk reason |
| `pool_company` | `gt_universe_companies` (195) | + CIN, LLPIN, GSTIN, legal status, class, incorporated, capital, NIC codes, is_individual, is_foreign, social URLs, coverage, admitted_at |
| `pool_company_attribute` | `gt_universe_company_sources` — one immutable row per source, field-level provenance | + method (import/crawl/llm/provider/manual), confidence |
| `pool_company_alias` | `gt_universe_company_aliases` | — |
| `pool_company_signal` | — | **new** `gt_company_signals` |
| `pool_match_review` | `needs_review` in staging; `gt_cleanup_gap` proposed | approve `gt_cleanup_gap` (ICP design note §2.3) |
| `segment` | — | **new** `gt_segments` |
| `person` | `gt_contacts` (187, provenance 198, evidence 224) | + lawful basis, + persona |
| `person_role` | `gt_person_company_link` proposed | approve (ICP design note §2.2) |
| `contact_point` | `gt_contact_channels` | + verification state and date, role/free-mail flags, per-channel permission |
| `suppression` | `vani_suppression` (260) — live | — |
| `enrichment_job` | — | **new** `gt_enrichment_requests` (estimate → confirm → run, per-kind daily usage, ₹ spend) |
| hand-off (UC10) | `gt_prospects` (196) + governor (223) | segment → adopt into the tenant's copy |

**Every row marked "+" or "new" is a schema change for Charan's approval at
the P0 gate** (CLAUDE.md: no table, column, enum or index without it).

---

## 3. How every phase runs — sprints, UX, checkout

Charan, 2026-10-01: "every phase to be like a couple of sprints with checkout."

**A phase is two sprints** (one where noted). Each sprint ends in something
visible on the deployed stack and a **checkout** — nothing merges to `main`
without one.

| Sprint | Opens with | Ends with |
|---|---|---|
| **A — shape** | the phase's **UX prototype** (static HTML in `documents/prototypes/`, like the reviewed GTM/Vara journeys) reviewed by Charan; schema for the phase approved | backend core + its tests; the prototype's screens wired to fixtures |
| **B — make it real** | the review notes from A | screens on real data, agentic patterns in place, evals, docs — then checkout |

### 3.1 The UX layer

- **Prototype before wiring, every phase.** The screens are drawn first,
  reviewed, then built. An external UX audit runs at three points: after P2
  (staging + enrichment), P5 (review + coverage) and P9 (segments + Exit).
- **Where screens live:** `vani-app/src/skills/gtm-*` behind the registry
  boundary; pool and steward screens `adminOnly` under `gtm-pool`; limits and
  spend under Settings. No new top-level destination.
- **Agentic IX on every screen that runs an agent** (`AGENTS.md` §9a): the
  agent proposes the next step, its work streams live, it stops at decision
  cards that show evidence, confidence and its track record; conversation
  steers, never leads.
- **Five states, phone width, rule 9b** (every empty state names its next
  action) — as for every console screen.

| Phase | Screens | Agentic pattern carried |
|---|---|---|
| Sprint 0 | run feed, decision card, `/runs/awaiting` on both | live work, decision cards |
| P1 | Sources (loads, states, junk, held) | junk/held as decision cards |
| P2–P3 | Enrich: select → estimate → confirm → live run → results | proposes, estimates cost, streams, abstains visibly |
| P4 | Government data pulls; signals on the company card | resumable run, live progress |
| P5 | Review queue; Coverage on the company card | side-by-side decision cards with provenance |
| P7 | People (tenant copy), adoption with refresh diff | proposes who matters, persona with confidence |
| P8 | Verification; Spend vs cap | estimate → confirm, cap visible |
| P9 | Segment builder; reachable vs not, with reasons | proposes a segment from the ICP; Exit reasons |

### 3.2 Checkout — the definition of done for a sprint

A sprint checks out when Charan says so, after every line below is true:

1. **Demo** — the visible thing runs on vani.vikuna.io → api.vikuna.io
   (deployed, not a laptop), shown end to end.
2. **UX** — matches the reviewed prototype; five states; phone width; no
   horizontal scroll; screenshots attached.
3. **Tests** — unit + DB tests (three-check pattern, restricted role), CI green.
4. **Evals** — any prompt or model touched: offline report, no regression;
   shadow report before promotion (`AGENTS.md` §7).
5. **Risk** — every new action declared with its class (R0–R5); R3/R4 refuse
   without approval; limits hold under a forced overrun.
6. **Ops** — migrations applied by the runner and `--status` clean on the VPS;
   backend deployed; nginx copied if it changed.
7. **Docs** — ARCH / AGENTS / specs / CLAUDE / HANDOVER updated where touched;
   this POA's status table updated.
8. **Sign-off** — Charan: "checkout" → merge to `main`.

---

## 4. Phases and sprints

> **Revised 2026-10-02 (D-Q1–D-Q12).** The order below replaces P2–P5 as
> first written; the original sections stay underneath as the record of what
> each phase was meant to contain.
>
> | Step | What | Needs |
> |---|---|---|
> | R | Release 2026-10-02b on the VPS (uploads temporary, P1-B, Sprint 0a part 1) | Charan: deploy as is, or with the pool screen reverted to its earlier form |
> | **P2-A** | **Prototype** (runs in parallel with P2-R): a tenant's upload → enrich → score rising → a record with its mini KG; the admin pool workbench (readiness, coverage, deliveries); Settings → Scoring, Industry master, Tokens & top-ups | review |
> | **P2-R** | **Model router** (D-Q13–D-Q16): providers and routes from `.env`; quotas per minute and per day held in Postgres across the API and the worker; cooldown on 429; data gate; route class per step; per-provider window so a prompt is rebuilt when the rung changes; `provider:model` on every call; S19 usage rows; admin Settings → Models (providers, quota left today, cooldowns, calls by route) | S19, S20 |
> | **P2-B** | **Foundations**: `tenant.context`; tokens (S15 build: `.env` defaults, monthly check; S18 top-ups ledger, consumed after the base); the scoring engine + S17 profiles; score and parts per record (pool + tenant copy), "last refreshed"; Settings screens; industry master moved | S17, S18 |
> | **P2-C** | **Enrich**: the site reader pulled out of the Smart Profile unchanged (proof: identical Smart Profile output); the enrichment agent (select → estimate → confirm → run live, batch lane, cost per run); the mini KG (S16 widened: pool graph + tenant account graph + concepts); before/after on every run; the pool workbench and the tenant's Companies screen rebuilt on it | S16 widened |
> | P3 | Model enrichment at scale on the router: golden-set admission of each provider per step, the audit sample, Anthropic batch mode, the 100-record cost trial; industry mapping and company-or-individual decided by model with abstain | S12–S13 (approved) |
> | P4 | Research on qualified records only (the existing account research, gated by level) | — |
> | later | Matching across sources and the merge review · government data · review queue · people (P7) · verification and providers (P8) · segments and Exit (P9) | their own approvals |

### 4a. The release train — to "enrichment complete" (2026-10-02)

One train, six releases. Each release ships something a person can see, and
leaves only after its checkout (§3.2). Approvals named in a row gate that
release, not the ones before it.

| # | Release | What is achieved — what Charan sees | Gated on | Checkout |
|---|---|---|---|---|
| 0 | **R — 2026-10-02b** | Uploads are temporary (metadata kept, same content refused even renamed); large CSVs staged by the worker and followed live; the pool engine (Complete test, decisions, retire a delivery) underneath; runs stream live; risk classes enforced | Charan: deploy as is, or revert the pool screen first | release check All OK in both containers; an import lands; stream answers 401 without a token |
| 1 | **P2-A — the prototype** | Clickable, mock data: a tenant uploads → enriches → watches the score rise by level → opens a record with its mini KG; the admin pool workbench (ready for Exit, what is missing, which enrichment fills it, before/after); Settings → Models, Scoring, Industry master, Tokens & top-ups | — | Charan reviews the prototype; changes folded in before 3 and 4 are built |
| 2 | **P2-R — the model router** | Several models serve the platform: Groq and OpenRouter free models, qwen, Haiku, by route. A call that hits a limit moves on and the run says so; tenant and people data never reach a provider that may train on it; every answer names its model; Settings → Models shows each provider's quota left today and any cooldown, and the admin switches each model on or off for enrichment | S19, S20; provider keys rotated and in `.env` | with today's single provider configured nothing changes (regression); a provider killed mid-run → visible move; a forced 429 → cooldown; a tenant-data call aimed at a `may_train` provider is refused (test); quotas hold across API + worker |
| 3 | **P2-B — the foundations** | `tenant.context` (status, tokens, agents, model, scoring, brand, industry, consent, domains) read everywhere; 100k/day and 2M/month enforced, top-ups drawn after the base, counted from the router's usage rows; a score 0–100 in seven parts and a level on every record (pool and tenant copy), "last refreshed"; Settings → Scoring (platform + per-tenant, versioned), Tokens & top-ups, Industry master (admin) | S17, S18 | a forced overrun stops with the numbers and draws a top-up; changing a weight re-scores and names the version; pool always on the platform profile |
| 4 | **P2-C — enrichment** | The Smart Profile site reader pulled out unchanged and pointed at a list: select → estimate → confirm → run live on the router; each company gets its typed fields and its mini KG (pool graph for the admin, account graph for a tenant); before/after on every run — the percentages rise; the pool workbench and the tenant's Companies screen built on it | S16 approved 2026-10-02 (D-Q19) | Smart Profile output identical before/after the extraction; an analytica/FTCCI run moves records up a level on screen; nothing personal in the pool graph (tested) |
| 5 | **P3 — enrichment at scale** | Each free provider admitted per step only after its golden set; the audit sample re-asks Haiku and pauses a provider whose agreement falls, with an alert; Anthropic batch mode for bulk; industry and company-or-individual decided by model or abstained visibly; the measured cost per 1,000 records | — (S12–S13 approved) | agreement per provider per step recorded; the 100-record trial's cost and free-share on record; abstentions in the review list, not guessed |

**"Enrichment complete" = release 5's checkout passed:** a list (tenant or
pool) can be enriched end to end, on several models, within the tenant's token
budget or the admin's record budget, each value naming its source and model,
and the screen showing how much of the list is now Qualified, Reachable and
ready for Exit. Research on qualified records (P4) is the next train.

### Sprint 0 — Agentic foundation (0a, 0b)
Everything after it runs agents in front of a person; build the frame once.
- **0a:** SSE run stream (`/api/v1/runs/:id/stream`, nginx with buffering
  off); the run-event vocabulary (`AGENTS.md` §9a); risk classes declared in
  `SKILL.md` and checked by the harness; the approval token for R3/R4.
  Added 2026-10-02: lane priority (interactive before batch, `AGENTS.md` §4
  rule 5); `agent_name` + `parent_run_id` on runs (C1) and pathway
  definitions in the backend (D5), so a pathway is one conductor run with
  children (§10); a context report per call — window fill, trimmed, lane wait
  — with the per-call telemetry table **pending approval** (C4, §4b);
  run-step retention from `.env`.
- **0b:** run-feed and decision-card components (a logged platform change —
  needs approval); `/runs/awaiting` and the failover queue moved onto them;
  runs carry inputs, gaps, confidence, cost (`AGENTS.md` §8a).
- **Checkout:** a real run streams live on vani.vikuna.io; a failover decision
  is taken on the new card; polling removed where the stream replaces it.

### P0 — Mapping and schema approval (one sprint, no code)
- `documents/pool/P0-mapping.md`: §2 at column level, every DDL change, the
  `.env` variables (J3 limits, provider costs), migration numbers.
- UX map of the whole pool journey as one prototype.
- **Checkout:** Charan approves the schema list and the UX map.

### P1 — Staging lifecycle and admission
- **A:** lifecycle states and junk reasons on staging; licence class on
  sources; **chunked loading as a worker job** (today: 2,913 rows per request).
- **B:** Complete test in landing — only Complete rows reach the pool;
  Sources screen; FTCCI, analytica and the prospector file re-landed.
- **Checkout:** counts by state shown; nothing in the pool fails Complete.

### P2 — Enrichment engine: code and crawl
- **A:** `gt_enrichment_requests` (select → estimate → confirm → run); daily
  limits per kind from `.env`, overflow rolls over visibly; code steps
  (normalise, domain from email, liveness, E.164).
- **B:** crawl (about / contact / leadership → role emails, phones, social
  URLs, description; **no names into the pool**); domain discovery (SearXNG +
  check); provenance per value; the Enrich screen, agentic.
- **Checkout:** ≥70% of analytica Indian exhibitors with a verified domain;
  limits hold under a forced overrun. **External UX audit #1.**

### P3 — Enrichment engine: the model
- **Prerequisite: S16 approved** — ontology v1, the pool company graph and the
  concept catalogs (`documents/design-notes-ontology.md`, P0 §7, migration 271).
- **A:** Haiku classification (industry, B2B/B2C, is_individual, domain-name
  relation) with fixtures; `charBudgetFor`; `truncated` checked; offline eval.
  `agent-core/ontology.ts` v1; the pool extraction contract with fixtures per
  relationship; concept seeding from the tenants' Brains.
- **B:** shadow eval on 100 hand-labelled FTCCI rows; online acceptance
  recorded; confidence and abstain on the decision card.
- **B (graph):** pool graph extraction on demand (a segment, a hotlist, an
  adopted company), inside the admin's records-per-run budget; unresolved
  concepts queued as `taxonomy_proposal`.
- **Checkout:** agreement measured and recorded; abstentions visible, not
  guessed; the pool contract refuses Person/Team/KNOWS (tested).

**Before the story agent (outreach, outside this plan):** embedding retrieval
(D4) and cached purpose context (`AGENTS.md` §4c) — retrieval quality, not
storage, is the memory bottleneck there.

### P4 — Government data and signals (parallel to P2–P3)
- **A:** MCA RoC CSV keyed on CIN; Udyam OGD pull by state, resumable, rows
  hashed; everything staged, admin picks the slice to enrich (state × NIC).
- **B:** `gt_company_signals` (trade show, chamber, new registration, with
  expiry); signals on the company card.
- **Checkout:** Telangana MCA with unique CINs; a killed Udyam pull resumes
  with no duplicates; 327 analytica exhibitors carry a signal.

### P5 — Review queue and Coverage
- **A:** review queue (held, duplicate, reported junk) — side by side with
  provenance; link / new / junk / skip.
- **B:** Coverage score (J4), every dimension visible on the card.
- **Checkout:** FTCCI's flagged groups resolvable from the screen; the score
  explains itself. **External UX audit #2.**

### P6 — Isolation (one sprint; prerequisite for people)
- Production on `vanigtm_app` (DEPLOY.md §4b); the two-tenant test extended to
  the spine and the new tables.
- **Checkout:** the test passes on production; `current_user` confirmed.

### P7 — People in the tenant's copy
- **Decide projects first** (D-P9).
- **A:** persons, roles, contact points (`gt_contacts`, `gt_contact_channels`,
  `gt_person_company_link`); lawful basis; title → persona; FTCCI reps →
  Vikuna; Charan's LinkedIn export.
- **B:** adoption pool → tenant copy with the refresh diff; manual MCA director
  entry from the company card; the People screen.
- **Checkout:** FTCCI people in Vikuna only — another tenant sees none;
  adoption re-run idempotent.

### P8 — Verification and paid providers
- **A:** one provider adapter; Findymail verify (legacy first) and find;
  monthly ₹ cap, unset = refused; every call logged with cost.
- **B:** Spend screen; 100-record trial per provider.
- **Checkout:** spend never passes the cap in a forced test.

### P9 — Segments and Exit
- **A:** `gt_segments` (filters over pool + own copy, live count, save);
  Exit per contact per channel with reasons.
- **B:** reachable vs not on screen; hand-off into the journey; VaNi proposes
  a first segment from the ICP.
- **Checkout:** a Vikuna segment of FTCCI companies shows reachable vs not with
  reasons; nothing unverified or suppressed counted reachable. **External UX
  audit #3.**

### Status

| Phase | State |
|---|---|
| Sprint 0 | **0a part 1 built 2026-10-02** (lane priority, runs named by agent, per-call `model_call` step, run stream + nginx, risk classes declared and enforced for skill functions); 0a part 2 (parent_run_id, approvals, telemetry table) awaits the schema decision; 0b (components) awaits the platform-change decision |
| P0 | **approved 2026-10-01** (S1–S15) |
| P1 | sprint A **deployed 2026-10-02** · sprint B **built 2026-10-02**: the match ladder, survivorship and the Complete test (`pool-merge.ts`, `complete-test.ts`, worker job `POOL_RESOLVE_REQUESTED`); decisions (company/individual, not a duplicate, junk, restore, retire a delivery); `pool-skill`; the console's pool by state, sources, a delivery's rows with each company's eight checks, the industry master; large CSVs followed live; uploads raised to 200 MB; uploads temporary. Checkout: on the deployed stack after the release in `deploy.txt` |
| P2–P9 | **re-ordered 2026-10-02** (see §4 head, release train §4a). **P2-A prototype reviewed 2026-10-02** (`documents/prototypes/p2-enrich.html`, eight screens; decisions D-Q16–D-Q18 folded in). **P2-R built 2026-10-02** (S19/S20 approved; migration 272; `llm.router.ts`, `model-router-skill`, Settings → Platform models; 30 router tests) — **deployed 2026-10-02 together with 2026-10-02b** (migrations 272, 273; release checks OK; Groq answering). Checkout: Platform models walk-through + OpenRouter test after its daily reset. **P2-B built 2026-10-02** (S17, S18 approved; migration 274; scoring engine + profiles + stored scores, token budget with top-ups, tenant context, Settings → Scoring / Tokens / Industry master, Readiness card on both company screens) — **deployed 2026-10-02** (migration 274; release checks OK). **P2-C started 2026-10-02** (D-Q19: E1–E7 agreed, S16 approved) — sprint A: prototype `documents/prototypes/p2c-pool-enrich.html` sent for review (workbench, new run, live, what it did, a company after); **site reader extracted** to `backend/src/lib/site-reader.ts` — the ingestion agent delegates to it, and `lib/tests/site-reader.test.ts` holds it byte-identical to a golden recorded from the old code (exit criterion "Smart Profile output identical" met; a deliberate mutation fails 3 of its tests) |
| Ontology v1 | design note written 2026-10-02; ARCH §7b and AGENTS §3/§5/§8b/§9b updated; **S16 awaiting approval** (needed before P3). Account graph with P7; evidence paths and the no-path-no-draft guard with the first sender |

## 5. Dependencies outside this plan

- **Sending** is POA Pending 3–4 (connect the tenant's email, send one
  approved email). Exit is meaningless without it, and it needs nothing from
  here — the two meet at P9.
- **DPDP notice wording** — Exit requires the acknowledgement; the draft
  waits in `documents/drafts/263_…`.
- **Business tiers** (POA Pending 6) — J3's limits become per tier later;
  until then `.env`.

## 6. Open questions (from the spec, still open)

- MCA director provider (Probe42, Tofler, Attestr, Surepass) and per-CIN cost.
- Findymail plan and unit cost.
- Prospector licence — may firmographics be shown to other tenants?
- FTCCI and other chambers — member-directory use for outreach; partnership.
- Udyam NIC allow-list for the first Telangana segments.
