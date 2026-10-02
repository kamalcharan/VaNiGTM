# Design note — Ontology v1: one vocabulary, three homes, evidence paths · 2026-10-02

> Status: **DESIGN, for Charan's approval.** No code and no schema until it is
> approved; the schema it needs is S16 in `documents/pool/P0-mapping.md`.
> Rules it establishes are written into `ARCH.md` §7b and `AGENTS.md` §3, §5,
> §8b, §9b, which point back here for detail.
>
> Charan, 2026-10-02: "enriched data will have ontologies for agents to
> understand … it creates multiple relationships — usage, connects,
> behaviours, team, postings, jobs (capabilities will extend later). Without
> these the Storyteller agent might not harness properly, might not learn
> properly, and outreach becomes a normal cold email."

---

## 0. Why: a story is only as specific as the path it can find

A cold email knows a company's name and industry. A good one knows **why now,
why you, why them** — and each of those is a relationship with evidence:

```
Your Offering ──SOLVES──► PainPoint ◄──EVIDENCED_BY── Signal (job posting:     ──AT──► Company ◄──WORKS_AT (Role)── Person
   (Brain)              (shared concept)              "5 QA engineers,                (pool graph)            (tenant scope)
                                                       21 CFR Part 11")
```

That chain is an **evidence path**. The Storyteller writes from paths; with
none, it has nothing specific to say, and it must say so rather than write
generic copy (§9). Outcomes attach to the path a touch used, which is how the
system learns which angles work for which kind of account (§10).

---

## 1. Principles

1. **One ontology, three homes.** The same entity and relationship vocabulary
   in the tenant's Brain, the pool's company graph, and the tenant's account
   graph — so a path can cross from one to another.
2. **Same shape, separate tables.** Each home has its own node/edge tables of
   the same shape. The Brain's table is never shared: a missed filter there
   would pour other companies' knowledge into a tenant's own Brain (rule 13 in
   reverse).
3. **Tables for facts and events, graph for meaning** (`ARCH.md` §7b).
   Filterable facts stay typed columns; events stay event rows; the graph holds
   what things *are* and *mean*, and how they relate.
4. **Conclusions point to evidence.** Every node and edge carries where it came
   from — a page and span, a source row, a signal row — and how sure we are.
5. **Shared concepts, not look-alike strings.** A tenant's "compliance pain"
   and a company's "Part 11 hiring" meet only through the same concept id
   (§5). Strings that resemble each other are matched INTO a concept, never
   joined directly.
6. **Time matters.** Some facts decay (a job posting); every node and edge
   carries when it was observed and, where it decays, until when it holds.
7. **People never leave the tenant's scope.** Person, and every relationship
   touching a person, lives only in a tenant's home (D-P5).
8. **Versioned, extended by version.** "Capabilities will extend later" means
   a new ontology version with extraction fixtures — never an ad-hoc label.

---

## 2. Today — v0, what the Brain already speaks

The ingestion extractor (`ingestion-skill/pipeline/extractor.ts`) writes
`gt_kg_nodes` / `gt_kg_edges` (tenant-scoped, UNIQUE (tenant, label, name)):

- **Labels (12):** Product · Feature · ICP · UseCase · PainPoint ·
  Differentiator · Team · Competitor · CaseStudy · Metric · Industry · Pricing
- **Relationships (8):** HAS_FEATURE · TARGETS · FEELS · ADDRESSES · SOLVES ·
  DIFFERENTIATES_FROM · BUILT_BY · PROVES
- **Columns:** label, name, description, properties (jsonb), source_run_id —
  no concept id, no confidence, no evidence beyond the run, no observed/valid
  dates.

**v1 is a superset of v0: nothing is renamed and every v0 node stays valid.**
The Brain's missing columns are a later schema change on the provenance track
(D1); the pool and account graphs have them from day one.

---

## 3. The three homes

| Home | About | Tables | Scope / RLS | Written by |
|---|---|---|---|---|
| **Brain** | the tenant itself | `gt_kg_nodes` / `gt_kg_edges` (exist) | tenant, RLS | Smart Profile ingestion, VaNi conversation, approvals |
| **Pool company graph** | other companies — the mini Smart Profile | `gt_universe_kg_nodes` / `_edges` (**S16, new**) | no tenant, RLS off by design (platform-written, like 195) | pool enrichment (admin runs), on demand |
| **Account graph** | what ONE tenant learned about ONE target account | `gt_account_kg_nodes` / `_edges` (**later, with P7**) | tenant, RLS; keyed to `gt_prospects` | account research, people discovery, signal roll-ups, the tenant's notes |

The typed projections beside them: `gt_tenant_profile` for the Brain,
`gt_universe_companies` (the golden record) for a pool company, `gt_prospects`
for the tenant's copy.

A tenant who adopts a company **reads** its pool graph (not a copy) and layers
its own account graph on top; typed facts are still copied on adoption (D-P6).

---

## 4. Entities (labels)

| Label | What | Concept catalog | Homes |
|---|---|---|---|
| Company | an organisation | golden record id | pool, account (as the anchor) |
| Offering / Product · Feature · Pricing | what a company sells | — | Brain, pool |
| PainPoint | a problem a buyer feels | **pain_point** | all |
| UseCase | a job to be done | **use_case** | all |
| Initiative | something a company is doing (expansion, migration, audit) | **initiative** | pool, account |
| Technology | a tool/platform a company uses | **technology** | pool, account |
| Industry | sector / sub-segment | `gt_industries` (master) | all |
| Role | a job function (CFO, QA head) | **role** | pool (as hiring), account, Brain (ICP buyer) |
| Person | a named individual | — | **account only** (never pool) |
| JobPosting | an open role, with what it mentions | — | pool (decays) |
| Event | a trade show / conference | event list | pool |
| Competitor | a rival | golden record id when it is a pool company | Brain, pool |
| Proof (CaseStudy, Metric) | evidence a claim is true | — | Brain, pool |
| Signal | a rolled-up behaviour ("pricing page 3× this week") | signal kind | **account only** — a conclusion, its raw events stay in the signals spine |
| ICP · Differentiator · Team | v0 Brain labels, kept | — | Brain (Team never in pool) |

---

## 5. Concept catalogs — what makes paths possible

One catalog table for the open-ended kinds, governed exactly like the industry
master (P0 §2.8a):

```
gt_concepts         (id, kind: pain_point | role | technology | initiative | use_case,
                     code, name, parent_id, source: seed | proposal,
                     approved_by, approved_at)
gt_concept_aliases  (concept_id, raw_value, raw_key, confidence, mapped_by: rule | llm | human)
```

- Seeded small (a few dozen per kind, from the tenants' Brains and FTCCI /
  analytica / prospector vocabulary), grown through `taxonomy_proposal` in the
  review queue: **a model proposes, an admin creates.**
- A node carries `concept_id` when its name resolves to a concept (alias table,
  then the vocabulary embeddings already planned on `gt_semantic_clusters`);
  unresolved nodes stay valid and are queued for mapping, never dropped.
- Industry stays in `gt_industries` (already the master).

---

## 6. Relationships

| Relationship | From → To | Learned from | Homes | Decays |
|---|---|---|---|---|
| OPERATES_IN | Company → Industry | NIC codes, classification | pool | no |
| OFFERS | Company → Offering | site crawl | pool | slow (refresh cadence) |
| ADDRESSES / SOLVES | Offering → PainPoint · UseCase | site, Smart Profile (v0) | Brain, pool | no |
| USES | Company → Technology | site fingerprint, job postings | pool | ~12 months |
| HIRING_FOR | Company → Role (via JobPosting) | company careers pages; job boards whose terms allow it | pool | **~90 days** |
| MENTIONS | JobPosting → Technology · PainPoint · Initiative | the posting text | pool | with the posting |
| PURSUING | Company → Initiative | news on the site, postings, filings | pool, account | ~6 months |
| EXHIBITED_AT | Company → Event | exhibitor lists | pool | ~12 months |
| MEMBER_OF | Company → Company (chamber) | directories | pool | refresh |
| COMPETES_WITH · PARTNERS_WITH · CUSTOMER_OF | Company → Company | site, case studies | Brain, pool | slow |
| PROVES | Proof → Offering / claim | site, documents (v0) | Brain, pool | no |
| WORKS_AT (as Role) | Person → Company | tenant people data, team page | account | until contradicted |
| CARES_ABOUT | Role → PainPoint | persona rules, the tenant's ICP | Brain, account | no |
| KNOWS | Person → Person | the tenant's own LinkedIn export | **account only, never pooled** | until refreshed |
| SHOWED_INTEREST_IN | Company/Person → Offering | signal roll-up (a conclusion) | account | ~30–60 days |
| IS_AT_STAGE | Account → Stage | signals + touches roll-up | account | recomputed |
| v0 kept | HAS_FEATURE, TARGETS, FEELS, DIFFERENTIATES_FROM, BUILT_BY | Smart Profile | Brain | — |

---

## 7. The node / edge contract (pool and account graphs; the Brain later)

Every node and edge in v1 carries:

| Field | Meaning |
|---|---|
| `label` / `relationship`, `name` | from the ontology version |
| `concept_id` | when resolved (§5) |
| `evidence` | where it came from: `{source_url, span}` · `{source_row_id}` · `{signal_ids}` |
| `confidence` | 0–1, with the reason in `properties` |
| `observed_at`, `valid_until` | when seen; until when it holds (decay, §6) |
| `method`, `model` | import · crawl · llm · provider · manual; `provider:model` |
| `load_id` (pool) / `tenant_id` + `prospect_id` (account) | retire by delivery; scope |
| `ontology_version` | which vocabulary wrote it |

The extract primitive already rejects a fact whose evidence is not verbatim in
the source (`EVIDENCE_NOT_IN_SOURCE`) — v1 extraction is built on it.

---

## 8. Evidence and decay rules

- **No evidence, no edge.** An edge without a source is not written.
- **Confidence is the weaker of its ends'** plus the extractor's own;
  abstention ("not enough evidence") is recorded, never guessed.
- **Decayed is not deleted.** Past `valid_until` an edge stops counting for
  paths (it was true then; it may not be now) but stays for history and for
  learning what used to work.
- **A conclusion names its evidence.** SHOWED_INTEREST_IN points to the signal
  rows that justify it; the raw events never become nodes.

---

## 9. The story path — and "no path, no draft"

**A path** is a chain from one of the tenant's Offerings to a target account
and, where the tenant has people data, to a Person — crossing homes through
shared concepts:

```
Brain: Offering ─SOLVES→ PainPoint(c)        ← concept id c
Pool:  Company ─HIRING_FOR→ Role ; JobPosting ─MENTIONS→ PainPoint(c)
Acct:  Person ─WORKS_AT(as Role)→ Company ; Role ─CARES_ABOUT→ PainPoint(c)
```

- **Ranked** by evidence strength × freshness × fit to the tenant's ICP.
- **Assembled** by `account.context(purpose)` (`AGENTS.md` §3) within the
  token budget: the best few paths with their evidence, not the whole graph.
- **Cited:** the draft primitive already rejects a cited fact id it was not
  given (`UNKNOWN_FACT_ID`) and flags prose citing none (`NO_FACTS_CITED`);
  story-skill already refuses to approve unsupported claims (R-S1). Paths are
  what give it supported claims.
- **Guard: no evidence path, no outreach draft.** The agent answers "not
  enough basis on this account — research first" and proposes the research,
  instead of writing generic copy. Measured as **story evidence coverage**
  (share of drafts with ≥ 1 fresh path), an online eval of the Storyteller.

---

## 10. Learning on paths

- Every touch records its **path signature**: offering, pain concept, signal
  kind, angle, persona.
- Outcomes (reply, meeting, ignore, unsubscribe) attach to the signature.
- Aggregated by segment, this becomes "pharma companies hiring QA after a trade
  show answer the compliance angle; the cost angle is ignored" — surfaced as a
  **proposal** a person approves (`AGENTS.md` §8b), never a silent change.
- Outcomes are tenant data: learning stays inside the tenant. Nothing a tenant
  learned flows into the pool (rule 13).

---

## 11. Extraction

- **Per ontology version, per home, an extraction contract** (`AGENTS.md` §5):
  which labels and relationships may be written there, with fixtures per
  relationship. The pool contract refuses Person, Team and KNOWS.
- Built on the extract primitive (verbatim evidence) and the shared site
  reader (P2).
- **On demand, inside budgets:** typed enrichment runs across the pool; the
  graph extraction runs for companies in a segment, a hotlist, or adopted by a
  tenant — admin records per run, tenant tokens (P0 §10).
- Free model pools allowed for pool-company extraction (public business facts,
  P0 §9.3); never for the account graph.

---

## 12. Versioning and governance

- **The ontology lives in code** — `agent-core/ontology.ts`: labels,
  relationships, homes, evidence and decay rules, version. One file, reviewed
  like any contract.
- **A new label or relationship is a new version:** extraction fixtures for it,
  the eval run, Charan's approval. Old nodes keep the version that wrote them.
- **Concepts grow by proposal** (§5); the ontology does not change when a
  concept is added.

---

## 13. Privacy and sources

- Person and KNOWS: tenant scope only; erasure removes them and their edges;
  suppression applies on top.
- Job postings: from a company's own careers page, or a job board whose terms
  allow it — checked per board before it becomes a source. Never scraped from
  LinkedIn.
- "Connects" (who knows whom) comes only from what the tenant owns — its own
  LinkedIn export, its CRM — and never leaves the tenant.

---

## 14. Phasing

| When | What |
|---|---|
| Now | this note approved; ontology v1 in `ARCH.md` / `AGENTS.md` |
| with P2 | shared site reader; typed facts (social, emails, phones, team page) |
| **S16, before P3** | `gt_universe_kg_nodes/_edges` + `gt_concepts` / `gt_concept_aliases` (approval) |
| P3 | pool graph extraction (v1 contract, on demand) + concept seeding |
| P7 | the account graph (`gt_account_kg_*`), people and WORKS_AT / KNOWS |
| outreach | path assembly, the "no path, no draft" guard, path signatures |
| analytics | the signals spine; SHOWED_INTEREST_IN / IS_AT_STAGE roll-ups |
| later | the Brain table gains v1's columns (provenance track D1) |

---

## 15. Open questions

- Seed concepts: from which tenants' Brains first (Vikuna's own, ContractNest,
  DristiQ)?
- Job boards: which ones, and do their terms allow use for outreach?
- Decay windows above are starting values — `.env` or the ontology file? (They
  are product knowledge, not deployment config: proposed for the ontology
  file, versioned with it.)
