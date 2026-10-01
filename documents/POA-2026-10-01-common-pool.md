# POA — The common pool, enrichment and the road to a campaign · 2026-10-01

> Source: Charan's spec "VaNi GTM — Common Pool & People Data" (1-Oct-2026,
> 16 pp.) and the discussion that followed it the same day. This plan
> replaces the spec's table design with the one already in the repo and
> records every decision taken. Companion to `POA-2026-09-30-platform.md`
> (where it is Pending 7, "the common pool").
>
> Discussion only so far — **no code until P0 is approved.** Each phase is one
> branch and stops at a gate for Charan's review.

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
| J3 | Starting daily limits (in `.env`, none in code): code-only 50,000 records/day per tenant · crawl 2,000 · LLM 500 per tenant, 5,000 for the admin pool · paid providers by a monthly ₹ cap that is **unset = refused** | A forgotten cap must cost nothing, not everything |
| J4 | Coverage weights: response 25 · people 20 · verified contact points 15 · identity 10 · firmographics 10 · research 10 · signals 5 · freshness 5 | A reply is worth more than any amount of data; people are the asset (Charan, 26-Sep) |
| J5 | Junk: admin marks and reverses on the pool; a tenant marks and reverses on its own copy, and can *report* a pool row, which goes to the admin's review queue | A tenant must not be able to hide a company from everyone else |
| J6 | LinkedIn, X and Facebook are sources of **URLs and owned exports** (a company page linked from its own site, a URL the tenant gives us, Charan's LinkedIn data export) — never scraped content | Scraping breaks their terms, risks the tenant's account and has been litigated; the spec already puts scraping out of scope |

---

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

## 3. Phases

One branch per phase; each ends at a gate with something visible. P4 can run
alongside P2–P3 once P1 is merged.

### P0 — Mapping and schema approval (no code)
- `documents/pool/P0-mapping.md`: §2 at column level, every DDL change, the
  `.env` variables (J3 limits, provider costs), the migration numbers.
- **Gate:** Charan approves the schema list.

### P1 — Staging lifecycle and admission
- Lifecycle states and junk reasons on staging; licence class on sources.
- Landing admits only Complete rows; everything else stays staged and
  visible with its state.
- **Chunked loading as a worker job** — today's path does 2,913 rows in one
  request; MCA and Udyam need streaming.
- Steward screen: Sources (loads, counts by state, junk, held, errors).
- **Gate:** FTCCI, analytica (exhibitors + products) and the prospector file
  re-landed through the new road; counts by state shown; nothing reaches the
  pool that fails Complete.

### P2 — Enrichment engine: code and crawl
- `gt_enrichment_requests`: select → **estimate** (records, kinds, days at
  the cap) → confirm → run → progress. Admin on pool + Vikuna's copy; tenant
  on its own copy only (D-P11, rule 13).
- Daily limits per kind from `.env` (J3); overflow rolls to the next day,
  visible, never dropped.
- Code steps: normalise, domain from corporate email, liveness, phone to E.164.
- Crawl: about / contact / leadership pages → role emails, phones,
  social URLs (J6), description. **Names found are NOT written to the pool**
  (D-P5).
- Domain discovery: SearXNG + name/city check.
- Every value lands as a source row with method, date, confidence (D-P12).
- **Gate:** ≥70% of analytica Indian exhibitors with a verified domain;
  limits hold under a forced overrun.

### P3 — Enrichment engine: the model
- Haiku classification: our industry, B2B/B2C, is_individual,
  domain-to-name relation (`same | brand_or_group | unrelated`).
- Lowest limit (J3); budget via `charBudgetFor`; `truncated` checked on every
  answer; the LLM gate already serialises calls.
- **Gate:** 100 hand-labelled FTCCI rows — agreement measured and recorded
  (the Laya trial's harness, `backend/scripts/laya-trial/`, is the template).

### P4 — Government data and signals (parallel to P2–P3)
- MCA RoC CSV import keyed on CIN.
- Udyam OGD pull by state, resumable from the last page, Telangana first;
  rows hashed (Udyam has no stable id). **What gets enriched** is chosen by
  admin by state and NIC code — everything lands in staging, only the chosen
  slice is enriched and admitted.
- `gt_company_signals`: trade show (event, hall, booth, products), chamber
  member, new registration (< 180 days), with expiry.
- **Gate:** Telangana MCA complete with unique CINs; a killed Udyam pull
  resumes with no duplicates; all 327 analytica exhibitors carry a signal.

### P5 — Review queue and Coverage
- Steward review queue (held, duplicate, reported junk) — side by side with
  provenance; link / new / junk / skip.
- Coverage score per company (J4), shown on the company card.
- **Gate:** FTCCI's flagged groups resolvable from the screen; the score
  explains itself (each dimension visible).

### P6 — Isolation (prerequisite for people)
- Production switched to `vanigtm_app` (DEPLOY.md §4b); the two-tenant test
  extended to the spine and the new tables.
- **Gate:** the test passes on production; Charan confirms `current_user`.

### P7 — People in the tenant's copy
- **Decide projects first** (D-P9 yellow flag).
- Persons, roles and contact points on `gt_contacts` / `gt_contact_channels`
  / `gt_person_company_link`; lawful basis; title → persona.
- Sources: FTCCI reps → Vikuna; Charan's LinkedIn export (own relationships);
  manual MCA director entry from the company card.
- Adoption: pool company → tenant copy, with the refresh-offer diff (D-P6).
- **Gate:** FTCCI people in Vikuna only — another tenant sees none; adoption
  re-run is idempotent.

### P8 — Verification and paid providers
- One adapter interface; Findymail verify (all addresses, legacy first) and
  find; monthly ₹ cap, unset = refused (J3); every call logged with cost.
- Spend screen (month to date per provider vs cap).
- **Gate:** 100-record trial per provider before any scale; spend never
  passes the cap in a forced test.

### P9 — Segments and Exit
- `gt_segments`: filters over pool + own copy → live count → save; the same
  count on re-run unless data changed.
- Exit evaluated per contact per channel (§1.2) → "reachable" counts, with the
  reason for every contact that is not.
- Hand-off into the journey (UC10).
- **Gate:** a Vikuna segment of FTCCI companies shows reachable vs not, with
  reasons; nothing unverified or suppressed is counted reachable.

---

## 4. Dependencies outside this plan

- **Sending** is POA Pending 3–4 (connect the tenant's email, send one
  approved email). Exit is meaningless without it, and it needs nothing from
  here — the two meet at P9.
- **DPDP notice wording** — Exit requires the acknowledgement; the draft
  waits in `documents/drafts/263_…`.
- **Business tiers** (POA Pending 6) — J3's limits become per tier later;
  until then `.env`.

## 5. Open questions (from the spec, still open)

- MCA director provider (Probe42, Tofler, Attestr, Surepass) and per-CIN cost.
- Findymail plan and unit cost.
- Prospector licence — may firmographics be shown to other tenants?
- FTCCI and other chambers — member-directory use for outreach; partnership.
- Udyam NIC allow-list for the first Telangana segments.
