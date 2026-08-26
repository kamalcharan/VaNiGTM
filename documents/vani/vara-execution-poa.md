# Vara — Execution POA

**Date:** 2026-08-26 (Phase 4 landed, taken out of order)
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

## Where we are (2026-08-26)

**Landed to main, both repos, verified end-to-end:**

- **Phase 0** — UX preview complete (compose + import + Duplicate + Other + empty-mode + family-defaults derivation prompt).
- **Phase 1 — Compose path** — real DB writes. Migration 244 (three seed talent packs under Technology & SaaS: Backend / Frontend / Product & Design). `GET /vara/onboarding/context`, `POST /vara/jd/compose` (single transaction: `vani_role_family` upsert + `vara_family_profile` + `vara_scoring_config v1` + `vara_jd` + `vara_jd_version v1` + subscription flip to `live` + two `vani_audit_log` rows). Advisory-lock idempotency-in-practice with 60s freshness window. Frontend swapped from mock to real API. `UX_DONE_KEY` deleted; subscription is server-truth.
- **Prompt Store** — migration 245 (`vani_prompt`, two-scope one-table: system + tenant override, append-only content trigger, one-active-per-scope partial unique index, tenant-scoped RLS). `resolvePrompt(db, key)` + `renderPrompt(prompt, vars)`. Endpoints `GET/PATCH/DELETE /vara/prompts[:key]`. Prompt Studio UI at `/agents/vara/prompts` with variable-coverage validation. Seeded `vara.composer.ask_next` as proof-of-shape (real caller lands with Extractor).
- **Semantic Layer** — migration 246 (`CREATE EXTENSION vector` guarded; `vara_skill` with `embedding vector(768)` + HNSW cosine; `vara_family_profile.axes_embedding` + HNSW; `vara_candidate.profile_embedding` + HNSW; `vara_match_log` append-only). `embedText(text)` helper (Ollama-native `nomic-embed-text` default, 768-dim). `canonicalizeSkill(name)` for exact-match dedup before embedding. `recordMatch(db, input)` helper. Deploy note at `docs/db/pgvector-install.md`. pgvector 0.8.6 live on VPS in `vikuna-postgres` container (swapped from `postgres:17-alpine` to `pgvector/pgvector:pg17`, same `docker_pg_data` volume, zero data risk).
- **VPS state** — single Postgres container, PG 17 + pgvector 0.8.6. Empty host-level PG 16 stray from the pgvector-install detour dropped.
- **Phase 4 — Install screen** (2026-08-26, taken out of order; see its section). Migration 247 `boot_pings`, `PATCH /tenant/domains/:id/origins`, boot-ping recording, and `/agents/vara/install`. Verified locally against a fixture; **not yet applied or deployed to the VPS**, and the Charan gate is unrun.

**Design settled, not yet in UX or code:**
- Import path with fenced-LLM extraction (Phase 2 body)
- JD versioning (edit → v2, needs `POST /vara/jd/:id/version`)
- Playbook fork/versioning UI (Phase 6, operator surface)

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
- Migration **248** (small): seed system prompts for `vara.extractor.field_schema` and `vara.extractor.evidence_check` in `vani_prompt`. (Was 247; Phase 4 took that number on 2026-08-26.)
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
  which becomes 248.**
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

**Not done — the gate:** Charan pastes the snippet on a real vikuna.io page and
sees a candidate walk-through. Needs migration 247 applied to the VPS and both
services rebuilt. Everything above was verified locally against a fixture, not
against production.

---

## Phase 5 — Candidate lifecycle (JD → chat → score → handover)

**Goal:** a candidate actually applies through the embed widget, gets scored, lands on the recruiter's map. Vara's core value delivery.

**Depends on:** MSG91 port (for ack/decision comms) OR email-only initial (spec allows).

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

[NEXT]    Phase 2 · Wire Import path + Extractor
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

That is Phase 1 + Phase 4 + Phase 5. Phase 2/3/6 are compounding value.
