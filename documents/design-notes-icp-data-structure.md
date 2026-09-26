# Design note — the ICP data structure: two sets, one link, one gap register

Status: PROPOSED 2026-09-26, for Charan's approval. Every table below is a
schema change and nothing is created until approved. The matcher (§4) is
code and is already built and measured.

Charan: "we need to finalize the whole ICP data structure — we get data into
2 sets, both sets need to be clubbed, analyse the correctness, register the
gap, haiku should work only on the gap."

## 1. The two sets

| Set | Shape as delivered | Key | Exists today |
|---|---|---|---|
| **Companies** | name, domain, description, size band, NACE, city, mailbox, traffic | `domain_normalized`, else `name_key` + pin | `gt_universe_company_sources` (195), `gt_record_view` (205) — the pool |
| **People** | company string, name, title, headline; sometimes email, phone, profile URL | profile URL when present; else name + matched company | **nothing** — people are tenant-scoped in `gt_contacts` |

Both enter through staging as delivered (`ki_import_staging`, raw kept) and
are landed by `landing.ts`, the pool's only writer. A people delivery is a
`gt_source_loads` row like any other, with its own tier.

## 2. Proposed tables (need approval)

### 2.1 `gt_universe_people_sources` — immutable per-source person rows

Mirror of the company table's posture: one row per person per delivery, never
merged, never edited.

```
id, source_id, load_id, source_record_id      -- profile URL when the export has it, else a hash of name|company_string
full_name, name_key (generated)
title_raw, headline_raw, company_string        -- exactly as delivered
email, phone, profile_url, country_code
raw JSONB, source_as_of, completeness, validity
ingested_at
```

Platform-level (no tenant_id): the decision that people are a shared asset
like companies (pending, CLAUDE.md "Charan's stated priority"). If that
decision goes the other way, the same table takes a `tenant_id` and the
rest of this note stands.

### 2.2 `gt_person_company_link` — the club, revisable

```
person_source_id → gt_universe_people_sources
company_source_id → gt_universe_company_sources   (NULL while unmatched)
method    key | acronym | tokens | headline | model | human
score     numeric(4,3)
status    matched | gap | none | confirmed | rejected
shortlist JSONB     -- the 2–3 candidates a gap carries, so the model or the person sees only those
decided_by, decided_at
```

The link is separate from the person row on purpose: a wrong match is
corrected by writing a new link, the delivered row is untouched, and "who
said this person works here, and how sure" stays answerable.

### 2.3 `gt_cleanup_gap` — THE gap register, generic

One table for every cleanup step that could not decide in code, on either set.

```
entity_type   company | person
entity_id
step          company_match | industry | domain_relation | is_individual | persona | …
reason        text          -- "two Vardhmans on the shortlist", "no employer in headline"
candidates    JSONB         -- what the resolver is allowed to choose from
status        open | model_resolved | human_resolved | dismissed
resolved_value JSONB, resolved_by (model name or user id), resolved_at, model_cost_tokens
opened_at
```

**Haiku's work queue is `WHERE status = 'open'`.** It is never run over the
whole set. The register is also the correctness report: rows resolved in
code vs rows that needed a model vs rows that needed a person, per step, per
load. That is the "analyse the correctness" number, kept as data.

### 2.4 `gt_personas` + `gt_person_persona`

A small platform taxonomy (economic buyer, technical buyer, champion, user,
gatekeeper × function: engineering, operations, procurement, finance, HR,
sales, IT, leadership) and a link row per person: `persona_code, function_code,
source (list_filter | title_rule | model), confidence`. Persona from a title
rule is code ("Chief Engineer" → technical buyer / engineering); the model
sees only titles the rules cannot place, through the gap register.

### 2.5 `gt_suppression` — prerequisite for any outreach

`identifier_hash (email | phone | profile URL), kind, reason, source,
tenant_id NULL = platform-wide, created_at`. Not enrichment, but nothing in
2.1 may be contacted until it exists (design-notes-outreach §5). Listed here
so the people asset and its gate are approved together, not the asset alone.

## 3. What is code and what is the model

| Step | Set | Code | Model (gap only) |
|---|---|---|---|
| normalise, dedup by domain, liveness, hash | companies | all | — |
| NACE section → our taxonomy | companies | all | — |
| industry from description, offering, buyer, B2B/B2C | companies | — | every row once (Pass 1, ≈$900 at 600k) |
| is_individual | companies | title-word rules (Advocate, CA, Proprietor) | the rest |
| domain relation same / brand_or_group / unrelated | companies | equality, email-domain equality | the rest |
| **person → company** | people | **key, acronym, tokens, headline** (§4) | the gap |
| persona | people | title rules | titles the rules cannot place |
| current vs former | people | headline words: retd, ex-, former, consultant | — |
| social URLs | companies | site footer | — |

## 4. The matcher, measured (2026-09-26)

`backend/src/etl/company-matcher.ts`: key equality after the pool's own
`name_key` normalisation (plus M/s, dotted initials, "&"), squashed-space
equality (Microlabs / Micro Labs), acronym both ways including "and" (FACT,
RCF, GSFC), token Dice, prefix (location suffixes), and the headline's LAST
"at X" as a second query. Scores ≥ 0.85 with a clear runner-up gap = matched;
0.55–0.85 = gap with a shortlist; below = none.

On the 100-person sample (`scripts/laya-trial/match_people.ts`, candidate
pool = the file's own 65 distinct company strings, query = headline only,
correct = lands on the person's own column):

| | Count |
|---|---|
| headlines naming an employer | 68 of 100 |
| matched, all to the right company | **61** |
| wrong | **0** |
| gap (shortlist for the model) | 1 |
| none | 6 — two are a different employer (correct), two are a subsidiary or rename (Jubilant Life Sciences → Pharmova, FEDO-FACT), one an alias the real pool would carry (EPL / Essel Propack), one junk ("CXO") |

So code resolves ~90% of the reconcilable rows with no false matches, and
the model sees under 10%. Against the real pool the "none" rows become gaps
with a shortlist, which is where Haiku earns its cent.

## 5. Order of work once approved

1. Chunked upload + landing as a worker job, proven at 50k rows locally.
2. Migrations for 2.1–2.5, guarded and idempotent, one file.
3. Companies Pass 0 (code) and Pass 1 (model, every row once).
4. People landing → matcher → link rows → gap register.
5. Gap worker: Haiku over `gt_cleanup_gap WHERE status='open'`, per step.
6. Persona rules, then the model on the residue.
7. Merge engine before the second delivery of any list.
