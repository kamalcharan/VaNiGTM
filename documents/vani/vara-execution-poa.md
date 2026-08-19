# Vara — Execution POA

**Date:** 2026-08-17 (late)
**Supersedes:** the slice plan in `vara-onboarding-design.md` §"Slice plan"
**Companion to:** `vara-readiness-review.md`, `vara-onboarding-design.md`,
`vara-channels-and-activation.md`

Everything settled across the design conversation, ordered for execution.
Each phase is bounded, testable, and has a named gate. No phase starts
until the previous one signs off. Nothing has schema changes.

---

## Where we are

**Done (backend-wired, in production paths):**
- vani_ platform spine + vara_ agent tables + state guard (migrations 240–243)
- `/vara/activate`, `/vara/status`, `/vara/embed`, `/vara/embed/boot`, `/tenant/domains`
- Landing page with code-gated activation
- Living demo (the prototype's candidate view auto-playing, two-column stage)
- Smart Profile step 6 (Domain) — writer + section
- Vikuna tenant activated on the VPS DB

**Done (UX preview only, no backend writes):**
- Onboarding doorway (`/agents/vara/onboarding`) — inheritance card + family + title
- JD Studio compose (`/agents/vara/jd-studio`) — scripted chip flow + emerging JD panel
- Landing goes LIVE after preview Publish (sessionStorage fake, DB-truth override)

**Design settled, not yet in UX or code:**
- Import path (upload docx/pdf, extract with provenance)
- Playbook derivation from N JDs in same family
- JD versioning (edit → v2, old snapshots stay honest)
- Playbook fork/versioning UI (v3, operator surface)
- Install screen (snippet + origin management)

---

## Standing dependencies — before code starts

Not phases; things that must be true or done at some point independent of the flow:

- **Rotate 4 exposed keys** (`ANTHROPIC_API_KEY`, `JWT_SECRET`, `LLM_PRIMARY_KEY`, `DB_PRIMARY` password) — Charan's action, still outstanding since first handover
- **BYOK LLM encryption** (`vani_llm_provider.credentials_enc`) — gates Phase 2 (extraction) and Phase 5 (real candidate chat)
- **LLM path stability on VPS** — vocabulary step still fails; blocks Phases 2, 5, 6
- **MSG91 adapter port** from ContractNest — gates Phase 5 candidate comms
- **Careers page fetch** for JS-heavy sites (headless browser) — only if URL ingest is added later

---

## Phase 0 — Extend the UX preview with Import

**Goal:** the full enhanced UX (compose + import + versioning affordances) exists as a click-through preview so it can be signed off in one review pass.

**Adds:**
- Doorway grows a second choice after family+title: *Compose with Vara* / *Import existing JDs*
- Import screen: drag docx/pdf, deterministic mock extraction, review with provenance annotations
- JD Studio review mode: same right-hand panel, "from your file" per field
- After 2nd JD in a family (session-only): "apply as family default?" prompt with derived diff
- Duplicate button on any existing JD → JD Studio in edit mode with a copy
- Edit an existing JD → publishes as v2 (session-only demo)

**No backend writes.** All state client-side, deterministic mocks.

**Gate:** Charan signs off the entire enhanced UX. This is the last design pass before code lands.

---

## Phase 1 — Wire the Compose path (Vara goes LIVE from the console for real)

**Goal:** the compose path we already built becomes real end to end. First real JD lives in the DB, subscription flips `activating → live` on Publish, embed lists the role.

**Backend (VaNiGTM `claude/vara-foundation`):**
- Seed 3 handcrafted playbooks into `vani_domain_pack` payloads (industries + role families — **Charan names them before this starts**)
- `GET /vara/onboarding/context` — returns tenant's Smart Profile industry, available role families derived from published playbooks, tenant's brand data for the inheritance card
- `POST /vara/jd/compose` — accepts the compose chip contributions (facts JSON), creates:
  - `vara_family_profile` if first in family (from the JD's own shape)
  - `vara_scoring_config` v1
  - `vara_jd` + `vara_jd_version` v1
  - subscription → `live`, audit row
  - single transaction, idempotent by `Idempotency-Key`
- Update `readinessChecklist` to include "first JD published"

**Frontend (`vani-app`):**
- Swap `mock-data.ts` for real API calls in `OnboardingRunner` + `JdStudio`
- Delete `UX_DONE_KEY` sessionStorage fake — state is now backend-truth
- `useSkillMutation` wiring for the compose endpoint (idempotency, no stale writes — CLAUDE.md rules)

**Tests:**
- E2E in Chromium: activate → onboarding → compose → publish → landing shows LIVE from backend
- DB check: `vara_jd`, `vara_jd_version`, `vara_family_profile`, `vara_scoring_config` all present; `vani_tenant_agent.status = 'live'`
- Audit: correct rows in `vani_audit_log`

**Gate:** Charan runs the flow end-to-end against local + VPS DB and confirms.

---

## Phase 2 — Wire the Import path

**Goal:** tenant can upload existing JDs, review the extracted structure, publish. Same LIVE outcome as compose.

**Depends on:** BYOK LLM encryption OR Vikuna's own key for extraction. Named honestly — this phase cannot ship reliably before that dependency.

**Backend:**
- Add "job description" adapter to ingestion pipeline (deterministic docx/pdf parse — reuses the existing spine)
- `POST /vara/jd/import` — accepts N files, writes `vara_artifact` rows, kicks extraction job
- One fenced LLM stage extracts to schema (title, must-haves list, knockouts, band, evidence spans + confidence per field) → `vara_extraction` rows
- `GET /vara/jd/extractions/pending?family=X` — polling for review queue
- `POST /vara/jd/from-extraction` — same shape as compose, tenant-approved facts + provenance

**Frontend:**
- Import mode in JD Studio (or doorway second choice, per Charan's earlier answer)
- Progress state during extraction
- Review panel per JD: same right-hand panel, provenance annotations, confidence marks
- Bulk upload → queue → review each

**Tests:**
- Real docx/pdf sample uploaded → extraction rows created, review panel shows fields with provenance
- Approve → JD written same shape as compose, LIVE

**Gate:** Charan reviews a real extraction quality on 2-3 sample JDs.

---

## Phase 3 — Family playbook derivation

**Goal:** family defaults compound as tenant publishes more JDs. Second JD in same family prompts "apply as default?" with derived diff.

**Backend:**
- Job (synchronous on Nth publish for v1; async later): compute per-family statistics
  - Must-haves: frequency-weighted union across JDs in the family
  - Knockouts: intersection (only those in ALL JDs)
  - Threshold: mode across JDs
  - Bands: aggregate range
- `POST /vara/family/apply-derived` — tenant-invoked, updates `vara_family_profile`
- `GET /vara/family/:id/derivation-preview` — returns proposed defaults + evidence per field

**Frontend:**
- Landing page card + JD Studio banner: "Ready to seed Backend Engineering defaults from 3 JDs"
- Preview + apply flow

**Tests:**
- Publish 2 JDs in same family → prompt appears with numeric diff
- Apply → family_profile updated; next JD's compose/import pre-fills weights from family

**Gate:** Charan confirms the prompt fires at the right time (not too eager, not too late) and the derived defaults look right.

---

## Phase 4 — Install screen (Vara reaches your candidates)

**Goal:** tenant pastes the snippet on their site (Wix/WordPress/etc), sees the widget live. Origin management from the UI, no more SQL.

**Backend:**
- `PATCH /tenant/domains/:id/origins` — add/remove embed origins (admin-only), audit
- `GET /vara/embed` already exists — add site-alive ping ("widget booted from these origins in the last 7 days")

**Frontend:**
- New Install section on `/agents/vara` landing (below CTA band, only when LIVE)
- Snippet display + copy button
- Origin list: add / remove / status per site
- Preview: paste snippet in-app, see it work in an iframe

**Tests:**
- Add origin, test widget on a fake foreign origin, remove origin, widget refuses on next boot

**Gate:** Charan pastes snippet on a real vikuna.io page and sees a candidate walk-through.

---

## Phase 5 — Candidate lifecycle (JD → chat → score → handover)

**Goal:** a candidate actually applies through the embed widget, gets scored, lands on the recruiter's map. This is Vara's core value delivery.

**Depends on:** MSG91 port (for ack/decision comms) OR email-only initial (spec allows).

**Backend:**
- Extend `/embed/chat` from placeholder to real: question generation from JD's must-haves, `vara_chat_turn` writes, `vara_application` state via `vara_transition`
- Knockout evaluation before scoring
- Score snapshot creation (`vara_score_snapshot` — metering fires automatically)
- Closing window state + 3-day timer

**Frontend:**
- Recruiter surfaces the prototype already shows: probability map, closing window, HM handover queue
- These get wired to real data (`vara_application`, `vara_score_snapshot`, `vara_calibration_signal`)

**Tests:**
- Full candidate journey: apply on the embed → get acked → recruiter sees on map → advance → HM verdict

**Gate:** first real candidate goes through end-to-end (Charan or a friend applies to Vikuna's own careers).

---

## Phase 6 — Playbook agent (Vikuna operator surface)

**Goal:** publish new global playbooks without SQL, with LLM-assisted authoring, promote tenant-approved Tier-3 playbooks into the registry.

**Backend:**
- `/agents/vara/playbooks/*` — admin-only CRUD over `vani_domain_pack` payloads
- LLM authoring endpoint (uses Vikuna's own key, not BYOK)

**Frontend:**
- Author form (schema-driven from Vara's playbook shape declaration)
- LLM draft button
- Fork existing playbook
- Version publish/deprecate

**Gate:** Charan authors + publishes a new playbook (e.g. mining × project manager) from the UI, sees a subsequent tenant activate against it directly.

---

## Order of execution — chronological

```
Phase 0 · Extend UX for import          (1 turn, no wiring)
  ↓  Charan signs off complete UX
Phase 1 · Wire Compose path             (2–3 turns)
  ↓  Vara goes LIVE from the console for real
[ Rotate 4 keys — Charan, in parallel ]
[ BYOK encryption — separate workstream, blocks Phase 2 ]
Phase 2 · Wire Import path              (3–4 turns after LLM stable)
  ↓
Phase 3 · Family derivation             (1–2 turns after Phase 2)
  ↓
Phase 4 · Install screen                (1–2 turns; can go before Phase 2 if desired)
  ↓
Phase 5 · Candidate lifecycle           (largest; multi-phase itself)
  ↓
Phase 6 · Playbook agent                (Vikuna's own tool)
```

**Phase 4 (Install) can jump forward** — it doesn't depend on Phase 2 or 3, only on Phase 1. If you'd rather get "tenants can literally embed Vara on their sites" before "smart importers", swap Phase 4 with Phase 2.

## What NOT to build

Named so nobody tries, per prior conversations:
- Ingestion of LinkedIn posts (ToS grey area — deferred)
- Auto-promotion of Tier-3 → registry (user-invoked only, per Charan's rule)
- Any schema change (extend `vani_domain_pack` payloads; do not add tables)
- Adjacency taxonomy separate from the pack — lives inside pack payloads
- "Onboarding as form-filling" pattern — the doorway shape is settled

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

That is Phase 1 + Phase 4. Everything after is compounding.
