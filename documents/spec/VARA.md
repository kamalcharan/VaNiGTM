# Vara — Specification v1.0 (intended) · 2026-09-30

> **Status.** This is the INTENDED product. Where the build deviates, the build is
> corrected to this document (Charan, 2026-09-30, POA §0 principle 1). It replaces
> `vikunawebsite/docs/vani/vara-specification.html` v0.2 (16-Aug) as the spec of
> record, folds in the journey map (17-Sep) and the decisions register of
> `documents/POA-2026-09-30-platform.md`, and keeps the V-numbering.
>
> **Built today** is stated against the VaNiGTM working tree on 2026-09-30, which
> has `claude/session-setup-qrxev9` merged with its migrations renumbered
> **254–258** (D1, ruled: merge). Every ✅ names the file it was read from.
> Paths: `backend/…` = `VaNiGTM/backend`, `vani-app/…` = `vikunawebsite/vani-app`,
> `migrations/NNN` = `VaNiGTM/backend/migrations`.
>
> Legend: ✅ built and read in code · ◐ partly built (what is missing is named) ·
> ✗ not built.

---

## 1. Positioning & scope

**Vara is the VaNi talent agent.** It runs the front half of talent acquisition
for a tenant: composes job definitions, converses with candidates on the tenant's
own site, ingests what they share, screens with evidence, ranks by probability,
and hands a human a decision that is already *prepared* — never already made.
It is not an ATS. **Rules reject, models rank, humans decide.**

| Principle | What the build must make true | Enforced today |
|---|---|---|
| Rules reject, models rank, humans decide | Only a deterministic knockout closes without a human. A score orders; it never terminates. | ✅ `vara_transition()` refuses `actor_type='model'` and confines `rule` to `applied→knockout_closed` (migrations/242, 243) |
| Nothing closes instantly | Every below-line application enters a closing window (default 3 days, per-JD) before any decision message | ✅ schema (`window_days`, `idx_app_timer_sweep`) · ✗ timer actor, messages |
| Evidence, not adjectives | Every score component cites a chat turn, an artifact line or a signal | ✅ `vara_score_snapshot.axes` carries evidence refs · ✗ nothing writes it |
| Learning is gated | Vara proposes; a named human approves; configs are versioned and immutable | ✅ `vara_scoring_config` append-only; `update_family_shape` appends v(N+1) · ✗ proposals |
| No black holes | Ack on application, decision on close, on the candidate's channel | ✗ no comms adapter, no `vani_template` rows |
| Consent-clean data only | Candidate-provided artifacts only; consent, retention, deletion are features | ✅ `vara_consent`, `vara_purge_candidate()` · ✗ no consent capture, **no suppression model anywhere** (D9) |
| Attention compresses at volume | At 250 applicants the human sees ~9 above the line and Vara's picks below | ✗ map is a `NotYet` page |
| Vikuna is tenant #1, not a special case | `vikuna` is a `vani_tenant` row with its own domain and subscription | ✅ seeded by migrations/242 |
| Agents extend, never modify | `vani_` never grows agent columns; Vara ships `vara_` tables off platform keys | ✅ migrations/241–246; the one platform column added for Vara (`boot_pings`, 254) is platform telemetry, not agent state |
| **The Brain feeds every agent** (new, 2026-09-30) | Industry, role families and packs are read from / linked into the tenant's Smart Profile graph. No second copy of org facts. | ◐ today Vara reads **industry only**, from `vn_tenant_profiles` (§5.5) |

**v1 excludes** (named so nobody builds them by accident): interview scheduling
(v2; INV-01 reserves the slot) · offer management · employee onboarding ·
job-board auto-posting (v1 publishes a link/QR/infographic and the embed) ·
multilingual candidate chat (template layer is language-ready) · cross-tenant
talent marketplace (never, under current positioning) · true self-learning (gated
calibration by design) · LinkedIn or any third-party profile scraping · an agent
framework or DAG runner (POA §12) · a second knowledge store beside the Brain.

**Corrections to the v0.2 spec, so it is not re-read as current:**

1. The LLM provider is a **platform** concern already built — `vani_llm_provider`,
   BYOK per tenant, `agent-core/llm.provider.ts`. Vara consumes it; it is a Settings
   item, not an onboarding step (CLAUDE.md, BYOK section).
2. Comms are **email-only first** unless MSG91 is ported (Track F). The six
   templates stand; the provider column stays `msg91`-default until decided (§8).
3. Domain packs are **researched by an agent and published unreviewed**, not
   curated by an operator before release (user ruling 2026-09-17, §5.3).
4. Onboarding is a **proposal loop**, not a checklist of forms
   (`vara-onboarding-design.md`): the tenant takes families and accepts a finished
   draft; nothing is typed that Vara could have proposed.
5. The candidate channel is **the platform's embed**, not Vara's — one snippet,
   every live agent (`backend/src/vani/embed.routes.ts` header).

---

## 2. Personas

| # | Persona | Who | Does | Cares about |
|---|---|---|---|---|
| P1 | Tenant Admin | Head of HR / Ops lead | Owns the subscription; declares the org once; sets comms, compliance, role families and defaults; approves calibration; watches metering | Defensibility, cost, brand of the candidate experience |
| P2 | TA Professional | Recruiter | Daily driver, "the human in humans decide": composes JDs, watches the map, works the closing window (rescue/hold/close-now), advances, hands over | Time-to-shortlist, not missing a good one, defensible closes |
| P3 | Hiring Manager | The role's owner | Occasional; receives a ranked, evidence-first shortlist; verdicts Interview or Pass-with-reason; never touches pipeline mechanics | Quality of the top 5, zero admin, being heard |
| P4 | Candidate | Applicant, any domain | Applies through a conversation on the tenant's site; told band, notice and knockouts up front; status honestly on their channel | Respect, speed, honesty, control of their data |
| P5 | VaNi Operator | Vikuna platform team | Provisions tenants; monitors fleet loop-health; promotes/retires domain packs; runs the commercial gateway | Tenant isolation, unit economics, one codebase per domain |

Journey-map framing (17-Sep) sharpens P2/P3 for v1: the first user is **a hiring
manager at a SaaS company with a role to fill this afternoon.** They are not here
to teach Vara. Every question is cost.

---

## 3. Key flows

### 3.1 The tenant journey — five stations (journey map, corrected to main)

| # | Station | Tenant | Vara | System writes | Built today |
|---|---|---|---|---|---|
| 1 | **Name the role** | Types a title | Matches it against the tenant's own families first, then the industry's packs. Deterministic, no model, one round trip; below the floor it says "no match", never the nearest | reads `vara_family_profile` + `vani_domain_pack` | ✅ `domain-pack-skill.match_title` (`title-match.ts`, `SCORE_FLOOR = 45`); JD Studio asks title first (`JdStudio.tsx:202,216`) |
| 2 | **A finished draft** | Reads a complete JD | Summary, weighted must-haves, knockouts, threshold — the matched shape, whole, each field marked where it came from | nothing yet | ◐ shape lands on the panel with no questions; only `unknownRole` asks (`JdStudio.tsx:282`). **Per-field provenance not shown** — `from_pack` is family-level only |
| 3 | **Accept, or adapt** | Keeps it or edits any line | Provenance flips per field: "industry playbook → you changed this" | nothing committed | ◐ must-haves/weights editable, split-of-100 conserved, knockouts add/remove (`vani-app/src/skills/vara-onboarding/weights.ts`). Provenance flip ✗ |
| 4 | **Publish** | One button | Goes live for the workspace; the role lists in the embed | `vara_jd` + immutable `vara_jd_version` + `vani_role_family` upsert + audit, one transaction, one advisory lock, 60 s replay on `Idempotency-Key` | ✅ `POST /vara/jd/compose` (`vara.routes.ts:451–787`), `jd-compose.db.test.ts` drives the real router over HTTP |
| 5 | **The second JD is cheaper** | Names a second role in the family | Opens from what they decided last time, and says so | reads `vara_family_profile.active_config_id` | ◐ `my_families` reads the live shape; own families match before the catalogue. **"Next Full Stack role starts from this" is not said in the UI** (D11) |

The **no-match lane** is the honest half and is built: Vara says she has no
playbook, asks the structural questions (summary, must-haves strongest-first,
hard gates, threshold), offers no chips, and the answers create the tenant's first
family in that space (`jd-script.ts` `unknownRole`).

Of the map's seven breaks, five are fixed on main (title-first, finished draft,
editable weights, own families read back, research no longer waits on an operator)
and `gt_events` reclaim landed as migration 253. **Open: seniority** (a Junior and
a Principal still produce a byte-identical contract — D10) and the supersede
consequence line (D11).

### 3.2 Activation — F1 from the platform

Two lanes (Flow D1). The **platform lane** is VaNi's and serves every agent: tenant
provisioned (lazily, on the Domain step's first write across the slug bridge) →
org profile with industry (the Brain) → domain + embed origins → people → model
(BYOK, a Settings item). The **Vara lane** is the agent's and ends at a gate.

```
POST /api/v1/vara/activate     owner/admin only · one transaction · audit row (actor human)
  ├─ TENANT_NOT_PROVISIONED  if the Domain step never ran
  ├─ readiness checklist     industry_set · domain_declared · embed_origins · first_jd_published
  └─ upsert vani_tenant_agent  → 'live' if a JD is published, else 'activating'
                                 (reconciles in either order; activated_at stamped once)
```

Built: ✅ `vara.routes.ts:100–320`; `activation-readiness.test.ts` runs the real
domain step then reads the real checklist. `purpose` on the domain is **not a
gate** (Charan, 26-Aug) — the allowlist is the control, re-checked on every boot.

Intended: the checklist **grows, never shrinks**. It gains, as each feature lands:
consent text + retention configured (V-05) · ≥1 approved template or email-only
chosen explicitly (V-04) · ≥1 TA and one named calibration approver in
`vani_user_agent_role` (V-03) · LLM test passed (platform). No `vara:` lane exists
in either repo yet (`registerLane` never called; the Vara journey in the console is
declared in `vara-nav.ts` and read from a **mock** `vara.journey` fixture,
`vani-app/src/skills/gtm-shell/mock.ts:118`).

### 3.3 Candidate lifecycle — Flow D2

Nine states, edges enforced in the database. Only a rule or a human ends an
application; a score alone never can.

```
applied ──rule──▶ knockout_closed ──▶ talent pool (unless consent declined)
   │
   └─system─▶ scored ──system─▶ ┬─ ≥ T ─▶ handover ──human─▶ advanced ──human─▶ hired
                                │                    │            └──▶ closed (hm_pass, reason)
                                │                    └──human──▶ closing / closed
                                └─ < T ─▶ closing ──timer──▶ closed (below_threshold under config vN)
                                             │  ├─human: rescue ─▶ handover
                                             │  ├─human: hold   ─▶ held ──▶ closing | handover
                                             │  └─human: close-now ─▶ closed
```

| Rule | Where it lives |
|---|---|
| Legal edges exactly as drawn | `vara_transition()` (migrations/242:121–135, re-issued in 243) |
| `model` is not an actor; `rule` only knockouts; `timer` only `closing→closed`; `system` routes, never decides | 242:136–148 |
| Every transition writes `vani_audit_log` in the same transaction | 242:174 |
| Knockout close meters at the reduced unit | 242:184; scored meters via `snapshot_meters` trigger (241) |
| `state` cannot change outside the function, for owner and superuser too | `vara_guard_state_change` trigger, transaction-local GUC `vara.state_change_ok` (243) |
| Hold freezes the timer indefinitely and survives threshold changes; a re-routed candidate is never re-scored silently | spec invariant — ✗ no caller yet |
| Routing by threshold: T defaults from the family (`threshold_default`), overridable per JD version; a drag re-routes live and is audit-logged as a policy change | ✗ |
| Closing window: `window_days` (default 3) on the JD version; expiry = close + REJ-02 with feedback themes; Q1 leans business days | ✗ timer actor |
| HM verdict: Interview → INV-01 queued (scheduling v2) · Pass → back to TA with mandatory reason; both are calibration signals | ✗ |

**Built today: the whole lifecycle exists as schema and functions and has no
application code behind it.** `vara_transition` has no caller; nothing inserts a
`vara_application`. The recruiter surfaces (`/agents/vara/map`, `/closing`,
`/handover`, `/calibration`, `/pulse`) are `NotYet` pages with routes and nav
entries (`vara-nav.ts`, `status: 'planned'`).

### 3.4 The embed channel — boot, intents, intake

One script tag, platform-owned: `<script src="…/embed/vani.js" data-token=…>`
(`vani-app/public/embed/vani.js`). Everything real lives on our origin; the
tenant's site contributes a place to stand and its `window.location.origin`.

| Step | Contract | Built |
|---|---|---|
| **Install** | `GET /api/v1/tenant/embed` (workspace) mints the 365-day embed token (`{tid, scope:'vani-embed'}`), returns snippet, subscribed agents, allowlisted origins and per-origin `boot_pings`. `PATCH /api/v1/tenant/domains/:id/origins` edits the allowlist | ✅ `embed.routes.ts:109`, `auth.routes.ts:1176`; console `/install` (`InstallScreen.tsx`: declared vs observed never collapsed) |
| **Boot** | `POST /api/v1/embed/boot {token, parent_origin}` → 401 bad token · 403 `EMBED_ORIGIN_NOT_ALLOWED` · 403 `AGENT_NOT_LIVE`; writes `boot_pings[origin]=now()`; returns tenant name, each live agent's **offers** (Vara: the public half of published JDs — never weights, knockouts or threshold, `vara/offers.ts`) and **visitor intents** as chips, plus a 30-minute session JWT | ✅ `embed.routes.ts:165–250` |
| **Intent, tier 1** | A chip click IS the routing — no model, `actor_type='rule'` | ✅ `app/embed/chat/page.tsx` |
| **Intent, tier 2** | `POST /api/v1/embed/intent {session, query}` → embeddings + HNSW over `vani_agent_intent`; three bands `route ≥0.72` / `disambiguate` / `catch-all <0.45` (env `VANI_INTENT_*`); every resolution writes `vani_intent_match` **before** returning, with the query embedding and a redacted form, never the raw text; 90-day retention | ✅ `vani/intent.ts`; embedding provider is the stub until D6 |
| **Answering** | The agent's own words | ◐ `ANSWERS` placeholder in the chat page — three strings; deleted, not extended, when intake lands |
| **Intake** (E3) | Consent (versioned) → questions generated from the JD's must-haves and knockouts (`vara.candidate.ask_next`) → `vara_chat_turn` + `vara_application` via `vara_transition` → artifact upload → knockouts → snapshot → ACK-01 | ✗ `apply` and `application_status` intents are deliberately **not declared** (258) — declaring one is the promise |

Threat model is stated in the router header: `parent_origin` is self-reported;
what that earns is what boot returns, which the tenant's careers page already
shows the world. The browser-enforced tier (`frame-ancestors` CSP from the
allowlist) is nginx work, not done.

---

## 4. Epics & user stories

Acceptance criteria are the testable contract. **Built today** is read from code.

### E1 · Onboarding — platform lane + Vara activation

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-01 | P5 | **Provision a tenant.** `vani_tenant` row; every later row RLS-scoped; no code path special-cases the home tenant. Domains verified in `vani_tenant_domain` with embed-origin allowlist. | ✅ lazily on the Domain step across the slug bridge; Vikuna seeded (242). ◐ `verified_at` never written |
| V-02 | P1 | **Declare the organisation once.** Industry declared in the Brain; `vani_tenant_pack_binding` is platform state; Vara activates its slice; brand name and domains flow into candidate surfaces. | ◐ industry from `business_profile`; binding written on **take** (`bind-pack.sql`) not at declaration; brand on boot is name only |
| V-03 | P1 | **People, roles and families live at VaNi.** Families in `vani_role_family`; Vara declares `ta`, `hm`, `calibration_approver`; assignment in `vani_user_agent_role`; an HM in Vara can be nothing in Nova. | ◐ role catalogue seeded (242); families written by take/compose. ✗ no `vani_user_agent_role` surface (`vani:team` disabled in `onboarding/lanes.ts`) |
| V-04 | P1 | **Activate comms.** Six templates instantiate into `vani_template` with per-template approval visible; email-only is a legitimate explicit choice. | ✗ table only, no rows, no writer, no adapter |
| V-05 | P1 | **Set my compliance posture.** Consent text + retention mandatory (default 12 months); consent text versions; a stored consent references the version accepted. | ✗ (`vara_consent.consent_version` exists; nothing writes it) — blocked on D9 |
| V-06 | P1 | **Overlay talent behaviour on the org's families.** 1:1 `vara_family_profile`; per-JD overrides never mutate the family default. | ✅ **as the take step**: `take_families` writes binding + family + `vara_scoring_config` v1 (pack shape verbatim) + profile in one transaction; compose never rewrites the family (580bf21, `jd-compose.db.test.ts`) |
| V-07 | P1 | **Pass the gate, go live in our environment.** Checklist enforced in code; embed token issued; wizard resumable. | ◐ four-check gate + token (§3.2); the full gate grows with V-03/04/05 |

### E2 · JD Studio — say it → structured, weighted, ruled, published

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-10 | P2 | **Compose by conversation** where Vara has nothing to hand over; everything Vara sets is visibly editable; weights explained on demand; manual override wins without argument. | ◐ scripted no-match lane (`jd-script.ts`); no LLM turn; explanations ✗ |
| V-11 | P2 | **Author knockouts as rules** — deterministic expressions over intake answers; editing warns about in-flight candidates; applies to new applicants unless re-run. | ◐ knockouts add/remove as `{label, rule}` text; no expression grammar, no in-flight warning |
| V-12 | P2 | **Own the threshold** — defaulted from the family, set per JD; live preview of the split; drag is audit-logged. | ◐ threshold editable on the panel; no live split (no applicants) |
| V-13 | P2 | **Publish everywhere from one schema** — text, infographic, link/QR; apply link tenant-branded and live only post-gate; the embed lists it. | ◐ Markdown posting (`posting-markdown.ts`, `RichText.tsx`); embed lists it on boot. ✗ link/QR/infographic |
| V-14 | P2 | **Version, don't mutate.** Material edits create a JD version; snapshots keep the version that scored them; re-score is explicit and notifies nobody. `POST /vara/jd/:id/version` → v(N+1). | ✗ route does not exist (referenced by `OnboardingRunner.tsx`, Edit affordance hidden). Schema ✅ (`vara_jd_version` append-only, `current_version_id`) |
| **V-15** | P2 | **Title first.** One question — a title. Family is Vara's filing decision. Own families match before the industry's; below the floor is "no match", never the nearest. Family list is the escape hatch ("not that one? here are all 11"). | ✅ `match_title` (floor 45), `my_families`; `TakeFamilies` is the picker |
| **V-16** | P2 | **A finished draft on match.** A matched title yields the whole shape on the panel, no questions; each field carries provenance (`industry playbook` / `your family v3` / `you changed this`). | ◐ shape without questions ✅; per-field provenance ✗ |
| **V-17** | P2 | **Own families read back.** `take_families` copies; `my_families` reads the shape the family is *live on* (`active_config_id`, not highest version); `update_family_shape` appends v(N+1) and moves the pointer; a family built from scratch reads `from_pack: null`. Refuses a shape with no must-haves. | ✅ `domain-pack-skill/functions/{take-families,my-families,update-family-shape}.ts`; `/agents/vara/families` |
| **V-18** | P2 | **Seniority is a modifier** (D10). A level on the JD shifts the family's shape — years on the top must-have and a shifted threshold — without a pack per level. Junior and Principal in one family must produce different contracts, visibly. | ✗ nothing in schema or code knows a level (§6.4 proposal) |
| **V-19** | P2 | **Supersede at take, said aloud** (D11). The tenant's shape supersedes the platform's the moment a family is taken; the UI says "your next \<family\> role starts from this" at take and after every shape edit. | ◐ supersede-at-take ✅ (built, deliberately); the consequence line ✗ |

### E3 · Candidate intake — a conversation, not a form

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-20 | P4 | **Apply by chatting.** Questions come from must-haves and knockouts (one schema); ≤5 min; "profile strength" visible; resumable. | ✗ widget routes but does not converse |
| V-21 | P4 | **Know the rules up front.** Band and knockouts stated in chat; a tripping answer gets an honest explanation and an offer to record a negotiable value. | ✗ |
| V-22 | P4 | **Share what shows me best.** Artifact types from the domain pack; resume-only is first-class; raw stored with provenance before parsing. | ✗ (`vara_artifact` adapter enum ✅) |
| V-23 | P4 | **Control my data.** Versioned consent before processing; "delete my data" in chat triggers purge; status page shows what is held and until when. | ◐ `vara_purge_candidate()` exists (242), no caller; consent capture ✗ — blocked on D9 |
| V-24 | P4 | **Never a black hole.** Ack within minutes; live status page; rejections carry feedback themes and fire only after window/human/rule. | ✗ |

### E4 · Ingestion — the ETL spine, generalised

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-30 | P5 | **One spine, many adapters** — docx, pdf, LinkedIn export, GitHub API, URL, CSV on source → staging → normalise → validate → commit; parsing deterministic. | ✗ no Vara adapters (the GTM ETL spine exists) |
| V-31 | P5 | **Extract with evidence.** One fenced LLM stage; every field carries an evidence span + confidence; low confidence marked, never guessed; malformed → retry. | ✗ lands on the platform `extract` primitive (POA C2) |
| V-32 | P5 | **Recognise returning people.** High-confidence merge with history; ambiguous → TA confirm; merge deletes nothing. | ✗ |
| **V-33** | P2 | **Import existing JDs with evidence.** `POST /vara/jd/import` accepts N files → `vara_artifact` rows → one extraction per artifact `{title, must_haves[{name,weight,evidence_span,confidence}], knockouts[…], band}`; evidence spans must fuzzy-match the source (else `low_confidence`; schema fail → `rejected` whole); review panel shows provenance; `POST /vara/jd/from-extraction` publishes with the compose shape. Fixtures under `backend/src/vara/evals/` run on every prompt change. | ✗ **mock only**: `JdImport.tsx` uses `mockExtractionFor`, publish writes sessionStorage, reachable by `?mode=import` and the banner says so |

### E5 · Screening & scoring — rules first, then ranked evidence

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-40 | P2 | **Rules run first.** Knockouts before scoring; a knockout close records rule + tripping answer; "why was this person closed?" is one click. | ✗ (`close_reason_code = knockout:<rule_id>` ✅ schema) |
| V-41 | P2 | **Score with citations.** Snapshot = composite + three axes (capability/availability/expectations), each component citing evidence; immutable; stamped `config_id`; metering at snapshot time. | ✅ schema + `snapshot_meters` trigger + append-only guard · ✗ scorer |
| V-42 | P2 | **Flag contradictions, don't punish them.** `vara_flag` with both sources verbatim; zero score impact. | ✅ schema · ✗ writer |
| V-43 | P2 | **See the whole field, move the line.** Probability map; drag re-routes live; audit-logged; every dot opens the profile. | ✗ `/agents/vara/map` is `NotYet` |
| V-44 | P2 | **Stay usable at 250.** Dense mode; ranked lists with picks on top; searchable; bulk-actionable. | ✗ |

### E6 · Closing window — nothing closes instantly

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-50 | P2 | **Timer, not trapdoor.** Window per JD (default 3 days); ack immediately; decision message on expiry or explicit close; length change affects new entries only. | ✅ `window_days`, `window_expires_at`, sweep index · ✗ timer actor |
| V-51 | P2 | **Vara's picks.** Below-line candidates worth a second look, each with strongest axis and dragging factor in one line. | ✗ |
| V-52 | P2 | **Three moves, all mine** — Rescue, Hold, Close-now, singly or bulk; holds survive threshold changes; every move a calibration signal. | ✅ edges + `vara_calibration_signal` enum · ✗ surfaces (`/closing` is `NotYet`) |
| V-53 | P2 | **Expiry closes honestly.** Reason = below threshold T under config vN, verbatim; candidate lands in the pool with future-fit tags unless consent declined. | ✗ |

### E7 · Handover, profile & HM review

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-60 | P2 | **Hand over a prepared decision.** Ranked, evidence-first HM queue; advancing reversible until the verdict lands. | ✗ (`handover ↔ advanced` edges ✅) |
| V-61 | P2/P3 | **The whole person, one page** — Overview, Resume (original beside parsed timeline, gaps annotated), Signals, Conversation, History; every fact traces to an artifact or a turn. | ✗ (`vara_candidate_history` view ✅) |
| V-62 | P3 | **Verdict in minutes.** Card queue: Interview or Pass with mandatory reason; both are calibration signals. | ✗ `/handover` is `NotYet` |

### E8 · Communications — templated, approved, honest

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-70 | P1 | **Templates as managed assets.** ACK-01, INV-01, REJ-01, REJ-02, POOL-01, POOL-02 as fixed templates + variables; WhatsApp through Meta approval; every send logged on the application. | ✗ `vani_template`/`vani_comms_log` tables only |
| V-71 | P4 | **Decisions come from humans (or rules), never scores.** Positive-path messages only on HM verdict; STOP honoured per channel; opt-out never blocks the status page. | ✗ — and **no suppression model exists** (D9) |

### E9 · Calibration — self-calibrating with a human gate

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-80 | P1 | **Loop health I can trust.** Per-family rescue rate, conversion by band, audit-sample results; rescue >10% trips the breaker ("my scoring is broken here"); ~5% random audit sample below the line. | ✗ `/calibration` is `NotYet` |
| V-81 | P1 | **Proposals, not drift.** Monthly batch per family; approval creates config v(N+1) with changelog; declines logged; thresholds never rise silently; new config applies to new JDs. | ✅ `vara_calibration_proposal` → `vara_scoring_config.created_from` · ✗ proposer |

### E10 · Talent pool & history — where Vara stops being an ATS

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-90 | P2 | **People persist, applications don't.** One durable person across JDs and years; History tab navigates candidate ↔ applications ↔ snapshots ↔ comms ↔ decisions; pool strictly tenant-scoped. | ✅ schema + view · ✗ surface |
| V-91 | P2 | **Silver medalists resurface.** On publish, Vara searches the pool first and says who would score differently now; re-engagement uses POOL-02. | ✗ (`vara_candidate.profile_embedding` + HNSW ✅ in 246) |
| V-92 | P1 | **Retention with a spine.** Re-consent at retention − 30 days; silence ⇒ purge; redacted audit survives. | ◐ purge function ✅; scheduler ✗ |
| V-93 | P1 | **See the meter.** Candidates processed by JD and month, reconciling 1:1 with snapshots and knockout closes; P5 sees fleet-wide. | ✗ metering rows written by trigger; no reader |

### E11 · Mobile & tenant-environment surfaces

| Story | Persona | Story · acceptance | Built today |
|---|---|---|---|
| V-95 | P4 | **Apply from a phone, on the tenant's site.** 360 px first; served via embed token on allowlisted origins; tenant branding end to end. | ◐ widget is 360-first and origin-bound; branding = name only; no apply |
| V-96 | P2 | **Work the window from anywhere.** Nudges deep-link into the closing list; one-tap Rescue/Hold/Close-now with undo; map becomes a ranked strip. | ✗ |
| V-97 | P3 | **Verdicts on the commute.** Card stack with mandatory pass-reason at 360 px; JD Studio and Calibration stay desktop-primary. | ✗ |

**Pulse** (`/agents/vara/pulse`, overnight briefing) came from the UX prototype,
not the spec. It stays `planned` and lands last (Track F order).

---

## 5. Architecture

### 5.1 Routes

| Route | Audience | What | File |
|---|---|---|---|
| `GET /api/v1/vara/status` | workspace | subscription state + checklist | `backend/src/vara/vara.routes.ts:190` |
| `POST /api/v1/vara/activate` | owner/admin | §3.2 | `:222` |
| `GET /api/v1/vara/onboarding/context` | workspace | industry (raw + slug), families with starter shapes, brand fields, own published JDs — one call for the doorway | `:321` |
| `POST /api/v1/vara/jd/compose` | workspace, `Idempotency-Key` | §3.1 station 4 | `:451` |
| `GET/PATCH/DELETE /api/v1/vara/prompts[/:key]` | workspace | Prompt Studio: system prompts + tenant overrides in `vani_prompt` | `:788–991` |
| `POST /api/v1/vara/jd/:id/version` | workspace | **intended, not built** (V-14) | — |
| `POST /api/v1/vara/jd/import`, `/jd/from-extraction`, `GET /jd/extractions/pending` | workspace | **intended, not built** (V-33) | — |
| `GET /api/v1/tenant/embed` | workspace | platform embed router | `backend/src/vani/embed.routes.ts:109` |
| `PATCH /api/v1/tenant/domains/:id/origins` | workspace | allowlist edit (keeps main's normaliser `onboarding/embed-origin.ts`) | `backend/src/auth/auth.routes.ts:1176` |
| `POST /api/v1/embed/boot` · `POST /api/v1/embed/intent` | public, tenant site | §3.4 | `embed.routes.ts:165, 278` |

Mounted in `backend/src/server.ts:87–92`. `vara.routes.ts` runs every query
through `withTenantClient` (converted 2026-09-16) so RLS applies as a second lock.

### 5.2 Skill functions — `domain-pack-skill` (`backend/src/skills/domain-pack-skill/`)

| Function | Role | Reads / writes |
|---|---|---|
| `catalogue` | every family Vara knows for the tenant's industry, with the FULL starter shape and `mine` | `vani_domain_pack` via `visiblePacksOfDomain`, `vara_family_profile` |
| `take_families(codes[])` | copy chosen families into the tenant's space — binding, family, scoring config v1, profile — one transaction; idempotent on `(tenant_id, name)`; refuses the whole batch on an unknown/retired code | `queries/{bind-pack,take-family,seed-scoring-config,seed-family-profile}.sql` |
| `update_family_shape` | append `vara_scoring_config` v(N+1), move `active_config_id`; pack untouched; refuses no-must-have shapes | `queries/next-scoring-config.sql` |
| `my_families` | the live shape per family (`active_config_id`), `from_pack`, `edited` | `vara_family_profile ⋈ vara_scoring_config` |
| `match_title(title)` | deterministic title → family (own first, then industry); `matched:false` below floor | `title-match.ts` |
| `research_status` | `no_industry / ready / seeded_only / running / in_review / failed / none`, `unreviewed` count | `gt_agent_runs`, packs |
| `request_research` | queue `DOMAIN_ENRICHMENT_REQUESTED` for the caller's own industry; never accepts an industry or `force` | `gt_events` |

Console reaches these through the generic runner (`POST /api/v1/skills/domain-pack-skill/:fn`);
`vani-app/src/skills/vara-onboarding/screens/{TakeFamilies,JdStudio}.tsx` and
`app/(vara)/agents/vara/families/page.tsx` are the callers.

### 5.3 Agents & events

| Event | Emitted by | Handler | What it does |
|---|---|---|---|
| `DOMAIN_ENRICHMENT_REQUESTED` | `onboarding.routes.ts:429` when `business_profile` completes; `request_research`; `npm run packs -- --research` | `worker.ts:223` → `domain-pack.agent.ts` | claim (`pack-exists` / `in-progress` ⇒ no-op, no model call) → **stage 1** `vara.domain_pack.families` names families + titles → **stage 2** `vara.domain_pack.starter` once per family for its shape, checkpointed after each → `assertNoTemplateLeak` → **publishes** as the next version of each family's pack, `review_state: 'unreviewed'`, `requested_by` as provenance (vn tenant id) |

Two stages because one call could not fit the answer (run 87 truncated at 10,302
chars; migration 251 header). The agent reads **public market knowledge only** —
never a tenant's JDs, contacts or profile (rule 13 one table over). Operator CLI
`npm run packs -- --read | --promote | --retire <code> "reason" | --research <tenantId> [--force] | --drafts`
(`publish.ts`). Review states and the reader trap: §6.3.

Intended, not yet emitted: `JD_PUBLISHED` (pool search for silver medalists,
V-91), `APPLICATION_RECEIVED` → knockouts → scoring, `WINDOW_EXPIRED` (timer
actor), `CALIBRATION_BATCH` (monthly). Each is a bus event with a visible run
(POA C6: an event with no handler stays `pending` with a reason).

### 5.4 Console skills & routes (`vani-app`)

| Route | Screen | State |
|---|---|---|
| `/agents/vara` | `VaraLanding.tsx` — reads `/vara/status` over REST | live (mock transport cannot answer it — "Could not load Vara's state" in mock mode) |
| `/agents/vara/onboarding` | `OnboardingRunner.tsx` — doorway; `ResearchCard.tsx` five states with a next action each | live |
| `/agents/vara/families` | `TakeFamilies.tsx` | live |
| `/agents/vara/jd-studio` | `JdStudio.tsx` (+ `JdImport.tsx` mock, `RichText.tsx`, `weights.ts`, `jd-script.ts`) — header comment still says "UX PREVIEW ONLY"; the calls are real | live |
| `/agents/vara/prompts` | Prompt Studio | live |
| `/agents/vara/{map,closing,handover,calibration,pulse}` | `NotYet` | planned |
| `/install` | `InstallScreen.tsx` — snippet, allowlist, per-origin liveness | live |
| `/embed/chat` | `app/embed/chat/page.tsx` — no session ever; chips + text routing | live (routing), answering placeholder |
| `/settings/model` | BYOK (platform) | live |

Navigation catalogue: `vani-app/src/skills/vara-shell/vara-nav.ts` (journey:
domain → families → first JD → second JD; progress from `vara.journey`, today a fixture).

### 5.5 What reads the Brain

| Today | Intended (POA D2/D3) |
|---|---|
| **Industry only** — `SELECT industry FROM vn_tenant_profiles` in `vara.routes.ts:130,336` and `catalogue.ts:25`, slugified by `vani/industry-slug.ts` and string-matched to `vani_domain_pack.domain`. Name/website read for the doorway banner. Two real tenants matched zero packs this way (exec-POA D2). | Every read goes through `brain.context(purpose)` in agent-core, under `charBudgetFor`: industry (as a code from the master list, D12), brand voice for the posting drafter and comms tone, ICP language, people for role grants. **Industry, role family and pack become KG nodes and edges** linked to the tenant's products and buyers; `vani_role_family` stays the org table; the graph carries the relationships. No second copy of org facts in `vara_` or `vani_` (Brain rule). The domain-pack agent still reads no tenant data. |

### 5.6 Prompts

Store: `vani_prompt` (migration 245): `key`, `version`, `scope system|tenant`,
`tenant_id`, `body`, `variables`, one active row per key+scope+tenant, content
immutable (trigger), RLS read/write policies. Resolved by
`backend/src/vani/prompt-store.ts` (`resolvePrompt`, `renderPrompt`); Prompt Studio
edits tenant overrides.

| Key | State | Note |
|---|---|---|
| `vara.domain_pack.research` v1, v2 | retired (250, 251) | single-call research; v1's one run (86) documented in 250's header |
| `vara.domain_pack.families` v1 | active (251) | stage 1 |
| `vara.domain_pack.starter` v2 | active (252) | stage 2; v2 removed the must-have line six of eight families copied verbatim |
| `vara.extractor.field_schema`, `vara.extractor.evidence_check` | intended (V-33) | to be contracts on the platform `extract` primitive with zod schema + fixtures (POA C2/C3) |
| `vara.candidate.ask_next` | intended (V-20) | question generation from must-haves + knockouts |
| answer-cache prompt for "tell me about this JD" | intended | keyed `(jd_version_id, prompt_id, model)` — §6.2 `vara_answer_cache` |

`gt_prompts` (`<skill>.<name>`) is the GTM store; Vara uses `vani_prompt` only.
The two stores are a known duplication for Track C to reconcile.

---

## 6. Data model

All `vara_` tables: `tenant_id → vani_tenant`, RLS policy `tenant_isolation USING
(tenant_id = vani_current_tenant())` (241, 242, 246, 255, 257). The spine 240–246
is **UNFORCED** (owner bypass); migration 248 makes `vani_current_tenant()` bridge
`vn_tenants.id → vani_tenant.id` by slug and is the prerequisite for forcing it
(`docs/db/rls-status.md` §11–13). **Two tenant ids:** the JWT carries the `vn_` id;
every `vani_*`/`vara_*` row stores the `vani_` id.

### 6.1 Platform tables Vara uses (`vani_`, migration 240 + 254, 256, 257)

| Table | Key columns | Vara's relationship |
|---|---|---|
| `vani_tenant` | slug ⭑, name, status, data_region | consumes; `vikuna` seeded (242) |
| `vani_tenant_domain` | domain ⭑, purpose `candidate|workspace`, verified_at, `embed_origins text[]`, **`boot_pings jsonb`** (254: `{origin: last_boot}`) | allowlist checked on every boot; `purpose` is a declaration, not a gate |
| `vani_agent` | code ⭑ (`vara`), name, version | seeded (242) |
| `vani_tenant_agent` | (tenant, agent) ⭑, status `provisioned|activating|live|suspended`, activated_at, gateway_ref | the subscription; written by `/vara/activate` and reconciled on publish |
| `vani_agent_role` | (agent, code) ⭑ — `ta`, `hm`, `calibration_approver` | seeded (242) |
| `vani_user_agent_role` | (tenant, user, agent, role) ⭑, granted_by | **no writer** |
| `vani_role_family` | (tenant, name) ⭑, description, parent_id | org context; written by take and compose; Vara never deletes |
| `vani_domain_pack` | (code, version) ⭑, domain, `payload jsonb` (`family_name`, `hint`, `suggested_titles`, `vara.starter{role_summary_hint, musthaves[{name,weight,why?,years?}], knockouts[{label,rule}], threshold, band_hint}`, `researched{review_state, requested_by, at, prompt_key, prompt_version}`), published_at | platform, no tenant column; append-only by convention (new version per change) |
| `vani_tenant_pack_binding` | (tenant, pack) ⭑, bound_by | written on take (`bind-pack.sql`) |
| `vani_llm_provider` | tenant, provider_code, credentials_enc | platform BYOK, consumed |
| `vani_prompt` (245) | key, version, scope, tenant_id, body, variables, active, approved_by | §5.6 |
| `vani_template` | (tenant, agent, code, channel, version) ⭑, body, variables, provider `msg91`, approval_status | **no rows** |
| `vani_comms_log` AO | template_id, channel, recipient_ref (opaque, no PII), ref_entity+ref_id, provider_msg_id, status | **no writer** |
| `vani_metering_event` AO | agent_id, unit_type `candidate_scored|knockout_close`, ref_table, ref_id, qty | written by `snapshot_meters` trigger and `vara_transition` |
| `vani_audit_log` AO | agent_id (null = platform), actor_type `human|rule|timer|system` (never model), actor_id, entity, entity_id, action, before, after | written by activate, compose, `vara_transition` |
| `vani_agent_intent` (256) | (agent, code) ⭑, label, description, examples[], surface, `embedding vector(768)` + HNSW, sort_order, status `active|retired` | Vara declares `browse_openings`, `role_detail`, `how_applying_works` (258); `apply`, `application_status` deliberately absent |
| `vani_intent_match` (257) | tenant, session_ref, intent_id (SET NULL), runner_up, outcome, `query_embedding`, `query_redacted`, retain_until (90 d) | the router's decision log and catch layer; no candidate id, so outside the purge path |

### 6.2 Agent tables (`vara_`, migrations 241, 242, 246, 255)

| Table | Key columns | Guards |
|---|---|---|
| `vara_family_profile` | family_id ⭑ 1:1 → `vani_role_family`, axis_weights `{skill,avail,exp}`, default_threshold, active_config_id → scoring_config, `axes_embedding vector(768)` (246) | D6: definition is the org's, talent behaviour is Vara's |
| `vara_scoring_config` AO | (tenant, family, version) ⭑, weights, components, threshold_default, created_from → proposal, approved_by | `scoring_config_append_only`; the only output of take, shape edits and calibration |
| `vara_jd` | family_id, title, status `draft|published|closed`, current_version_id, created_by (null today — no `vn_users ↔ vani_user` bridge) | |
| `vara_jd_version` AO | (jd, version) ⭑, facts, must_haves, knockouts, threshold, window_days = 3, reapply_cooldown_days = 90 | `jd_version_append_only`; applications pin the version that scored them |
| `vara_candidate` | display_name, pool_tags[], current_consent_id, retention_until, `profile_embedding vector(768)` (246) | never matched across tenants |
| `vara_candidate_pii` | candidate_id ⭑ 1:1, email, phone, whatsapp, location, links | D4: purge deletes this row; skeleton survives |
| `vara_consent` | candidate_id, consent_version, granted_at, channel, withdrawn_at | delete-protected (`consent_no_delete`); withdrawal is an UPDATE |
| `vara_application` | (candidate, jd, attempt_no) ⭑, jd_version_id, state (9), window_expires_at, held_by/at, advanced_by/at, closed_by_type `human|rule|timer`, closed_by, close_reason_code, decision_reason, closed_at; CHECK closed ⇒ closed_by_type | `trg_vara_guard_state_change` (243); D7: a rejection is these columns + audit + comms, not a table |
| `vara_artifact` AO | candidate_id, application_id?, adapter enum, kind, storage_ref, content_hash | raw before parsed |
| `vara_extraction` | artifact_id, extractor_version, fields (value, evidence span, confidence), status `ok|low_confidence|rejected` | |
| `vara_chat_turn` AO | (application, turn_no) ⭑, speaker `vara|candidate`, content, maps_to_component | D5: evidence cites turn_id |
| `vara_score_snapshot` AO | application_id, config_id, composite, axes (evidence refs), flags_count | `snapshot_meters` AFTER INSERT → metering; `snapshot_append_only` |
| `vara_flag` | application_id, kind, source_a, source_b (verbatim), status | never feeds the composite |
| `vara_calibration_signal` AO | family_id, application_id, signal enum (8), actor_id, payload | `cal_signal_append_only` |
| `vara_calibration_proposal` | family_id, change, evidence, confidence, status, decided_by, resulting_config_id | approval creates config v(N+1) |
| `vara_skill` (246) | (tenant, name) ⭑, canonical_form, `embedding vector(768)` + HNSW, usage_count | per-tenant skill dictionary; **no writer yet** |
| `vara_match_log` AO (246) | matched_from/to (kind, id), similarity, used_by, used_for, details | every semantic match is a row BEFORE it influences an outcome; `recordMatch()` in `vani/match-log.ts` has no caller |
| `vara_answer_cache` (255) | (jd_version_id, prompt_id, model) + question_embedding, question_redacted, answer, hit_count | immutable key ⇒ no invalidation; only impersonal turns cacheable, proven structurally by the assembler; btree + exact cosine, no HNSW; **no reader/writer** |
| `vara_candidate_history` (view) | candidate × applications × latest snapshot | computed, never stored |

Functions: `vara_transition(app, new_state, actor_type, actor?, reason_code?, reason?)`
(242, re-issued 243 with the one-statement GUC window) · `vara_guard_state_change()`
(243) · `vara_emit_metering()` (241) · `vara_purge_candidate()` (242: deletes PII +
artifacts + extractions, blanks chat, redacts audit; SECURITY DEFINER, replica
mode for one transaction) · `vani_forbid_mutation()`, `vani_forbid_delete()`.

Migration 246 requires pgvector and fails loudly without it (local rebuilds stop at 246).

### 6.3 The review-state trap (every reader of `vani_domain_pack`)

`unreviewed → reviewed | retired`, **append-only**: promotion and retirement each
write a NEW version carrying the state. Readers take `DISTINCT ON (code) ORDER BY
version DESC`. Filter `retired` in the WHERE and DISTINCT ON falls back to the
previous version — **the retired pack comes back** while the row count drops by
one. Pick the latest version FIRST, judge the state after.
`review-state.ts` exports `visiblePacksOfDomain()` and `visiblePackOfFamily()`;
`NOT_RETIRED` uses `IS DISTINCT FROM` because 244's seeded packs have no
`researched` block. Never hand-roll the predicate; it was caught by a test.

### 6.4 Proposed additions — PENDING APPROVAL

No table, column, enum or index without Charan's explicit approval (repo-wide
rule). Each row says why the existing model cannot carry it.

| Proposal | Shape | Why the model cannot carry it | Decision |
|---|---|---|---|
| **`vara_jd_position`** | `id, tenant_id, jd_id → vara_jd, location, headcount, filled int, status open|filled|withdrawn, created_at`; `vara_application.position_id` nullable FK | Charan asked for "No of positions, each possibly in a different location" (27-Aug). `vara_jd_version` is immutable and applications pin it — filling a seat would mint v2 and strand in-flight applications. Positions are mutable operational state | D13 — design with F2 (intake), because the application row must say which seat it applied to |
| **Consent / suppression (platform)** | Proposed: `vani_consent_record` (tenant, subject_ref, purpose, version, channel, granted_at, withdrawn_at, source) and `vani_suppression` (tenant, channel, identifier_hash, reason `opt_out|bounce|legal|candidate_delete`, at). Vara's `vara_consent` becomes the candidate-scoped projection or is folded in | Nothing may send without it; GTM outreach and Vara intake are behind the same gate; `vara_consent` is tenant-agent-local and has no suppression half | D9 — design first (Track D), approve, then F2. Cross-reference `documents/design-notes-outreach-and-delivery.md` §5 |
| **Seniority modifier** (D10, default: modifier) | Two options. **(a) In the shape JSON** — `vara_scoring_config.components` gains `levels: {junior|mid|senior|principal: {top_musthave_years, threshold_delta}}`; the JD version stores `facts.level` and the resolved threshold. No DDL. **(b) A column** — `vara_jd_version.level text` + `vara_scoring_config.level_modifiers jsonb`. | Today no field anywhere knows a level; a Junior and a Principal produce a byte-identical contract. **Proposal: (a) first** — the family shape already lives in JSON and the resolved contract is what the immutable version records; a column earns its place only if calibration must query by level, which it will (rescue rate per level) — so (b)'s `level` column on `vara_jd_version` is proposed alongside for indexing, `level_modifiers` stays in `components` | D10 ruled modifier; the storage form needs approval |
| **Graph links for families** (D3 Brain) | No `vara_` change. KG nodes `Industry`, `RoleFamily`, `DomainPack` in `gt_kg_nodes`; edges `tenant —hires_for→ RoleFamily`, `RoleFamily —from_pack→ DomainPack`, `RoleFamily —serves→ Product`, `RoleFamily —reports_to→ BuyerRole`; `vani_role_family.id` carried as the node's external ref | The graph today has no talent nodes; `brain.context('vara.compose')` needs them to bring brand voice and product context into a JD | approve the node/edge kinds; lands with Track D3 |
| **`vani_idempotency`** (platform) | `(tenant_id, key) ⭑, route, result jsonb, expires_at` | compose's advisory lock + 60 s window covers double-click and in-session retry; a hard refresh mid-flight can still mint a duplicate JD | POA §10, Track A1/C |
| **`vn_users ↔ vani_user` bridge** | upsert a `vani_user` row per `vn_users` on first touch | `vara_jd.created_by`, `vani_prompt.approved_by` write null today | standing dependency, not urgent |

---

## 7. Non-functional

Targets from v0.2 §12 stand: 250 concurrent applications per JD (headroom 1,000) ·
5,000-candidate pool with sub-second search, resurfacing < 5 s · ack instant,
knockouts < 10 s, snapshot < 2 min from artifact commit · candidate surfaces 360 px
first · no surface desktop-only-broken on mobile.

The mechanisms are platform rules, specified once. This document points at them
by name and does not restate them (Track A1/A2 deliverables; `ARCH.md` and
`AGENTS.md` are being written at the VaNiGTM root — until they exist the names
below are the POA §3 headings):

| Concern | Rule (ARCH.md) |
|---|---|
| Isolation | *Tenancy + `is_live`*; *RLS posture* (spine unforced, 248 bridge, `withTenantClient`) |
| Writes | *Transactions and prepare→confirm*; *Idempotency store-and-replay* |
| Concurrency | *Race rules* (stale responses, double submit, ordering); *Event claim / heartbeat / reclaim semantics* (253) |
| Configuration | *Env-only configuration* — models, providers, thresholds (`VANI_INTENT_*`), never code |
| Errors | *Error contract `{error:{code,message}}`* and *name the failure class* (compose's SQLSTATE mapping is the reference) |
| Degradation | rule 12: nothing falls back silently; LLM transport failover is platform-only and never BYOK |

| Concern | Rule (AGENTS.md) |
|---|---|
| What Vara declares | registry entry, events, prompts, contracts, journey, activation checklist, visitor intents |
| What Vara consumes | Brain via `brain.context`, prompts via the store, comms, metering, audit |
| Harness | run, steps, checkpoint (`saveCheckpoint`/`loadCheckpoint`), awaiting, cost per run |
| Contracts & evals | prompt + output contract per key; fixtures per contract; `npm run eval` fails on regression |
| Visibility | every slice ends with the run visible in `/runs` (POA B3) |
| Nevers | a model is never an actor; no unattended learning; no tenant data into a platform pack |

Immutability (snapshots, configs, JD versions, consent, artifacts, signals, audit,
comms, metering) is enforced by trigger, not by review (§6). Observability: per-tenant
loop-health (rescue rate, expiry rate, time-to-shortlist) for P1; fleet view for P5 — ✗.

---

## 8. Open decisions

Each carries the POA's default, which applies until Charan overrules it.

| # | Decision | Default / recommendation | Blocks |
|---|---|---|---|
| **D9** | Consent / suppression model, one for GTM outreach and Vara intake | Design first (Track D), approve, then F2. Until then E3 cannot ack a candidate and E8 cannot send | E3, E8, E10, all of Track G that sends |
| **D10** | Seniority: modifier on the family shape vs a pack per level | **Modifier** — years on the top must-have + threshold delta per level; 8 families × 6 levels is 48 packs nobody maintains. Storage form in §6.4 needs approval | V-18 |
| **D11** | Tenant shape supersedes the platform's at **take-time** (built) vs first publish (map) | **Keep take-time; say it in the UI** — "your next \<family\> role starts from this" at take and after each shape edit | V-19 |
| **D12** | Lane-aware onboarding status; industry as a master list (Aug-27 D1/D2) | Lane-aware: yes. Industry: draft 254 in `documents/drafts/` becomes real (code + aliases; packs key off codes). Two real tenants matched zero packs on free text | catalogue, match, research for any tenant not typing "Technology & SaaS" |
| **D13** | `vara_jd_position` | Design with F2 (§6.4) | V-20 (which seat), V-93 |
| **D6** | Embedding provider — Haiku has none; Ollama `nomic-embed-text` is off the path | Env-configured OpenAI-compatible `/v1/embeddings`; provider named in `.env`; the same provider serves `vara_skill`, intent routing (thresholds re-tuned against it — the stub's 0.72/0.45 mean nothing), answer cache, silver-medalist lookback | V-33, V-91, tier-2 routing quality |
| **Comms** | MSG91 port from ContractNest vs email-only first | **Email-only first**; `vani_template` gets its six rows with the first send; WhatsApp joins when the adapter is ported; `provider` stays a column so the choice is per template | V-04, V-24, V-70 |
| Q1 | Window expiry on weekends/holidays | business days, tenant-configurable calendar | V-50 |
| Q2 | Metering price points and the reduced knockout rate | commercial call, outside this spec | V-93 |
| Q3 | Cross-tenant anonymised benchmarks | not in v1; revisit at ≥5 tenants | — |
| Q4 | Candidate chat inside WhatsApp | strong v2 candidate for India volume hiring | — |

Also outstanding, not decisions: the `vara.journey` fixture and the landing's
REST read in mock mode (two misleading reads, HANDOVER §2.2); `verified_at` on
domains is never written; the Phase 4 gate (paste the snippet on a real page,
watch a boot land) has not been run.

---

## 9. Superseded documents

| Document | Status | What survives here |
|---|---|---|
| `vikunawebsite/docs/vani/vara-specification.html` v0.2 (16-Aug) | **superseded by this file** | personas, D1/D2 flows, E1–E11 with V-01…V-97, templates, out-of-scope, Q1–Q4, schema intent |
| `vikunawebsite/docs/vani/vara-data-model-v1.0.html` | superseded as narrative; **the DDL is live** as migrations 240–243 | ER map (§6); the "enforce in code review" policy ② is now a trigger (243); policy ① (audit holds ids, never PII) remains a code rule |
| `vikunawebsite/docs/vani/vara-execution-poa.md` (27-Aug) | **superseded** by `documents/POA-2026-09-30-platform.md` Track F; out of date on migration numbers and on what reached main | Phase 2 import design (V-33), Phase 5 shape, `vara_jd_position` argument, platform-channel routing bands, answer-cache invariants, "what NOT to build" |
| `vikunawebsite/docs/vani/vara-onboarding-design.md` (17-Aug) | folded in | proposal-loop shape; tiered resolver (tier 1 = `match_title` + take, built; tier 2 industry proximity = `axes_embedding`, ✗; tier 3 LLM synthesis = the domain-pack agent, built and publishing unreviewed — the "not auto-promoted" rule became `unreviewed` + operator promote); registry = `vani_domain_pack`, no new schema (held); playbook agent as a P5 UI (✗, CLI only) |
| `vikunawebsite/docs/vani/vara-channels-and-activation.md` (17-Aug) | folded in; §3.2, §3.4 | activation semantics (checklist grows, never shrinks); embed threat model; nginx `frame-ancestors` still not done; the Google-Fonts parser-block lesson |
| `vikunawebsite/docs/vani/vara-readiness-review.md` (17-Aug) | folded in | **resolved:** the `vani_` spine is applied (240); the state invariant is structural (243); 9/9 guarantees re-verified. **Still open:** MSG91 port; BYOK encryption — **resolved** (`secret.crypto.ts`, 2026-09-15); domain pack content — resolved by research (11 families for technology-saas), hospital/nursing pack as the domain-independence test — ✗; ingestion adapters — ✗ |
| `documents/vara-journey-map.html` (17-Sep) | folded in; §3.1 | the five stations, the no-match lane, the three-layer diagram; its "today" column is stale (five of seven breaks fixed) |
| `HANDOVER.md` §2 (29-Sep) | the built-today evidence for this file | 2.0 merge (done), 2.1 stations, 2.2 epics, 2.3 phases, 2.4 decisions (→ §8), 2.5 order (→ Track F) |
