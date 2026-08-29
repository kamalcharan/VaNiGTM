# Vara — Execution POA

**Date:** 2026-08-27 (Phase 4 landed + hardened; Platform Channel slice approved)
**Previous revision:** 2026-08-19
**Original:** 2026-08-17 (late)
**Companion to:** `vara-readiness-review.md`, `vara-onboarding-design.md`,
`vara-channels-and-activation.md`, `HANDOVER-2026-08-19.md`

The August 17 plan drew a hard line at "no schema changes." That line
moved deliberately: the prompt store and the semantic layer both landed
as new tables + columns after explicit approval, because building
Extractor (Phase 2) without them would either strand the LLM prompt
inside code (deploy per prompt edit — untenable for per-tenant voice)
or make skill/family/candidate dedup impossible. Both additions kept
the audit invariants intact — vectors are columns on typed rows,
prompts are append-only with a one-active guard.

---

## Where we are (2026-08-27)

**Landed to main, both repos, verified end-to-end:**

- **Phase 0** — UX preview complete (compose + import + Duplicate + Other + empty-mode + family-defaults derivation prompt).
- **Phase 1 — Compose path** — real DB writes. Migration 244 (three seed talent packs under Technology & SaaS: Backend / Frontend / Product & Design). `GET /vara/onboarding/context`, `POST /vara/jd/compose` (single transaction: `vani_role_family` upsert + `vara_family_profile` + `vara_scoring_config v1` + `vara_jd` + `vara_jd_version v1` + subscription flip to `live` + two `vani_audit_log` rows). Advisory-lock idempotency-in-practice with 60s freshness window. Frontend swapped from mock to real API. `UX_DONE_KEY` deleted; subscription is server-truth.
- **Prompt Store** — migration 245 (`vani_prompt`, two-scope one-table: system + tenant override, append-only content trigger, one-active-per-scope partial unique index, tenant-scoped RLS). `resolvePrompt(db, key)` + `renderPrompt(prompt, vars)`. Endpoints `GET/PATCH/DELETE /vara/prompts[:key]`. Prompt Studio UI at `/agents/vara/prompts` with variable-coverage validation. Seeded `vara.composer.ask_next` as proof-of-shape (real caller lands with Extractor).
- **Semantic Layer** — migration 246 (`CREATE EXTENSION vector` guarded; `vara_skill` with `embedding vector(768)` + HNSW cosine; `vara_family_profile.axes_embedding` + HNSW; `vara_candidate.profile_embedding` + HNSW; `vara_match_log` append-only). `embedText(text)` helper (Ollama-native `nomic-embed-text` default, 768-dim). `canonicalizeSkill(name)` for exact-match dedup before embedding. `recordMatch(db, input)` helper. Deploy note at `docs/db/pgvector-install.md`. pgvector 0.8.6 live on VPS in `vikuna-postgres` container (swapped from `postgres:17-alpine` to `pgvector/pgvector:pg17`, same `docker_pg_data` volume, zero data risk).
- **VPS state** — single Postgres container, PG 17 + pgvector 0.8.6. Empty host-level PG 16 stray from the pgvector-install detour dropped.
- **Phase 4 — Install screen** (2026-08-26/27, taken out of order; see its section). Migration 247 `boot_pings`, `PATCH /tenant/domains/:id/origins`, boot-ping recording, `/agents/vara/install`, plus the four cold-tenant fixes and the JD work that walking it surfaced. Migration 247 is **applied**; the Charan gate — a real boot from a real site — is **unrun**.

**Design settled, not yet in UX or code:**
- Import path with fenced-LLM extraction (Phase 2 body)
- JD versioning (edit → v2, needs `POST /vara/jd/:id/version`)
- Playbook fork/versioning UI (Phase 6, operator surface)
- **Draft-the-description from the facts** — the textarea ships; the "Vara writes it in your brand voice, you edit" button waits on the composer LLM

---

## Two open decisions from 2026-08-27 — Charan has not ruled

Both were found by walking the product, not by reading it. Neither is
scheduled, and both block a cold tenant from succeeding unaided.

### D1 — A step completed by one lane satisfies another lane that asks more

`vn_tenant_onboarding` is keyed `(tenant_id, step_id)` — **lane-agnostic**.
GTM's `business_profile` form (`frontend/components/onboarding/OnboardBusiness.tsx`)
captures firm name, PAN, GSTIN, address — **and no industry**. The vani lane
has a `business_profile` step too, and *its* screen does require industry. But
the row already says `completed`, so the vani lane never re-asks. Industry
stays null forever and Vara is the first thing to notice, three screens away.

Confirmed live: the tenant walked on 2026-08-27 had `business_profile`
completed 2026-07-25 with `industry` null.

Compounding it, `applyStepPayload` returns early when a payload maps to no
known fields, and the completion mark is written regardless — so a step can be
marked done having written nothing.

**Proposed (unapproved):** lane-aware reconciliation —
`GET /onboarding/status?lane=vani` reports `business_profile` **pending** when
`industry` is null, whatever the row says. No schema change, and it is what
`vani-app/CLAUDE.md` already prescribes ("lane awareness belongs per lane, in
the lane's own endpoint"). Rejected alternatives: requiring `industry`
server-side would start refusing GTM's onboarding, whose form cannot supply
it; re-keying `vn_tenant_onboarding` by lane is the correct model but is a
schema change plus a backfill decision on every existing tenant.

### D2 — Industry is free text doing a foreign key's job

`slugifyIndustry(raw)` is string-matched against `vani_domain_pack.domain`.
Production on 2026-08-27:

| Tenant | `industry` | slug | packs? |
|---|---|---|---|
| Vikuna Technologies | `technology` | `technology` | ✗ |
| www.dristiq.com | `Financial services` | `financial-services` | ✗ |

Two real tenants, two values, **zero** matches. Only `null` produces an error;
the others produce a 200 with `families: []` — a silent empty doorway, the
more confusing failure. `'Technology & SaaS'` works only because it happens to
slugify onto the one seeded pack. The ten options live as a TypeScript
constant in `BusinessProfileStep.tsx`.

**Charan's direction (2026-08-27):** research proposes the industry from an
exhaustive master; the user can change it in the UI.

**Needs approval before any code** — a reference table with codes and aliases
so research output is *matched* rather than string-compared, and
`vani_domain_pack.domain` keys off those codes. Note the research half is
blocked anyway: the crawl → LLM path is a standing dependency and
`vikuna.io` yields 6 chars to a static crawl (it is a Vite SPA).

---

## Standing dependencies — carried forward

Still not phases; still must be true at some point independent of the flow:

- **Rotate 4 exposed keys** (`ANTHROPIC_API_KEY`, `JWT_SECRET`, `LLM_PRIMARY_KEY`, `DB_PRIMARY` password) — Charan's action, still outstanding.
- **BYOK LLM encryption** (`vani_llm_provider.credentials_enc`) — gates Phase 2 for tenants that BYOK; Vikuna's own LLM key works meanwhile.
- **LLM path stability on VPS** — vocabulary step still fails; blocks Phase 2, 5, 6.
- **MSG91 adapter port** from ContractNest — gates Phase 5 candidate comms.
- **Careers page fetch** for JS-heavy sites (headless browser) — only if URL ingest is added later.
- **vn_users ↔ vani_user(id) bridge** — new, this session. `vara_jd.created_by` and `vani_prompt.approved_by` write `null` today; the audit spine's `actor_id` names who did it (uuid, no FK). A small bridge (upsert a `vani_user` row per `vn_users` on first touch) unblocks tightening both constraints. Not urgent; audit stays honest either way.
- **`vani_idempotency` store** — cross-process idempotency for `POST /vara/jd/compose`. Advisory lock + 60s freshness window covers double-click and in-session-retry; a hard refresh mid-flight can still create a duplicate JD. Schema change to raise before it lands.
- **Ollama `nomic-embed-text` model pulled on the LLM host** — the embed helper defaults to it. `ollama pull nomic-embed-text` before Extractor uses it.
- **Composer LLM for the description drafter** — `facts.description` ships as a plain textarea (2026-08-27). Drafting it from the structured facts in the tenant's brand voice — so the posting and the weights cannot drift apart — needs the same LLM path as Phase 2. Deliberately shipped as a note rather than a button that fails.

---

## Phase 0 — UX preview complete ✅

Landed on main. Nothing more here.

---

## Phase 1 — Compose path ✅

Landed on main. First JD publish flips subscription to `live`, doorway lists the JD from DB, landing reflects Live from `/vara/status`. E2E 20/20 verified.

---

## Prompt Store slice ✅

Landed on main. Not originally a numbered phase — inserted between Phase 1 and Phase 2 because Extractor needs per-tenant prompt overrides on day one. `/agents/vara/prompts` list + detail + validation + save + revert. E2E 16/16 verified.

**Deferred within this slice:**
- Separate-approver workflow (MVP self-approves)
- Prompt Studio preview against eval fixtures (comes with Phase 2's fixture set)
- Body-hash dedup on save (cosmetic; append-only stays honest)

---

## Semantic Layer slice ✅

Landed on main. Schema + helpers, no wired writer. Extractor is the first caller.

---

## Phase 2 — Wire the Import path + Extractor

**Goal:** tenant can upload existing JDs, review the extracted structure with evidence spans + confidence per field, publish. Same LIVE outcome as compose. First worker to use prompts + evals + `vara_skill` for real.

**Depends on:** Vikuna's LLM key OR BYOK (both need LLM path stable on VPS + `nomic-embed-text` model pulled).

**Backend:**
- Migration **251** (small): seed system prompts for `vara.extractor.field_schema` and `vara.extractor.evidence_check` in `vani_prompt`. (Was 247 → 248 → 250; 247 went to Phase 4, 248 to the answer cache, 249–250 to the intent tables.)
- Add "job description" adapter to ingestion pipeline (deterministic docx/pdf parse — reuses existing spine, no new schema).
- `POST /vara/jd/import` — accepts N files, writes `vara_artifact` rows, runs one fenced LLM extraction stage per artifact.
- Extraction schema: `{ title, must_haves[{name,weight,evidence_span,confidence}], knockouts[{label,rule,evidence_span,confidence}], band?, notes }`. Every field's `evidence_span` must fuzzy-match the source text (V-9). Failed fuzzy = `status='low_confidence'`; failed schema = `status='rejected'` (whole extraction, not partial).
- On successful extraction, `embedText()` each must-have name → upsert `vara_skill` (dedup via `canonicalize_skill` first; if match, bump `usage_count`; else insert with embedding).
- `GET /vara/jd/extractions/pending?family=X` — polling for review queue.
- `POST /vara/jd/from-extraction` — same shape as compose, tenant-approved facts + provenance; ends the artifact-review lifecycle by publishing the JD.

**Eval fixtures** (checked into repo, first real use):
- `backend/src/vara/evals/fixtures/extractor.<family>.*.pdf` + matching `.expected.json`.
- `npm run eval:extractor` runs the fixture set against current prompts + current code, diffs structured output, fails loud on any regression.
- **PR discipline** — every PR that touches an extractor prompt or the extraction code must add or intentionally update a fixture.

**Frontend:**
- Import mode in JD Studio already wired as UX preview — swap its mock extraction for real `POST /vara/jd/import`.
- Progress state during extraction (job runs sync for now; async later if latency demands).
- Review panel per JD (already exists as preview) — connect provenance + confidence marks to real extraction data.
- Bulk upload → queue → review each.

**Tests:**
- Real docx/pdf sample uploaded → extraction row created, review panel shows fields with provenance.
- Approve → JD written same shape as compose, LIVE.
- Fixture run: `npm run eval:extractor` shows 100% match on the seed set.
- DB check: `vara_skill` rows populated with 768-dim embeddings, dedup working (same skill across two JDs → single skill row with `usage_count=2`).

**Gate:** Charan reviews real extraction quality on 2–3 sample JDs + approves the fixture set as a regression baseline.

---

## Phase 3 — Family playbook derivation

**Goal:** family defaults compound as tenant publishes more JDs. Second JD in same family prompts "apply as default?" with derived diff. Uses `axes_embedding` on `vara_family_profile` and cross-`vara_skill` semantic dedup.

**Backend:**
- Job (sync on Nth publish for v1): compute per-family statistics
  - Must-haves: frequency-weighted union across JDs in the family, deduped by `vara_skill` semantic similarity (not by exact name)
  - Knockouts: intersection (only those in ALL JDs)
  - Threshold: mode across JDs
  - Bands: aggregate range
- `POST /vara/family/apply-derived` — tenant-invoked, updates `vara_family_profile`; embeds the new axes shape into `axes_embedding`.
- `GET /vara/family/:id/derivation-preview` — returns proposed defaults + evidence per field.
- **Every match writes a `vara_match_log` row via `recordMatch()`** — the audit invariant is not optional.

**Frontend:**
- Landing page card + JD Studio banner: "Ready to seed Backend Engineering defaults from 3 JDs"
- Preview + apply flow (the UX preview shape from Phase 0 tail comes back to life, now server-backed)

**Tests:**
- Publish 2 JDs in same family with slightly different skill names ("TypeScript / Node.js" vs "Node + TS") → semantic dedup treats them as one → prompt appears with numeric diff.
- Apply → `family_profile` updated; next JD's compose/import pre-fills weights from family.

**Gate:** Charan confirms the prompt fires at the right time and the derived defaults look right on Vikuna's own JDs.

---

## Phase 4 — Install screen (Vara reaches your candidates) — BUILT, ungated

**Taken out of order (2026-08-26).** Phase 2 is blocked on the VPS LLM path and
on `nomic-embed-text` not being pulled; Phase 4 depends only on Phase 1, which
the original plan already noted. It is also two of the three legs of the v1
success criterion (Phase 1 + 4 + 5).

**Goal:** tenant pastes the snippet on their site (Wix/WordPress/etc), sees the widget live. Origin management from the UI, no more SQL.

**Backend — landed:**
- Migration **247** (`boot_pings jsonb` on `vani_tenant_domain`, approved as a
  schema change). Note this **takes 247 from Phase 2's extractor-prompt seed,
  which becomes 251 once the answer cache takes 248 and the intent tables
  take 249–250.**
- `PATCH /tenant/domains/:id/origins` — admin-only, add/remove batched in one
  transaction, tenant ownership asserted inside the SELECT and the UPDATE
  predicate (a foreign id is 404, never 403), `FOR UPDATE` against two admins
  racing, one `vani_audit_log` row with before/after. **Idempotent by
  construction** — a no-op edit returns `changed:false` and writes no audit
  row — which is why it mints no `Idempotency-Key`: `vani_idempotency` still
  does not exist, and a key nothing honours is worse than none.
- `POST /vara/embed/boot` records the site-alive ping, after both gates pass,
  as one merging UPDATE (no read-modify-write).
- `GET /vara/embed` now also returns `domains[]` (id + origins + boot_pings) so
  the screen renders from one call; `GET /tenant/domains` carries the same
  fields for other callers.

**Frontend — landed:**
- `/agents/vara/install` (nav flipped `planned` → `live`), three steps: copy
  the snippet · allowlist the sites · check it booted.
- Landing's "Install arrives next" placeholder replaced with a real link.
- `vani-app/src/lib/format.ts` added, mirroring VaNiGTM's gateway plus
  `formatRelative` for the liveness markers.

**Deviation from this plan, deliberate:** the in-app **iframe preview was not
built**. Rendered honestly it boots `/embed/chat` with `parent` = the CONSOLE's
origin, which is on no tenant's allowlist, so it is a permanent 403; the only
way to make it "work" is to send one of their real origins, which lies to our
own origin gate and writes a boot_ping for a site that never booted —
corrupting the single signal the screen exists to report. Step 3 is the real
verification loop instead (paste → load your page → refresh → see the time).
Reinstate the iframe only with a decision about that trade.

**Tests — done:** migration applied twice (idempotent); boot ping merges rather
than appends and writes nothing for a non-allowlisted origin; the PATCH's
3-check pattern (valid / empty tenant / wrong tenant → 0 rows, target
unmutated); UI driven in a real browser through add → duplicate add
(`changed:false`, info toast) → remove, no page errors.

**Then Charan walked it on a real tenant (2026-08-27), and four things broke.**
Every one was the same failure — a screen reporting a state it had not
verified — and all four are fixed:

| Found | Cause | Fix |
|---|---|---|
| Install said "publish your first JD", CTA led to a doorway that dead-ended | `industry_set` was not in the checklist at all | `db2271f` — industry checked FIRST; the list is ordered earliest-blocker-first so the client routes on `checks[0]` |
| Doorway's only affordance was **Try again**, which can never set an industry | `NO_INDUSTRY` rendered through the error boundary | `9082caf` — setup gaps render as an instruction with a link, never a retry |
| "Declare your domain" shown to a tenant whose domain **was** declared | the check tested `purpose='candidate'`; the CTA was written from the check's *name*, not its predicate | `916f58c` / `2cd7c5e` — split into `domain_declared` + `candidate_domain`, each with its own action and a `detail` naming the actual domain |
| A domain declared the ordinary way never satisfied Vara | the Domain step defaults `purpose` to `'workspace'` | `cd3a0b0` — **`purpose` is no longer a gate anywhere in Vara** (Charan's ruling). The origin allowlist was always the real control; `purpose` stays a declaration |

**Then, from publishing a JD (2026-08-27):**
- **A published JD was write-once** — listed, Duplicate-able, unreadable. `a581eb6` adds a read-only View, rendering facts `/vara/onboarding/context` already returned. No endpoint, no migration.
- **Employment contract** — `employment_type`, `onsite_pct`, `locations[]` into `facts` (`a581eb6`). Work mode is ONE number with the label derived from it, not a mode enum beside a percentage that can disagree.
- **A JD had no description**, and `/embed/boot` returned `{id, title}` — a candidate could see a job existed and nothing about it. `46e040f` / `da6f8e3` add `facts.description` and ship the **public half** of the role on boot (summary, description, employment, locations, band). The scoring contract — weights, knockouts, threshold — stays server-side; publishing the weights tells a candidate exactly what to claim.

**Not done — the gate:** Charan pastes the snippet on a real page and sees a
candidate walk-through. Everything above was verified in a browser against
fixtures and, for the SQL, a throwaway Postgres — not against a real boot from
a real site.

---

## Platform Channel slice — the widget becomes the product's, not Vara's

**Approved 2026-08-27.** Not a numbered phase; it sits between Phase 4 and
Phase 5 because Phase 5 builds the candidate conversation ON this channel, and
building it Vara-shaped would mean rewriting it when Nova arrives.

### Why now, and not later

The spec already draws the line — `vara-channels-and-activation.md` §1: *"the
VaNi platform lane (once per tenant, **serves every agent**) and the Vara
activation lane (per agent)."* Phase 4 built the channel on the wrong side of
it.

The forcing argument is narrower than tidiness: **the snippet is the only
artefact that cannot be migrated.** Rename a route and redeploy; but once a
tenant has pasted `<script src=".../embed/vara.js">` into Wix, that URL is
theirs for the life of their site and no deploy of ours can change it. The
Phase 4 gate IS the act of pasting it. So the shape has to be right *before*
the gate runs — which is why this slice jumped ahead of it.

The data model was already platform and does not move: `vani_tenant_domain`,
`embed_origins`, `boot_pings` (247), `PATCH /tenant/domains/:id/origins`,
`vani_agent`, `vani_tenant_agent`.

### Migrations 249 + 250 (approved schema)

`vani_agent_intent` — what an agent can be asked for. Platform-owned, **seeded
by each agent's own migration**, which is what "agents extend, never modify"
means in practice: an agent ships prefixed tables plus registry declarations.

```sql
create table vani_agent_intent (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references vani_agent(id) on delete cascade,
  code text not null, label text not null, description text not null,
  examples text[] not null default '{}',
  surface text not null default 'visitor' check (surface in ('visitor','operator')),
  embedding vector(768),
  sort_order int not null default 100,
  status text not null default 'active' check (status in ('active','retired')),
  unique (agent_id, code)
);
```

`surface` is what makes Nova cheap to be wrong about. Nova's two POA pathways
(N1 fix the digital estate, N2 run a campaign) are things Nova does FOR the
tenant, not conversations with the tenant's visitors — so Nova may declare only
`operator` intents, or none. An agent contributing zero visitor intents is a
**first-class case**, not an edge one, and the widget simply renders nothing
for it.

`vani_intent_match` — the router's decision log AND the catch layer's record.
Deliberately NOT `vara_match_log`: that table is entity→entity
(`matched_from_kind` is an enum of row types) and holds ids only, *"no PII"*.
Router matching is free text → intent, and the free text is exactly what the
catch layer needs.

```sql
create table vani_intent_match (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id) on delete cascade,
  session_ref text,                    -- the widget session, never a person
  outcome text not null check (outcome in ('routed','disambiguated','unmatched')),
  matched_intent uuid references vani_agent_intent(id),
  score real,
  runner_up_intent uuid references vani_agent_intent(id),
  runner_up_score real,
  query_embedding vector(768),
  query_redacted text,
  retain_until date not null,
  created_at timestamptz not null default now()
);
```

Both tenant-scoped with the `vani_` RLS pattern, HNSW on both vectors. Written
**before** the outcome commits — the invariant migration 246 states.

**Numbering:** 248 went to the answer cache (below), so the intent tables are
249–250 and Phase 2's extractor-prompt seed is **251**.

### Routing — three bands, none of them a guess

```
score >= VANI_INTENT_HIGH (0.72)   ROUTE          one intent, confident
LOW <= score < HIGH,               DISAMBIGUATE   top-2/3 as chips, "did you mean"
  or top-1/top-2 within a margin
score <  VANI_INTENT_LOW  (0.45)   CATCH-ALL      say what this widget can do,
                                                  show every live intent, keep the miss
```

Tier 1 is affordance: boot returns the live agents' visitor intents as chips
and a click IS the routing — no model call, `actor_type='rule'`. Free-text
matching is tier 2 and uses `embedText` + HNSW, not an LLM: the machinery
exists and is unused, it is an order of magnitude cheaper per message, and
nearest-neighbour is the right shape for intent selection.

Disambiguation rather than an LLM second opinion, deliberately: the visitor is
right there, one click is free, and it is more accurate than a model guessing
on their behalf. **No band is a silent fallback** — every one is a visible
state where the visitor can see what happened and what they can do (rule 12).

Thresholds live in env, not the schema; they want tuning against real traffic.

### The catch layer is where the compounding is

Every `unmatched` row is evidence of a missing intent or a missing example.
Clustered over the HNSW index, they become proposals for new intents — the
calibration loop applied to routing, and the operator surface for it belongs
with Phase 6.

**PII decision (2026-08-27).** Visitor free text can carry personal data from
someone who has consented to nothing, so the row stores `query_embedding` (what
clustering actually needs) plus `query_redacted` (emails/phones/handles
stripped, so a human can name a cluster) — never the raw message.
`retain_until` defaults to 90 days and forces the decision to be explicit
rather than "someday". The table carries no candidate id, so it is **not** in
`vara_purge_candidate`'s path; retention is the control. Revisit if
`session_ref` is ever joined to an application.

### `assembleContext()` — approved, no schema

One platform function returning tenant memory + that agent's memory + the
resolved prompt, so no agent re-implements "where is the brand voice".

The three-layer model already exists once, on the wrong side of the line:
`gt_tenant_context` is documented as *"shared per-tenant memory across all
agents"* with `profile` (tenant) and `knowledge` keyed by agent — but it is on
the **`gt_` prefix**, keyed by skill name rather than `vani_agent.code`, and
**nothing in `vara/` or `vani/` reads it** (readers: context.store, llm.client
for budget, research-skill, vani-skill).

The rule this slice writes down:

> **Memory is stored and owned. Context is assembled and thrown away.**
> Every tenant fact has one home. Agent memory is typed, versioned, prefixed.
> Context is a function of both plus the prompt, computed per call, never
> persisted — a stored context is a second copy of the truth that drifts.

Two consequences, both deliberate:
- **Agent memory stays typed, not JSONB.** `vara_skill` with an embedding and a
  usage count beats a bag: queryable, indexable, RLS-able, versioned. So
  `gt_tenant_context.knowledge` is the pattern that should shrink, not the one
  Vara should join.
- **Moving the BRAIN to `vani_` is NOT in this slice.** It is migrations plus
  both frontends. The assembler is what makes that deferrable at no cost —
  callers go through one place now, so the move changes no call sites later.

### Not built here, named so nobody assumes it

- Nova's intents — nothing to declare until Nova exists
- LLM classification as a second opinion — disambiguation covers it
- The unmatched-cluster review surface — Phase 6, with the other operator tools
- The BRAIN's move off `gt_`

---

## Answer cache — migration 248, applied-and-tested, caller lands with Phase 5

**Approved 2026-08-27.** A visitor asks "tell me about this JD"; the model
answers once; every visitor asking the same thing afterwards is served from
Postgres with no LLM call. DB-level, not Redis — Charan's ruling: the queue
and cache libraries stay out, the database does this.

**The key is immutable, so nothing ever needs invalidating:**

```
(jd_version_id, prompt_id, model) + question embedding
```

`vara_jd_version` is immutable by design and `vani_prompt` is append-only, so
an answer keyed to (JD v1, prompt v3, qwen3:8b) is correct forever. Publish
v2 → different key → miss → fresh answer. Edit the prompt → new row → miss.
Change model → miss. No expiry, no bust, no stale read, **no invalidation code
to get wrong.** That property is inherited from decisions already made rather
than designed here, which is why the table is safe to keep indefinitely.

**Only impersonal turns may be cached — the whole safety story.** "Tell me
about this JD" has one answer for everybody; "am I a good fit?" does not, and
serving one candidate's assessment to the next is a data leak, not a hit. The
rule is STRUCTURAL, never a classification: *a turn is cacheable only if the
context that produced it contained no candidate-scoped input.* The assembler
knows what it put in, so the writer proves this rather than judging it — a
judgement about whether a question "sounds personal" will eventually be wrong.
This is the second argument for `assembleContext()` landing first.

**No HNSW, deliberately** — the one vector column in the schema without it.
Lookups narrow to ONE key first and that candidate set is tens of rows, so a
btree on the key plus an exact cosine over what remains beats an approximate
index at this size. Verified: the plan is `Index Scan using
idx_vara_answer_cache_key`, then sort. Revisit only if one JD ever accumulates
thousands of distinct questions.

**Raw questions are not stored** — embedding for matching, `question_redacted`
for human review. A question can carry personal data even when the answer it
produced cannot. Same treatment as the router's catch layer.

**Verified on a throwaway Postgres with pgvector 0.6:** applies twice cleanly;
a near-identical question hits at 1.000; an orthogonal one scores 0.000 and is
rejected by the threshold; a republished JD version misses; a different model
misses. (The first attempt at the discrimination test was meaningless —
uniform vectors of different magnitude are parallel, so cosine is 1.0 whatever
the scale. Redone with a genuinely different direction.)

**Not built:** the reader/writer. Its only caller is the candidate
conversation, and infrastructure without a caller is what the working method
says not to ship. The table lands now because it was approved now; the code
lands in Phase 5.

---

## Phase 5 — Candidate lifecycle (JD → chat → score → handover)

**Goal:** a candidate actually applies through the embed widget, gets scored, lands on the recruiter's map. Vara's core value delivery.

**Depends on:** MSG91 port (for ack/decision comms) OR email-only initial (spec allows).

**Inherited from 2026-08-27 — `vara_jd_position`, a schema change to raise here.**
Charan asked for "No of Positions, each possibly in a different location". It
did NOT go into `facts`: `vara_jd_version` is immutable and applications pin
the version that scored them, so filling a seat would mint v2 and strand every
in-flight application on a superseded contract. Positions are mutable
operational state and want their own tenant-scoped table — designed HERE,
against the `vara_application` that has to reference which seat a candidate
applied to, rather than guessed at in advance. The JD Studio panel already
tells the tenant this is tracked separately.

**Backend:**
- Extend `/embed/chat` from placeholder to real: question generation from JD's must-haves (uses prompt store: `vara.candidate.ask_next`), `vara_chat_turn` writes, `vara_application` state via `vara_transition`.
- Knockout evaluation before scoring (deterministic, `actor_type='rule'`).
- Score snapshot creation (`vara_score_snapshot` — metering fires automatically).
- Closing window state + 3-day timer (`actor_type='timer'`).
- On new `vara_score_snapshot`, embed the candidate's profile summary into `profile_embedding` for later silver-medalist lookback.

**Frontend:**
- Recruiter surfaces already prototyped: probability map, closing window, HM handover queue.
- These get wired to real data (`vara_application`, `vara_score_snapshot`, `vara_calibration_signal`).

**Tests:**
- Full candidate journey: apply on the embed → get acked → recruiter sees on map → advance → HM verdict.

**Gate:** first real candidate goes through end-to-end.

---

## Phase 6 — Playbook agent (Vikuna operator surface)

**Goal:** publish new global playbooks without SQL, with LLM-assisted authoring, promote tenant-approved Tier-3 playbooks into the registry.

**Backend:**
- `/agents/vara/playbooks/*` — admin-only CRUD over `vani_domain_pack` payloads.
- LLM authoring endpoint (uses Vikuna's own key, not BYOK).
- Recommender: for a new industry we don't have a pack for, nearest-neighbour search across `axes_embedding` on published `vara_family_profile` rows finds the closest fit; recommender says which pack it adapted from + writes a `vara_match_log` row.

**Frontend:**
- Author form (schema-driven from Vara's playbook shape declaration).
- LLM draft button.
- Fork existing playbook.
- Version publish/deprecate.

**Gate:** Charan authors + publishes a new playbook (e.g. mining × project manager) from the UI, sees a subsequent tenant activate against it directly.

---

## Calibration Loop — the learning half

Not a numbered phase because it stitches across Phases 5 and 6 rather than sequencing after them. Called out separately because it's the loop that turns Vara from "one-shot decider" into "gets better".

- Calibration proposer watches HM Interview/Pass decisions vs the composite. Systematic over/under-scoring on a component → proposes weight change → human approves → new `vara_scoring_config` version written (append-only per V-14).
- Family-defaults deriver (Phase 3) is the same shape, one level up.
- Every proposal that used a semantic match writes `vara_match_log` first.

Both learning loops land in Phase 6 timeframe; the shape is ready.

---

## Order of execution — chronological

```
[✅ DONE] Phase 0 · UX preview complete
[✅ DONE] Phase 1 · Compose path         (Vara LIVE from console for real)
[✅ DONE] Prompt Store slice             (per-tenant prompt override)
[✅ DONE] Semantic Layer slice           (pgvector + vara_skill + match_log)

[✅ DONE] Phase 4 · Install screen        (taken early — only depends on Phase 1)
           ↓  built + hardened; the real-boot gate is UNRUN

[NEXT]    Platform Channel slice           (approved 2026-08-27)
           ↓  the widget becomes the product's, not Vara's
           ↓  MUST precede the Phase 4 gate — the snippet URL cannot be migrated
           ↓  migrations 249 (vani_agent_intent) + 250 (vani_intent_match)

          Phase 4 gate · paste on a real page, watch a boot land

[ D1 · lane-aware onboarding    — unruled, blocks a cold tenant ]
[ D2 · industry master data     — unruled, blocks pack matching ]

          Phase 2 · Wire Import path + Extractor
           ↓  first real use of prompts + evals + vara_skill
           ↓  BLOCKED until: VPS LLM path stable + `ollama pull nomic-embed-text`
[ Rotate 4 keys — Charan, in parallel ]
[ BYOK encryption — separate workstream ]
          Phase 3 · Family derivation    (semantic dedup via vara_skill)
           ↓
          Phase 5 · Candidate lifecycle  (largest; multi-phase itself)
           ↓
          Phase 6 · Playbook agent + Calibration Loop
```

**Phase 4 jumped forward on 2026-08-26**, for exactly the reason noted here: it only depends on Phase 1. Phase 5 is now the remaining leg of the v1 criterion.

---

## What NOT to build

Named so nobody tries, per prior conversations:
- Ingestion of LinkedIn posts (ToS grey area — deferred)
- Auto-promotion of Tier-3 → registry (user-invoked only, per Charan's rule)
- Adjacency taxonomy separate from the pack — lives inside pack payloads
- "Onboarding as form-filling" pattern — the doorway shape is settled
- Silent semantic-match decisions — `vara_match_log` writes come BEFORE the outcome commits, not after

---

## Success criterion for v1

**A cold tenant** (has completed Smart Profile up to Domain step) can:
1. Click **Agents → Vara**
2. Enter the activation phrase
3. Walk the doorway (family + title)
4. Compose or import a JD
5. Publish
6. Paste one script tag on their site
7. Receive their first candidate application

...without SQL, without a curl command, without a Vikuna operator in the loop.

That is Phase 1 + Phase 4 + Phase 5.

**Steps 1–5 are done and exercised on a real tenant (2026-08-27).** Step 6 is
built but ungated — the snippet and allowlist exist; nobody has yet pasted the
tag on a real page and watched a boot land. Step 7 is Phase 5, unstarted.

Phase 2/3/6 are compounding value.
