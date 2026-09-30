# HANDOVER — Vikuna GTM

> **This doc is the sole continuity between sessions.** The next session starts
> with zero memory — read this first, then `CLAUDE.md`.
> **Current state (2026-09-29):** see the RESTART HANDOVER section directly
> below — order of work is Edge UX → Vara → GTM. Older sections are history.

---

# ▶ RESTART HANDOVER — 2026-09-29, evening (read this first)

**2026-09-30: the plan is `documents/POA-2026-09-30-platform.md`** — seven
tracks (foundations · unblock · harness · brain · funnel · Vara · GTM), a
decisions register with defaults, the schema list, and a four-week sequence.
It supersedes the May POA and the Aug 27 Vara POA. Its Track H is
`documents/POA-2026-09-30-repo-consolidation.md`: vani-app moves into this
repo, `frontend/` is deleted, vikunawebsite goes back to being the website.
Read both before §1–§3 below; those remain the evidence they were built on.

**Edge is built. The Vara diff is done — §2 below is the open list**
(written 2026-09-29, late). It opens with a blocker: nine Vara backend
commits on `claude/session-setup-qrxev9` never reached `main`, and the
console on Vercel calls their routes.

## 0. What the Edge session delivered (2026-09-29)

All in `vikunawebsite/vani-app/src/skills/edge/`, MERGED to vikunawebsite
`main` (cb7fb9d) and therefore live on Vercel. Working branch of both repos
is `claude/sweet-meitner-t4qvxr`.

- **The whole mission, chapters 1–12, and the failure mission's chapters
  3–12**, ported from `docs/EDGE/vani-edge/` (the newer prototype, 27 tests —
  NOT `vani-edge-source/`, which §1 below still names; the newer tree is the
  reference). Own shell + "← Back to VaNi", URL per chapter
  (`/agents/edge/<slug>`), menu entry `Edge · Automation` beside Vara and GTM,
  dashboard journey card, entry from Smart Profile.
- **Chapters 8–10 are COMPUTED, not fixtures**: `engine/` (pure TS, rulebook
  0.1.0) reproduces the reference results 108/108 from the four sample CSV
  registers (AP / PO / GRN / vendor), and runs on a tenant's own uploads
  through the mapping dialog. `scripts/test-edge-engine.mjs` is the check.
- Chapter 11 value calculator, the Automation Strategy HTML report (declared
  map, engine network, pathway table, six findings, readiness rows), print,
  dispatch card; failure verification + Failure Review report + action
  register export.
- Mission state is a single object in localStorage (`vani-edge-mission-v2`).
  **No schema was created** — server persistence is a decision for Charan.

**Theme rulings from the same day, product-wide:** Jade Thorn is re-pinned to
the Edge palette and is the default theme, light; Edge's fonts (Inter,
fetched) for the product; ONE type scale (`--fs-*`) and ONE label style
(`--font-label`/`--fw-label`/`--ls-label`) in `globals.css` — no local
resets, no `var(--font-*, fallback)`. The public landing at `/` keeps the
ORIGINAL VaNi theme (orange on ink), pinned by attribute in
`app/(site)/layout.tsx`. Login/signup are on the product theme; not decided.

**Edge, not done (unscoped, none started):** slice 6 chrome re-check +
`INTEGRATION.md` for the `edge.journey` preview read; xlsx parsing (CSV
only today, and the data comes as xls); O2C engine (P2P only); chapter-6
rule answers feeding the rulebook thresholds; dispatch (preview only, and
gated on the consent model); one cosmetic overlap of two edge labels in the
network drawing.

**Seen, not mine, not fixed:** the Vara landing in mock mode shows "Could not
load Vara's state" — `VaraLanding.tsx` fetches `API.vara.state` over REST,
which only the live API answers. Same on `main`. Relevant to the Vara session.

Charan's original order of work, from the morning of the same day:

```
1. EDGE   build the UX layer for VaNi Edge — the reference is checked in at docs/EDGE/
2. VARA   complete Vara once the Edge UX is done
3. GTM    resume GTM once Vara is done
```

Everything below is pushed. Both repos' working branch is
`claude/bold-carson-7stecq`. VaNiGTM `main` is fast-forwarded to it and is
DEPLOYED on the Main VPS (2026-09-29, from `/opt/vikuna/src/vanigtm` with
`deploy/vani-main-vps/deploy-vani.sh`). vikunawebsite `main` is NOT merged:
its branch is 74 commits ahead and Vercel deploys from `main`, so the console
changes of this fortnight (import wizard, imports dashboard, common pool,
Smart Profile row copy, failover queue) are not live until that merge — it is
Charan's call, and the nginx location for `/api/v1/etl/` plus the CORS snippet
edits (DELETE method, `Idempotency-Key` header) must land with it; see the
deploy section of the 2026-09-29 chat, or `vani-app/src/skills/gtm-imports/INTEGRATION.md`.

## 1. EDGE — what it is and where to start

`docs/EDGE/VaNi-Edge-Product-Specification.md` (v1.2, 29-Sep-2026) is the
product spec: a paid, guided automation-readiness and strategy assessment,
"Before you automate, know where you stand", ₹5,000 hypothesis, P2P first
then O2C, an adaptive 12-chapter mission (context → people → scope → pain →
process board → rules → evidence → process explorer → findings → readiness →
value → implementation brief), a Failure Review mode folded into the same
journey (rev 1.2), and a release plan A–D. **Section 20 lists nine decisions
still required before implementation commitment** — read them before building
anything that assumes an answer (price, packs order, providers, delivery
destinations).

`docs/EDGE/vani-edge-source/` is the UX REFERENCE: a dependency-free
prototype (plain JS modules, `npm start` → :4173, `npm test`). Its README
states what is connected (local CSV inspection, editable calculations, brief
download, Calendly) and what is deliberately NOT (no LLM, no ICP lookup, no
extraction, no accounts, no payment, no dispatch). The three PNGs are the
look: sidebar of 12 numbered chapters, a headline per chapter, the process
explorer as a branching graph with a pathways rail and a coverage strip
(proposed / with conditions / human / unresolved), "Ask Edge" as a floating
chat, "Mission memory" and "Contributions" in the sidebar, "Agent allowance"
and "Save & pause" in the header. (The source zip was removed on 2026-09-29;
the extracted tree is the reference.)

**First question for the new session, before any code:** where the Edge UX
lives. Two credible answers: (a) a skill folder in `vani-app` under its own
route group and shell (`edge-shell`, like `vara-shell` / `gtm-shell`), Edge
chrome over the console's platform layer — one folder + one line in
`src/skills/index.ts` per the registry boundary, `<DataBoundary>`,
`useSkillMutation`, mock transport first; or (b) a standalone app because
the brand is "VaNi Edge by AutomationEdge" and the buyer is not a console
tenant. The spec's domain model (§14: mission, scope version, evidence asset,
route decision, report version, dispatch job, entitlement…) is entirely new
schema and needs Charan's approval table by table; the UX layer can and
should be built on fixtures first (the prototype's `data/` files are the
fixtures), which is how GTM Sprint 2 was done (`vani-app/CLAUDE.md` §2b).

Non-negotiables that carry over unchanged: rule 12 (no silent fallbacks —
the spec says the same in its own words: "customer outputs never silently
fall back to sample data"), every screen owes five states, no schema without
approval, findings go in the repo.

## 2. VARA — the open list (diffed 2026-09-29, evening)

Diffed: `documents/vara-journey-map.html` (17-Sep) and
`vikunawebsite/docs/vani/vara-specification.html` (v0.2, E1–E11) and
`vara-execution-poa.md` (27-Aug) against what is on `main` of both repos.
Everything below was checked in code, not read off a doc. Where a doc and
`main` disagree, `main` is stated.

### 2.0 BLOCKER — nine Vara commits never reached `main`, and the console runs on them

VaNiGTM `claude/session-setup-qrxev9` (26–29 Aug, 9 commits, +1,463 lines,
merge-base 9923782) holds the Phase 4 backend and the whole Platform Channel
slice, and **was never merged**. The console merged the vikunawebsite half of
that session twice, `main` is on Vercel, and VaNiGTM `main` is on the VPS —
so the live console calls four paths the live API does not have:

| Console screen (on Vercel) | Calls | On VaNiGTM `main`? |
|---|---|---|
| `/install` (InstallScreen) | `GET /api/v1/tenant/embed` | no |
| `/install` | `PATCH /api/v1/tenant/domains/:id/origins` | no |
| `/embed/chat` widget | `POST /api/v1/embed/boot` | no — `main` has `/vara/embed/boot` with a different shape |
| `/embed/chat` widget | `POST /api/v1/embed/intent` | no |

What the branch carries, per commit: 3ac0c49 embed allowlist as an app
surface + migration 247 `boot_pings` · db2271f readiness names industry as the
blocker · 916f58c declared vs candidate-facing domain split · cd3a0b0
`purpose` is no longer a gate (Charan's ruling, 26-Aug; `main` still gates on
`purpose='candidate'` at vara.routes.ts ~279/330) · da6f8e3 boot returns the
public half of the JD · 4d2b984 activate reconciles (a published JD flips
`activating`→`live`; `activated_at` stamped) · 92132d2 the embed channel becomes
the platform's (`vani/embed.routes.ts`, `/tenant/embed`, `/embed/boot`,
`/embed/intent`, `vara/offers.ts`) · 639b011 migration 248 `vara_answer_cache`
· 38aa44c intent routing (`vani/intent.ts`, `intent-embed.ts`, migrations
249 `vani_agent_intent`, 250 `vani_intent_match`, 251 seed intents).

Merging it is a real task, not a button:
- **Migration numbers collide.** The branch's 247–251 are five DIFFERENT
  files from `main`'s 247–252. Renumber them **254–258** (rule: never reuse a
  number). All five are new tables/columns — Charan approved them on 27-Aug
  per the POA, but re-confirm before applying: they were approved against an
  earlier schema state.
- `git merge-tree` conflicts in three files: `backend/package.json`,
  `backend/src/server.ts`, `backend/src/vara/vara.routes.ts`. The routes
  file was rewritten on both sides (branch: −143 lines; `main`: September's
  embed_origins / activation-readiness tests / jd-compose fix).
- **The same capability was built twice.** Branch 3ac0c49 writes origins via
  `PATCH /tenant/domains/:id/origins` in `auth.routes.ts`; `main` 7eaf4a2
  (17-Sep) writes them via `onboarding/embed-origin.ts` + `PATCH
  /onboarding/step`. Keep `main`'s normaliser (it has tests); keep the
  branch's route because the Install screen calls it.
- The branch's `/vara/activate` calls the readiness checklist; `main`'s does
  not, although `activation-readiness.test.ts` says it does.
- Snippet path: `main` emits `<script src=".../embed/vara.js">`; the console
  ships `public/embed/vani.js`. The branch's platform router is what fixed
  the name. Verify after merge.

Until this merge lands, **Phase 4's gate cannot be run** (there is nothing on
the API for the snippet to boot against) and the widget on every tenant page
is dead on arrival. This is item 1.

### 2.1 The journey map, station by station (tenant side, JD authoring)

The map's seven breaks were drawn 17-Sep; five were fixed 17–18 Sep and it
does not say so. State on `main`:

| # | Station / break | Today |
|---|---|---|
| 1 | Name the role — title first, family is Vara's filing decision | **Done.** `match_title` is deterministic, no LLM (`title-match.ts`, floor 45). JD Studio asks title first; the doorway (`TakeFamilies`) is the family picker. |
| 2 | Vara hands over a finished draft (the matched pack, whole) | **Done** (c3f8fd3 + JdStudio 271–284): a matched title gets the shape on the panel, no questions; only `unknownRole` asks. |
| 3 | Accept or adapt — must-haves and weights editable | **Done** (`weights.ts`, split-of-100 conserved; add/drop/±5; knockouts add/remove). Provenance per field ("industry playbook → you changed this") is **not shown** — the panel shows `from_pack` at family level only. |
| 4 | Publish — one transaction, advisory lock, replay | **Holds** (`jd-compose.db.test.ts` over HTTP; 580bf21 append-only fix). |
| 5 | Second JD opens from the tenant's own shape | **Done** (651ec3c `take_families`/`my_families`; c3f8fd3 own families match before the catalogue; 127fa83 `update_family_shape`). |
| — | Break 6: research waits on a Vikuna operator | **Done** (521e2af, packs publish `unreviewed`). |
| — | Break 7: `gt_events` stale-row reclaim | **Done** (4f6301f, migration 253, applied on prod 29-Sep). |
| — | Break 5 / decision 2: **seniority is invisible** — Junior and Principal produce a byte-identical contract | **OPEN.** Nothing in schema or code knows a level. Charan has not ruled (modifier vs pack-per-level; map recommends a modifier: years on the top must-have + shifted threshold). No code until ruled. |
| — | Decision 3: when does the tenant's shape supersede the platform's | **Built as "on take"**, not "on first publish": `take_families` copies the pack at that moment; publish never rewrites the family (580bf21, deliberately). The map's "said out loud" consequence line is not in the UI. Confirm with Charan that take-time is the intended moment. |

Also on the JD side, from the POA's "settled, not built": JD versioning
(`POST /vara/jd/:id/version`, edit → v2 — referenced at vara.routes.ts:519,
does not exist); the description drafter in brand voice (textarea only);
**JD import is mock-only** (`JdImport.tsx` uses `mockExtractionFor`, publish
writes sessionStorage, reachable by URL `?mode=import` only — the banner
says so).

### 2.2 The spec's eleven epics against `main`

Schema first: migrations 240–246 model the WHOLE lifecycle — `vara_candidate`,
`vara_candidate_pii`, `vara_consent`, `vara_application` (9 states, edges
enforced by `vara_transition` + guard trigger 243), `vara_artifact`,
`vara_extraction`, `vara_chat_turn`, `vara_score_snapshot` (metering trigger),
`vara_flag`, `vara_calibration_signal/_proposal`, `vani_comms_log`,
`vani_template`, `vara_skill`, `vara_match_log`. **No application code reads
or writes any of them.** `recordMatch()` has no caller; `vara_transition` has
no caller. Gaps in the schema itself: no interviews/scheduling table (v2 by
spec), no offers (out of scope v1), no `vara_jd_position` (Charan asked for
positions-per-location on 27-Aug; designed to land with Phase 5, unapproved).

| Epic | State |
|---|---|
| E1 Onboarding & activation (V-01…07) | Partial. Domain + origins (`vani:domain`, enabled) · families taken · activate · readiness checklist reduced to 4 (industry, domain, origin, published JD). **Not built:** V-03 people/roles at VaNi (`vani:team` disabled, no `vani_user_agent_role` surface), V-04 MSG91 comms, V-05 consent/retention posture, V-06 talent overlay is now the take step, V-07 full gate. **No `vara:` lane exists** in either repo (`registerLane` never called; console lane commented out). |
| E2 JD Studio (V-10…14) | V-10/11/12 done as above. V-13 publish-everywhere: posting Markdown exists (`posting-markdown.ts`), no link/QR/infographic. V-14 version-don't-mutate: **not built** (see 2.1). |
| E3 Candidate intake (V-20…24) | **Not built.** The widget is Tier-1 chips + Tier-2 intent text on the unmerged branch; "Applying by chat arrives with intake" is hard-coded. No consent capture, no ack, no status page. |
| E4 Ingestion (V-30…32) | **Not built** (Phase 2). No adapters, no `POST /vara/jd/import`, no eval fixtures, `nomic-embed-text` not pulled. |
| E5 Screening & scoring (V-40…44) | **Not built.** `/agents/vara/map` is a `NotYet` page. |
| E6 Closing window (V-50…53) | **Not built.** `/agents/vara/closing` is `NotYet`. No timer actor. |
| E7 Handover & HM review (V-60…62) | **Not built.** `/agents/vara/handover` is `NotYet`. |
| E8 Communications (V-70…71) | **Not built.** `vani_template` has no rows and no writer; MSG91 adapter not ported. |
| E9 Calibration (V-80…81) | **Not built.** `/agents/vara/calibration` is `NotYet`. |
| E10 Talent pool & history (V-90…93) | **Not built.** DPDP purge function exists (242), nothing calls it; no metering reader. |
| E11 Mobile surfaces (V-95…97) | Widget is 360-first by design; the rest depends on E5–E7. |
| Pulse (`/agents/vara/pulse`) | `NotYet`. Not in the spec's epics; came from the UX prototype. |

Two smaller things on `main` worth fixing early because they mislead:
`vara.journey` is a PREVIEW fixture (`gtm-shell/mock.ts`) that always says
`done: [domain, families, jd]`; and the Vara landing in mock mode shows
"Could not load Vara's state" because `VaraLanding.tsx` reads `/vara/status`
over REST, which the mock transport cannot answer.

### 2.3 The POA's phases, restated against `main`

```
Phase 0 UX preview ........................ done
Phase 1 Compose path ...................... done, hardened in Sep (append-only fix, own-families match)
Prompt Store / Semantic Layer ............. done (246 needs pgvector; no writer yet)
Phase 4 Install screen .................... BUILT ON THE UNMERGED BRANCH — see 2.0; gate unrun
Platform Channel slice .................... same branch; migrations need renumbering 254–258
Phase 2 Import + Extractor ................ not started; blocked on LLM path (Haiku is primary now, so
                                             the blocker is `nomic-embed-text` on the embed host, or an
                                             embedding provider decision)
Phase 3 Family derivation ................. SUPERSEDED in part: take/edit/my_families give the tenant
                                             their own shape without N JDs. What remains is the
                                             derived-diff proposal after N publishes — decide whether
                                             it is still wanted.
Phase 5 Candidate lifecycle ............... not started; the largest leg; needs consent model + comms
Phase 6 Playbook agent .................... partly superseded by domain-pack-skill (research,
                                             publish, promote/retire CLI). Operator UI not built.
Calibration loop .......................... not started
```

### 2.4 Decisions pending on Charan (Vara)

1. **Merge `claude/session-setup-qrxev9`** with migrations renumbered 254–258
   (re-approving those five tables), or declare it dead and rebuild the four
   paths the console calls. Recommendation: merge; the code was verified on a
   throwaway Postgres on 29-Aug and the console already speaks its contract.
2. **Seniority**: modifier on the family shape, or a pack per level. (Map
   decision 2.)
3. **Tenant shape supersedes at take-time** (built) vs at first publish (map).
   Confirm.
4. **D1 / D2 from 27-Aug, still unruled:** lane-aware onboarding status
   (industry null on a `completed` `business_profile`), and industry as free
   text vs a master list (two real tenants matched zero packs).
5. **`vara_jd_position`** (positions per location) — schema, designed with
   Phase 5.
6. **Consent/suppression model** — the same gate GTM outreach is behind
   (`design-notes-outreach-and-delivery.md` §5). Candidate intake (E3) cannot
   ack a candidate or send anything until it exists. One decision serves
   both agents.
7. **MSG91 port from ContractNest**, or email-only for the first intake.
8. **Embedding provider** for `vara_skill` / semantic dedup now that Haiku is
   the primary model and Ollama is not on the path.

### 2.5 Proposed order (no code before 1 and 6 are answered)

1. Merge the branch (2.0), renumber, `--status`, deploy, run the Phase 4 gate:
   paste the snippet on a real page, watch a boot land.
2. Fix the two misleading reads (`vara.journey` preview, landing in mock).
3. Phase 5 in slices, each visible: intake chat on the widget (consent first)
   → knockouts + score snapshot → map → closing window → handover.
   Recruiter surfaces already have routes and nav entries; replace `NotYet`
   one at a time.
4. Phase 2 import, once the embedding decision is made.
5. Calibration + pulse last.

Known-good from this fortnight, unchanged: family-shape append-only
(`jd-compose.db.test.ts`), packs publish `unreviewed`, RLS spine 240–246 still
UNFORCED with migration 248 as the prerequisite (`docs/db/rls-status.md`
§11–13) — forcing it is a migration, and it should ride with the merge above.

## 3. GTM — parked, with everything recorded

State on 2026-09-29, all in `CLAUDE.md` under "EVERYTHING enters through
staging" and the paragraphs after it:

- Pool sources decided: own data only (400k held + 200k bought outright);
  Apollo/Clay are tenant-key connectors for people, never the pool.
- Haiku is the enrichment model; Laya rejected on measurement
  (`backend/scripts/laya-trial/`, 31% agreement, confidence uninformative).
- `src/etl/company-matcher.ts` built and measured (61/68, 0 wrong).
- The ICP data structure is PROPOSED, not approved:
  `documents/design-notes-icp-data-structure.md` — people table, link table,
  one generic `gt_cleanup_gap` register as the model's only queue, personas,
  suppression. **Two decisions pending on Charan** (people at platform level;
  consent/suppression next) plus the explicit go on the `cleanup` source.
- Build order once approved: chunked upload + landing as a worker job
  (proven at 50k locally) → migrations → companies Pass 0/1 → people landing
  + matcher + gap register → gap worker → personas → merge engine.
- Datasets still to obtain as CSV exports (not screen copies), with the
  profile URL kept in the people file.
- Migrations: 249_ki and 253 applied on production 2026-09-29; next number
  is 254; two files share 249 by accident, leave them.

## 4. Things that cost a session this fortnight — do not repeat

- PowerShell: `VAR=x cmd` and `a && b` are bash. Set `$env:VAR`, one command
  per line, or run on the VPS over ssh where bash is the shell.
- Three checkouts exist on Charan's laptop: `OpenClaw\VaNiGTM` (backend
  work), `website\vikunawebsite-git` (console, with `vanigtm/` as a
  submodule pinned to an older commit), and the VPS checkout at
  `/opt/vikuna/src/vanigtm`. Say which one every time.
- A migration is applied when `--status` says so, not when its commit is
  deployed (253 sat pending for twelve days). `⚠ modified` on Windows is
  CRLF, not an edit.
- An API key pasted into chat is compromised; it happened twice.

---

# 📌 STANDING PRODUCT DECISIONS

> **Read this section before proposing anything.** These were re-derived from
> scratch in the 2026-07-27 session because the handover recorded only the
> *next task*, not the *rulings*. The user had to repeat decisions they had
> already given. That is the failure this section exists to prevent — when a
> ruling is made, it belongs here immediately.

### Scope of onboarding
- **Onboarding ends at "ideal customer".** Profile → vocabulary → competitors
  → ideal customer, and that is setup complete.
- **Prospect discovery, campaigns and everything downstream live inside the
  product**, not the wizard. Storytelling / Campaigns / Follow-ups are
  destinations that unlock in mission control — they should come OUT of the
  wizard's step rail (not yet done).
- Onboarding must also **capture the industries the tenant sells to**.

### Prospect data
- **No web-search buyer discovery.** *"We are not there yet — we will only
  work on available data for now."* Nothing is sourced by crawling.
- **Two pools, one pipeline:** a tenant's own uploads, and a common pool
  (FTCCI and other directories) **available to tenants based on business
  model** — an entitlement, not a default.
- **BYO upload ships first**; the common pool follows.
- **Seeding happens from UI upload.** Do not pre-seed taxonomies — industry
  values and their aliases come from the uploaded data itself and are curated
  afterwards on real values.
- More data is coming **soon**: further FTCCI chapters across India, other
  federations of commerce, Telangana hospital groups, manufacturing
  associations. Design for many overlapping datasets, not one file.
- Data principles the user has stated more than once: **multiple sources,
  freshness, data quality, deduplication, upsert on re-delivery, and better
  quality wins on conflict.**

### The CRO push
- The common pool is shown as **market evidence** and creates a **CRO push**,
  not a campaign. CRO here = the **conversion moment** aimed at the tenant:
  free credits, expected outcomes (emails → replies → meetings), social proof,
  Stripe card capture under "you won't be charged yet". It is **not** the
  landing-page audit lens the PRD defines at line 86.
- *"Once that's in place, we go for real prospecting."*

### Out of scope right now
- Audit / AEO schema (user ruling).
- Universe **contacts** — the common pool ships **companies only**, which
  defers the DPDP/GDPR question rather than answering it under pressure.

### The three uploads (user ruling, 2026-07-28)
1. Tenant uploads **his contacts**.
2. Tenant uploads **his customers**.
3. Admin uploads **datasets** (the common pool).
4. All three **carry tags** — "ftcci telangana", "tfcci andhrapradesh" —
   and **tags can be created** by the user.
5. Tenant uploads **customer orders / history** — LATER, not now.

**Two orthogonal axes. Do not collapse them.**
- The **tenant declares the RELATIONSHIP** (contacts / customers / dataset).
  No file can state it; it is never inferred.
- The **ETL detects the ENTITY** (people / companies / both). *"contacts
  might be people or companies — we cant seperate right now, let ETL skill
  identify it, user can give his own inputs if required."*
- One file commonly yields BOTH: FTCCI is company-first with 3 reps inline
  (2,913 companies + ~5,800 people); the provider CSV is contact-first
  (119 people / 95 companies). Detection groups COLUMNS, not files.
- Detection is deterministic header matching — **no LLM**. Unresolvable
  columns are shown to the user, never guessed (rule 12).

### Merge conflicts — THE TENANT DECIDES (user ruling, 2026-07-28)
- *"field merge — let user decide … explain to user and he will take call."*
- The quality model (`field_score = validity × tier × freshness`) is
  **demoted from decision to recommendation**. It ranks and explains; a
  human commits. Nothing auto-merges.
- Conflicts are caught **at staging, before anything lands**
  (`ki_import_staging.processing_status = 'conflict'` + `field_diff`).
- **Campaign safety:** *"there might already be a campaign running, and
  changes might impact merge."* A row whose target has a live
  `gt_contact_assignments` (stage not converted/lost) is marked
  `campaign_locked` and **excluded from bulk accept** — changing an email
  or phone mid-sequence misdirects outreach already sent. The diff must
  show what has already gone out, or the decision is a rubber stamp.
- This extends the design note's existing universe-refresh rule ("never as
  a mutation under them") to **upload merges**, which it did not cover.

### The import lifecycle (user ruling, 2026-07-28)
- **Import is ONE action.** Staging then landing is internal plumbing — the
  user confirmed the import once and is not asked to come back and press go.
  *"do you expect it for the users to check again?"*
- **Only genuine clashes come back to them.** A first import into an empty
  table asks nothing at all.
- **Never dress a partial success as a failure.** A red X on a successful
  staging is a lie about what happened. *"it resembled error (toast with X
  mark — that itself is misleading)."*
- 🔒 **THE SAME FILE CANNOT BE IMPORTED TWICE.** *"keep a crypto
  restriction … if user is trying to import same file again, alert him it
  cannot be done."* Matched on **sha256, not filename**, so a refreshed
  delivery still loads. Enforced in the route AND by a unique index
  (migration 202). Retiring the earlier load is the only way to reload the
  same bytes. **This REVERSES commit ce4b7a2** — removing the guard let a
  retry create two staging sessions holding the same 2,913 rows.
- **Build the whole lifecycle, not a slice.** Offering to ship half and
  finish later was rejected outright.

### Working rules
- **Use the existing ETL / import infrastructure. Do not create new.**
- n8n will connect the user's email/Gmail and send from it (Phase B, outreach).
- **Tags sit on the LOAD, not the row** — records inherit via `load_id`.
  Tags are a human filter dimension and **never override derived data**:
  `state_code` comes from PIN and wins over any tag.
- **Every upload is a load** (`gt_source_loads`), contacts included — so
  freshness/provenance are not company-only privileges. The UI asks for
  an **as-of date**; undated = scored less fresh, not current.

---

# 🔴 START HERE — the immediate next task

## Prove the import journey against the live VPS

The whole import lifecycle is BUILT: upload → detect → stage → land →
review → dashboard. It is covered by 59 tests including 8 that run the real
landing against a real PostgreSQL. **It has never run against `vani_gtm_db`
with a real file through the browser.**

Apply migrations **198–202**, restart API + worker, and run the FTCCI file
through `/import` end to end. Watch for:
- companies in `gt_prospects` with `PROS-` refs, people in `gt_contacts`
  with their `gt_contact_channels`
- the dashboard showing company columns with actual values (not `—`)
- a second upload of the same file refused with `ALREADY_IMPORTED`

## Then: what the pool still needs

`gt_universe_company_sources` receives rows and upserts idempotently, but
**golden-record resolution is not built** — `gt_universe_companies` stays
empty. That is the Phase B merge engine (design note §3/§6: block, resolve
within block, field-level merge, late-merge aliases). Until it exists, an
admin dataset import loads source rows and nothing reads them.

## Older note — the `501` is DONE (kept for the rules it lists)

`POST /etl/sessions/:id/process` still returns **501** at
`backend/src/etl/etl.routes.ts`. Everything upstream of it now works.

What it has to do, and the rules it must obey:

1. **Route by entity, not by file.** `mapped_data` on each staging row is
   `{ company: {...} | null, people: [...] }`. Companies →
   `gt_prospects` (tenant, with `relationship`) or
   `gt_universe_company_sources` → resolve → `gt_universe_companies` (pool).
   People → `gt_contacts` **always** (Phase A ships no shared contact pool).
2. **Detect conflicts before landing.** Block on `dedup_key` (already
   written at staging). In-file collisions AND collisions with existing
   records become `processing_status = 'conflict'` with a `field_diff` —
   they do NOT land.
3. **Mark `campaign_locked`** by checking `gt_contact_assignments` for a
   live assignment on the target (stage not `converted`/`lost`). Those rows
   never bulk-accept.
4. **Copy the load's `as_of` onto the row** (`source_as_of`) — freshness is
   scored, and the columns now exist on both `gt_prospects` and
   `gt_contacts`.
5. Channels: a person's email/mobile become `gt_contact_channels` rows.

Then the **merge review UI** — the surface where the tenant takes the call.
Nothing auto-merges.

**Postgres 16 is installed in this container** and migrations 198–200 were
verified on it (see "How to verify without the VPS"). Use it.

## ⚠️ The real source files are NOT in this container

`FTCCI_member_data_26.10.2023.xlsx` and `Company_prospect_2.csv` are gone —
`backend/uploads/` holds only old MFD files. The maps and processors encode
what was learned from them, and `company-processor.test.ts` pins those
findings, but **loading the real 2,913 rows end to end needs the user to
upload the files again.**

One consequence: **FTCCI's representative column names were never seen by
this session.** `CONTACT_FIELD_MAP` covers Apollo-style and generic headers;
FTCCI rep columns will land in `unresolved_columns` and need either the real
headers or a human mapping. That is by design (rule 12) but it means the
~5,800 people are NOT yet reachable without the file.

---

# ⚠️ PENDING USER ACTIONS

- 🔴 **APPLY MIGRATIONS 198, 199, 200, 201, 202** (`cd backend && npm run db:migrate`).
  202 enforces the checksum restriction — the same file cannot be imported
  twice.
  **201 is required for the import to run at all** — 104 CHECKs `import_type`
  against the MFD list with no `'company'`. It also repairs a narrowing 200
  introduced in the staging status CHECK, so apply it even if 200 is done.
  All three verified on a real PostgreSQL 16 — apply, re-apply, constraints
  reject bad values. **198 repairs a live defect** (see below) and the code
  now shipped depends on all three.
- **Migrations 193–197 are APPLIED** (confirmed by the user 2026-07-28).
  191 + 192 were confirmed applied earlier.
- ⚠️ **`ANTHROPIC_API_KEY` in `backend/.env`** — enables the Claude failover.
  Still not confirmed.
- ⚠️ **VPS LLM is too slow.** `LLM_PRIMARY_TIMEOUT_MS` has been 280000 the
  whole time and calls to `https://llm.dristiq.com` still time out. That host
  is **blocked from this container** (proxy returns 403 CONNECT), so it cannot
  be diagnosed from here — run `curl -s https://llm.dristiq.com/api/ps`
  locally, or allowlist the host.
- ⚠️ **DB MCP connector.** `.mcp.json` pointed at `mcp-gtm.dristiq.com`, which
  answers nothing. Fixed to **`mcp-db.dristiq.com`**, which answers 401
  (reachable, wants auth). Still needs: `GTM_MCP_BASIC` set in the Claude
  environment, the host allowlisted, and **confirmation it serves
  `vani_gtm_db`** and not another product's database.
- **No end-to-end journey has EVER been verified through the UI.**

---

# 🧪 WHAT IS VERIFIED vs WHAT IS NOT

Be honest about this in every future session — it was the biggest risk on
2026-07-27, when four changes landed on journey #1 with none of them run.

**Verified against a real Postgres** (scratch cluster, this container) —
2026-07-28 session:
- Migrations **198, 199, 200** apply and re-apply cleanly.
- `normalized_name` before the repair: `'John Smith' → 'J S'`,
  `'priya sharma' → ''`. After: correct. `person_key` composes name+employer.
- CHECK constraints reject `relationship='partner'`, `'leads'`, and
  `processing_status='nonsense'`; accept `'conflict'` and `'customer'`.
- Tag slug namespaces isolate (platform vs tenant), and a tenant **cannot
  attach another tenant's private tag** to a load.

**Verified by tests** (`cd backend && npm test` — 46 tests, the first in the
repo; jest roots now include `src/etl`):
- Both normalisation defects pinned, the junk patterns, PIN→state, dedup keys,
  entity detection on both real file shapes, and the user-override path.

**Verified against a real Postgres** (scratch cluster, earlier session):
- Migrations 193–197 apply and **re-apply** cleanly (guards hold).
- RLS on for `gt_prospects` and `gt_tenant_target_industries`, off for the
  cross-tenant pool — checked against `pg_tables` / `pg_policies`.
- `destination` CHECK rejects unknown values.
- Generated `name_key` emits `[AUTOMOTIVE MANUFACTURERS]`, `[QUILL LEDGER]`.

**Verified against the real source files:**
- `company-processor` on FTCCI and provider rows: domain from a bare host,
  first-of multi-value email/phone, **PIN "500 003" → TG**, and both junk
  patterns rejected with reasons — `"Nov-50"` (spreadsheet date coercion) and
  `"undefined+"` (populated but meaningless).

**Verified in a browser:**
- `/design/wizard` mission rail, all four steps, at two viewports.
- `/landing` plays the re-recorded hero loop (11.1s, 593KB, single webm).

**NOT verified — needs a live backend and an authenticated tenant:**
- The whole new `/import` flow through the UI: relationship cards, the
  detection review, tags, as-of, and the re-delivery notice. It typechecks
  and compiles; **no request has ever been made against it.**
- The tag endpoints over HTTP (their SQL was verified directly).
- The whole `/onboarding` journey, including everything shipped on 2026-07-27:
  the rail rebuild, the boot rehydration, the competitors fix, and the
  **vocabulary reorder** (which moved step indices, added a poll and relocated
  an approval call).
- The ETL destination/admin gate.

---

# 🔧 How to verify without the VPS

Two things this container CAN do that earlier sessions assumed it could not.

**Postgres 16 is installed.** Stand up a scratch cluster and apply migrations
for real rather than reviewing SQL by eye — this is how the `name_key`
trailing-space bug was caught:
```bash
mkdir -p /tmp/pg && chown postgres:postgres /tmp/pg
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pg/data -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg/data -o '-p 55432 -k /tmp' -l /tmp/pg/log start"
psql -h /tmp -p 55432 -U postgres -c "CREATE DATABASE scratch;"
```

**Chromium + Playwright work**, but the bundled browser version does not match
`/opt/pw-browsers`. Install playwright in a scratch dir and pin the binary:
```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
```
`/design/wizard?record=1` plays itself with synthetic data and no backend, and
strips all review chrome — that is what the landing hero loop is recorded from.
Pause autoplay and click through rather than screenshotting on a timer, which
races the 620ms handoff and captures blank frames.

**Blocked from this container:** `llm.dristiq.com`, `mcp-gtm.dristiq.com`
(403 CONNECT). `mcp-db.dristiq.com` reaches but 401s.

---

# 🧱 Gotchas that will bite again

1. **There is no global `box-sizing: border-box` reset in this app.** Any
   padded, bordered `width: 100%` child of a fixed-width container overflows
   by exactly its padding + border.
2. **Read the whole reference, in order.** `documents/ux-references/agent-wizard-flow.pdf`
   is 8 pages (and is byte-identical to the file sometimes called `UI.pdf` —
   same MD5). Reading only 1→3 produced a wrong reduction table; pages 7–8
   carry the rule that steps 4–6 file no artifact. `pdftoppm` is unavailable;
   use `pip install pymupdf` and render at dpi, then Read the PNGs. **Renders
   must not be committed.**
3. **Clusters are drafted at the END of ingestion.** `draft_profile`
   (`ingestion.agent.ts:245`) releases the wizard to show step 1, but
   `KNOWLEDGE_UPDATED` (line 445) is what triggers `generateClusters`. Anything
   assuming vocabulary is available with the profile card is wrong.
4. **The wizard used to rebuild itself from `gt_tenant_profile` alone**, so
   competitors, run steps and clusters evaporated on reload. Fixed — but the
   pattern is worth checking whenever new agent output is added.
5. **Normalisation expressions are duplicated between SQL and JS, and BOTH
   copies have shipped wrong.** `gt_contacts.normalized_name` (187, from
   ki_contacts 119) filtered `[^A-Z0-9\s]` BEFORE upper-casing and deleted
   every lowercase letter — `'priya sharma'` normalised to `''`, so contact
   *search* was broken and any dedup would have merged unrelated people.
   `gt_prospects.name_key` (196) never trimmed. Both are now pinned by tests
   in `src/etl/tests/`. **If you change one copy, change the other** — the
   JS lives in `src/etl/field-normalizers.ts` and says which column it
   mirrors.
6. **The frontend production build is RED on main** for reasons unrelated to
   any of this: `pulses/page.tsx:248` (ApiError→Error cast) and
   `PulseZone.tsx:92` (SetStateAction). `demo-data/page.tsx` was fixed here.
   `npm run build` fails at the first one — do not read that as your change.
7. **`npx tsc --noEmit` must be run from `backend/` or `frontend/`,** not the
   repo root. From the root it picks up the wrong tsconfig and invents
   dozens of `Cannot find name 'process'` errors.
8. **The ETL code was ported from kewalinvest and assumes ITS schema, not
   this repo's migrations.** `POST /etl/sessions` wrote to
   `ki_import_sessions.customer_lookup_method`, a column NO migration here
   creates — so the route had never once succeeded against `vani_gtm_db`.
   Behind it, 104's `import_type` CHECK had no `'company'`. Both fixed
   (201). **Before trusting any other ported `ki_` query, diff the columns
   it names against what the migrations actually create.** A scratch
   Postgres built from the migration files is the way to check.
9. **Re-adding a CHECK constraint you dropped? Find every migration that
   widened it first.** Migration 200 re-added the staging
   `processing_status` CHECK from 104's list and silently dropped
   `'orphan'`, which 143/146 had added. Caught only by grepping for other
   `processing_status IN` declarations.

---

# 📋 Session log — 2026-07-27/28

Newest first. All merged to `main`.

| Commit | What |
|---|---|
| `ed9792c` | Import screen tells the truth; dashboard reads company data; **merge review built**; frontend build green for the first time |
| `49d0780` | **The 501 is gone** — landing.ts + the checksum restriction + 8 real-database integration tests |
| `a9340e5` | The INSERT wrote to a column no migration creates; `import_type` CHECK had no `'company'` |
| `9205b0c` | `/import` asks what the data MEANS — three relationship cards, detection review, tags, as-of, re-delivery notice |
| `ac8cef2` | Unblock the production build (demo-data typed a skill response as `{}`) |
| `ce4b7a2` | Processors wired into staging at last; `mapCompanyRow` honours the user's mapping; tags endpoints; re-delivery no longer 409s |
| `e2db21e` | `entity-detector` + `contact-processor` + **the repo's first tests** (46) |
| `a2f7237` | Migrations 198–200 — and **the `normalized_name` repair** |
| `50ddbed` | ETL accepts company imports, admin-gated `destination`, a `gt_source_loads` row per import |
| `f41cae1` | `company-processor` — map/normalise/score/dedup, verified on real rows from both files |
| `9cfb14c` | DB connector pointed at `mcp-db.dristiq.com` (the host that answers) |
| `26810a8` | **`name_key` never trimmed** — caught by applying migrations to a real Postgres |
| `1940276` | Migrations 193–197: one pipeline, two destinations |
| `98bca60` | **Cross-tenant hole in the ETL routes fixed** — five routes fetched by SERIAL id with no tenant predicate |
| `d8d4a1e` | Upload ships first; common pool becomes an entitlement |
| `e6d87ab` | Model the **load**, not just the source |
| `214a9b3` | **Vocabulary reorder** — ratified before the search that consumes it |
| `15945cd` · `7f2e81c` · `5829a52` · `5bbabe0` | Prospect-universe design notes (Phase A/B, CRO reading, industry taxonomy) |
| `85910e2` | **Restore the whole mission on boot**, not just the profile — brought back the site-health findings rail |
| `8103010` · `c785fb8` | Landing hero loop re-recorded against the new rail; `?record=1` added |
| `358ec47` | Top-rail labels kept, artifacts carded, **stop asserting "no competitors"** when none were loaded |
| `c598981` | **Rail rebuilt as real mission memory** (steps 1–4) |

**Three bugs found only by using the product**, not by review: competitors
asserted as zero when unloaded, the site-health findings rail starved of data,
and the vocabulary never reaching the search that needed it. Plus one security
hole and one SQL defect found by running things. This is the argument for
proving journey #1 before building further.

---

# 📐 Key design documents

- `documents/design-notes-prospect-universe.md` — **the current design work.**
  Source/load model, field-level merge, quality components, identity
  resolution, industry taxonomy, Phase A/B split, coverage.
- `documents/POA-VaNi-GTM.md` — phases. Note Phase 2 is being taken as a
  **scoped slice** (the prospect tables) rather than one big pass.
- `documents/PRD-VaNi-GTM.md` · `documents/GTM-AGENT-ROADMAP.md`
- `documents/ux-references/` — internal-only; nothing ships as an asset.

# 📊 Where the POA stands (2026-07-28)

| Phase | State |
|---|---|
| 0 — Legacy removal | ✅ complete |
| 1 — UX Foundation | ✅ build done; neural-ops default + "wow" sign-off remain |
| 2 — Data modelling | ⚠️ prospect slice modelled and applied (193–197); rest untouched |
| 3 — Skills | ⚠️ 2 of 8 (profile v2, research). story-skill v1 only |
| 4 — Stitching | ⚠️ **E2E acceptance never achieved** |
| 5 — Hardening | ❌ RLS cutover still dormant — required pre-production |

---

## Phase 0 / Phase 1 detail (history)
1. ~~**Deck-viewer gap**~~ ✅ CLOSED (2026-07-25): the public deck viewer was
   confirmed missing from main and rebuilt —
   `frontend/src/app/(public)/deck/[token]/page.tsx` + module CSS, plus
   `API.storyteller.share` registered in `serviceURLs.ts` (auth: false).
   Stage machine (loading/error/ready), keyboard + dot navigation, VDF
   loader/error-screen, theme variables only. This closes the locked scope
   (ICP + pitch generation). Smoke: route compiles and serves 200 in dev;
   verify once against a live backend with deck
   `E0cZmJMe2Ju6qZZasiC5iTRJ6vDH1FtE` (tenant `c829c707`).
2. **Phase 1 — UX wow pass** (POA Phase 1, `documents/POA-VaNi-GTM.md`):
   - ✅ **1.1 DONE (2026-07-25):** Neural Ops is a first-class theme
     (`config/theme/themes/neuralOps.ts`, id `neural-ops`, registered;
     dark = void/cyan/signal canonical, light = counterpart). Theme
     pipeline now supports per-theme fonts (`ThemeConfig.fonts`,
     emitted by ThemeProvider + ThemeScript; defaults preserved for the
     other 14 themes) — neural-ops uses Outfit / Instrument Sans /
     JetBrains Mono, loaded in the root layout font link. Mockup
     motion/glow/grid patterns are VDF utilities:
     `components/vdf/vdf-utilities.css` (`.vdf-animate-in` + delays,
     `.vdf-pulse`, `.vdf-glow-*`, `.vdf-glow-card`, `.vdf-gradient-text`,
     `.vdf-ops-label`, reduced-motion safe; imported in root layout) +
     `<VdfGridOverlay/>` (blueprint grid, pairs with VdfAtmosphere).
     All theme-token driven (color-mix over --color-*) — works under
     every theme. Verified via Playwright: /login + /landing render in
     neural-ops; vikuna-black unchanged. **Default theme stays
     vikuna-black** — flipping the product to neural-ops is a one-line
     env/default change the user makes when ready.
   - ✅ **1.2 DONE (2026-07-25):** all 12 screens exist as pixel-final
     interactive designs under **`/design`** (index page links them;
     shared `DesignShell` chrome with Neural Ops ⇄ Vikuna Black flip;
     synthetic "Solstice Metrics" data throughout): wizard (also in
     the sidebar as "Mission Wizard"), icp (+VaNi chat surface),
     knowledge, research, audit, campaigns, prospects, sequences,
     war-room, agent-logs, analytics, settings.
   - ✅ **1.3 DONE:** all 8 gap components in VDF — VdfMissionRail,
     VdfApprovalCard, VdfEnrichmentWaterfall, VdfScoreRing,
     VdfVisibilityMatrix, VdfLiveFeed, VdfPipelineKanban,
     VdfFlowCanvas (+ reused VdfWizard as the step rail). All
     theme-token driven, reduced-motion safe, exported from the index.
   - ✅ **1.4 DONE:** 9.8s muted-loop explainer recorded from the
     design wizard (Playwright walkthrough, review chrome hidden,
     wordmark close: "Your AI GTM team."). Files:
     `frontend/public/media/wizard-loop.webm` (0.45MB) + `.mp4`
     (0.52MB), embedded in the landing HeroSection (autoplay muted
     loop, playsInline). Re-record from the REAL wizard once it's
     wired to the backend.
   - ✅ **1.5 DONE (2026-07-27) — terminology de-jargon pass.** A
     PROSPECT REVIEW flagged that "ICP" is jargon most users won't
     parse. User ruling: **ICP → "Ideal Customer"** in all user-facing
     copy, and widen the pass to other jargon. Renamed across the
     wizard, ICP Builder, login vault, landing (hero/features/pricing/
     stepper/pain/testimonials), dashboard, storyteller, campaigns and
     demo-data; `Pulses` → **Follow-ups** (nav + page + copy); `AEO`
     spelled out ("AI answer engines like ChatGPT and Perplexity",
     "AI search visibility"; the findings-rail teaser tag is now
     "Invisible to AI"). **Deliberately NOT renamed** (churn with no
     user benefit): `icp_role`/`icp_company_type` columns, `icp-skill`,
     the `/onboarding/icp-builder` route, `ICP_FIELDS`, CSS class names,
     and code comments. **`War Room` deliberately KEPT** — it is brand
     metaphor consistent with Mission Wizard / mission control, not a
     comprehension barrier; say so if the user wants it changed.
   - ✅ **1.6 DONE (2026-07-27) — wizard flow rebuilt as an agent handoff.**
     User spotted that the top step chips and the left rail were saying
     the SAME thing, and pointed back at `ux-references/agent-wizard-
     flow.pdf` (+ its README, which already said it): **"accumulating
     left rail = mission memory — each completed step COLLAPSES INTO THE
     RAIL and stays inspectable"**. The rail had been built as a second
     list of step names; it now carries the agent's REAL output,
     expandable — company card (description, problem, differentiator
     chips), the confirmed competitor list, the buyer + pain + vocabulary
     chips. Top chips = where you are; rail = what was found. No overlap.
   - **User ruling on advancing:** the flow AUTO-RUNS; manual controls
     appear on error. Ready steps arm a **7s interruptible countdown on
     the confirm button** ("Confirm 4 competitors · 5") with an explicit
     "Hold — I want to change something". ANY interaction inside the card
     (pointer/focus/key, capture phase) cancels it PERMANENTLY for that
     card — once a human touches their data, only a human commits it.
     Countdown is disabled entirely under prefers-reduced-motion and
     while a step is running or failed. Implemented as
     `VdfApprovalCard.autoConfirmMs` so every future step inherits it.
   - **The handoff animation — a MEASURED FLIP, not a fade.** First
     attempt only faded the card and nudged it 56px left while the rail
     entry silently appeared; the user correctly reported "same thing
     like before", because a fade is not a move. Now `handoff()`
     measures the stage card AND the destination rail slot
     (`[data-mission-step="<id>"]`, set by VdfMissionRail) and flies the
     REAL card into that slot via `element.animate()` — translate +
     scale computed from the two rects, 620ms, transform-only so nothing
     reflows. `.mainFlying` sets `transform-origin: top left` so the
     measured maths lands true. On arrival the rail slot pulses
     (`.mission-step-landed`, a GLOBAL class in app/globals.css because
     the wizard toggles it on an element the rail component owns).
     A `setTimeout` safety net commits even if the animation is
     interrupted (tab hidden) — never strand the user mid-handoff.
     Reduced motion, a missing ref or no WAAPI all fall back to an
     instant swap. Distance depends on runtime layout, so the flight
     CANNOT live in CSS — keep `HANDOFF_MS` as the single duration.
   - ✅ **The handoff is now SHARED and REVIEWABLE (2026-07-27).** The
     user reported "if it travels, why cant i see" with a screenshot of
     **`/design/wizard`** — the static Phase 1.2 mockup (Solstice
     Metrics), not the live wizard. Fair mistake, and it exposed the
     real gap: judging the motion required a backend + LLM + fresh
     tenant. Fixed:
     - Extracted the FLIP into **`hooks/useMissionHandoff.ts`**
       (`stageRef`, `handingOff`, `handoff(stepId, commit)`, exported
       `HANDOFF_MS`). BOTH wizards use it, so the product and the
       surface used to review/record it can never drift.
     - **`/design/wizard` now PLAYS ITSELF** — all 6 synthetic steps
       auto-advance (3.2s dwell) with the same flight, plus "Replay the
       flow" and a pause/resume autoplay toggle. Zero backend, zero
       LLM, zero auth: this is the fastest way to judge the motion, and
       a viable synthetic-data recording surface for the landing loop.
   - ⚠️ **On the LIVE wizard the handoff only plays on an UNCONFIRMED step.** On a
     completed mission every step is ✓ and there is no confirm button,
     so nothing animates — that is the state the user's screenshot was
     in. Test with a fresh tenant or a step not yet confirmed.
   - ✅ **1.7 DONE (2026-07-27) — engaging waits + recording mode.**
     User accepted the LLM is slow and asked to make the WAIT engaging,
     and to run the landing animation WITHOUT the hold timer.
     - `VdfKgLoader` gained `subject` ("Building knowledge for
       **vikuna.io**" — naming the tenant makes it *your* thing being
       built, not a spinner), `rotating` (status lines cycling every
       4.2s so a silent minute never looks frozen — every line describes
       work the agent genuinely does, never a fake progress claim), and
       `patienceAfter` (default 45s → "This one runs deep — a few
       minutes is normal. Everything found so far is already saved.",
       which is TRUE thanks to incremental KG writes + checkpoints).
     - Wizard step 1 and the competitor phase both use it, named from
       the domain / product_name, with their own rotation copy
       (RESEARCH_ROTATION / COMPETITOR_ROTATION in page.tsx).
     - **Recording mode: `/onboarding?record=1`** — the SAME real flow
       with no countdown chrome (`VdfApprovalCard.autoConfirmSilent`)
       and a 2.2s dwell instead of 7s. This is what the landing loop is
       recorded from; no separate demo path to drift out of sync.
   - ⚠️ **This flow is what the landing video records** (item b below).
     It only reads as continuous if steps are FAST — on the 4+ minute VPS
     LLM the animation becomes card → dead loader → card. Use the Haiku
     path for the recording and for demos.
   - **Phase 1 remaining (2026-07-27):**
     a) **User ruling needed:** make neural-ops the product default
        theme (one line: NEXT_PUBLIC_DEFAULT_THEME or provider default).
     b) ⏸️ **Explainer video re-record — PARKED, OWNED BY THE USER.**
        They are visualising a different approach and will say once
        Phase 1 is otherwise complete. Do NOT re-record unprompted.
     c) **"Wow" sign-off** — the DoD gate itself.

## ▶ NEXT (PLG direction APPROVED by user 2026-07-25)
1. ✅ **Wizard wired to the live backend (2026-07-25)** — `/onboarding`
   IS now the agent-led mission wizard (old form-first page replaced;
   `/onboarding/icp-builder` kept as the refine surface; the old
   Onboard* components remain in components/onboarding for reuse).
   - **Backend added:** `POST /api/v1/ingest/url` (validates/normalizes,
     upserts gt_kb_sources url row — resubmit re-ingests, no dup rows —
     emits URL_SUBMITTED) and **URL support in IngestionAgent.run**
     (fetchUrlText: 30s-timeout fetch, HTML→text strip, 200k-char cap,
     JS-rendered pages fail with URL_EMPTY_CONTENT). Previously
     URL_SUBMITTED was registered but unimplemented (gdrive-only).
   - **Wizard flow:** step 1 domain → submit → poll source status →
     poll profile (KNOWLEDGE_UPDATED recalc) → researched card;
     error path offers retry OR "fill manually". Step 2 editable ICP
     fields (blur-save PUT, highlights `missing` fields from 400
     PROFILE_INCOMPLETE) → POST approve. Step 3 build deck →
     approve → share link (copy/open) → "Enter mission control"
     PATCHes ALL pending vn_tenant_onboarding steps → layout guard
     routes to /dashboard. Steps 4–6 locked ("agent coming soon").
     Boot resumes mid-mission (existing profile/approval/deck
     detected). serviceURLs: added `ingest.submitUrl` + `ingest.getSource`.
   - **Landing PLG hook:** hero domain input ("Watch VaNi learn your
     business") stores `gtm-domain-hint` in sessionStorage → /register;
     wizard step 1 prefills it.
   - ✅ **n8n render escalation VERIFIED LIVE (2026-07-27)** — after a
     long infra debugging session (community-node Chrome-missing on
     the Alpine n8n image → switched to the browserless docker variant
     → n8n Header-Auth credential in place of blocked `$env` access →
     cross-network container DNS failure → resolved via the
     `root_default` network gateway IP + browserless's host-published
     port, since browserless and the n8n worker container weren't on
     a mutually-resolvable network). Direct webhook test against
     `https://vikuna.io/` (a JS-only Vite/React SPA) returned
     `success:true`, 39,657 chars of fully rendered HTML — confirms
     the whole escalation chain (static crawl → health check →
     `render_page` → n8n → browserless → `render_complete`) is
     operationally live on the user's VPS. Two workflow files in
     `documents/n8n/` both patched to self-diagnose (name missing
     HTML by the actual json/binary keys returned) — keep both in
     sync if editing either's `Format Render Result` node again.
   - ⚠️ **Still NOT E2E-tested end-to-end through the WIZARD UI** —
     the render leg is proven at the n8n layer only. Next live test:
     register a fresh tenant → wizard step 1 → a real JS-rendered
     domain → confirm the drafted profile quality against rich real
     copy (worth watching: `vikuna.io`'s meta/OG/JSON-LD tags are
     injected by styled-components at runtime, not served statically —
     a real SEO/AEO finding for that site, and a good signal that the
     site_health check's "measure the static page" design is correct).
     Ollama must be pre-warmed (extractor + storyteller both hit LLM).
1a. **PIPELINE RE-SEQUENCED (user ruling, 2026-07-27) — read
   `documents/design-notes-gtm-pipeline-v2.md` before touching the
   wizard or Storyteller.** Five stages: competitive analysis →
   business-model analysis (open discussion, NOT committed) → ICP +
   pains → storytelling (stage/behaviour-aware, gated on 1+3) →
   campaigns (drip + story + journey). Journey-stage vocabulary:
   `documents/customer-journey-maps.pdf`.
   ✅ **IMPLEMENTED (2026-07-27, user "goahead"):**
   - Wizard is now research → **confirm competitors** → confirm ICP →
     mission configured. Deck step REMOVED from `/onboarding`;
     confirming the ICP finishes onboarding directly (approve →
     PATCH pending steps → /dashboard). Locked rail: Storytelling
     ("Unlocks in mission control"), Campaigns, Follow-ups.
   - New backend endpoints (vani.routes.ts): `GET /api/v1/vani/
     competitors` (KG Competitor nodes) + `POST /api/v1/vani/
     competitors/confirm` (keep → `properties.confirmed=true`,
     remove → node DELETE with edge cascade; empty keep list valid —
     "No competitors — continue"). Registered in serviceURLs
     (`API.vani.*`).
   - **Storyteller relocated to `/dashboard/storyteller`**: build
     (KG-constellation loader while drafting), **Approve & share**
     on awaiting decks (PATCH approve → share token), Copy link /
     open on approved decks. Wizard has zero storyteller code left.
   - Boot/revisit logic: approved profile ⇒ competitors+ICP marked
     confirmed, wizard lands on ICP step for enrichment revisits.
   - Smoke: both packages typecheck (only known pre-existing
     errors); `/onboarding` + `/dashboard/storyteller` serve 200.
   - **Competitor RESEARCH agent added (user ruling: competitors must
     be researched from the ICP, not scraped off the tenant's site;
     user chose self-hosted SearXNG).** New `research-skill`:
     `COMPETITOR_RESEARCH_REQUESTED` event → CompetitorResearchAgent
     (profile → LLM-framed queries → SearXNG JSON API via
     `agent-core/search.client.ts` → LLM shortlist of vendors →
     per-candidate verification against their REAL site via
     `IngestionAgent.fetchUrlText` (now public) + LLM fit-judgment →
     KG write: Competitor nodes {source:'research', domain, verified,
     angle, confirmed:false} + Company —DIFFERENTIATES_FROM→ edges).
     Unverifiable candidates are KEPT marked `verified:false` (human
     gate decides — transparent, not a fallback); dropped candidates
     are visible steps. Routes: `POST /vani/competitors/research`
     (dedupes active runs) + `GET /vani/competitors/research-status`.
     Wizard step 2 auto-starts research when the map is empty, shows
     the KG loader + live step feed, surfaces failures with the real
     cause + Retry, badges unverified rows. **DEPLOY PREREQ (user):**
     SearXNG on the VPS per `docs/searxng-setup.md` — port 3011,
     settings.yml must add `json` to search.formats (403 otherwise),
     then `SEARXNG_URL` in backend/.env (+ hard-restart worker).
     Without it research fails loudly with SEARCH_NOT_CONFIGURED.
   - **Resume-from-failure (user-requested after a live
     LLM_VPS_UNREACHABLE timeout killed a research run mid-verify).**
     ⚠️ **APPLY MIGRATION 191 before running this code** (`cd backend
     && npm run db:migrate`) — adds `gt_agent_runs.checkpoint JSONB` +
     partial index; agents now call saveCheckpoint and fail with a
     clear CHECKPOINT_COLUMN_MISSING error if it's absent. Mechanics:
     agent.runner gains saveCheckpoint (jsonb merge) / loadCheckpoint /
     findResumableRun (latest failed run w/ checkpoint, ≤24h). The
     research agent checkpoints after every stage (queries → results →
     candidates → per-candidate assessed) AND writes each accepted
     competitor to the KG the moment it's verified (incremental, not
     batched); wizard failure card now offers "Resume from where it
     stopped" (POST research {resume:true} → resume_run_id in event
     payload → visible 'restore' step) vs "Start fresh". Ingestion
     retrofitted with the same earn-it-write-it pattern: extractor
     gained an onChunk callback, nodes upsert per chunk + per-chunk
     checkpoint {chunks_done/total}; edges still resolve at the end
     (cheap, no LLM). Profile is always reloaded fresh on resume.
   - **Live-run status (2026-07-27):** SearXNG deployed + JSON API
     verified by the user (real results via curl). TWO wizard runs
     died on `LLM_VPS_UNREACHABLE: https://llm.dristiq.com —
     TimeoutError` — and the user confirmed LLM_PRIMARY_TIMEOUT_MS
     was **280000 the whole time**, meaning single qwen calls exceed
     4.6 MINUTES on that box. The VPS LLM is too slow for this
     pipeline as-is (still unknown: CPU or GPU, `curl
     https://llm.dristiq.com/api/ps` output). Prompt slimming helps;
     the real mitigation is the failover below.
   - **Claude API failover (user-directed, approved rule-12
     exception — documented in CLAUDE.md rule 12).** qwen stays
     primary; when a call fails at the TRANSPORT level
     (LLM_VPS_UNREACHABLE / LLM_VPS_ERROR) and ANTHROPIC_API_KEY is
     set, llm.client retries that one call on Claude
     (LLM_FAILOVER_MODEL, default claude-haiku-4-5 — $1/$5 per MTok;
     a full research run ≈ $0.02–0.03, full onboarding ≈ $0.10–0.15),
     then the NEXT call goes back to qwen. Never silent: one visible
     `llm_failover` step per run (with the real VPS error) + tokens
     recorded under the pre-existing 'escalation' bucket in
     gt_tenant_context. Validation failures deliberately do NOT
     escalate (quality problems stay loud). Without the key, behavior
     is unchanged (fail loudly). `@anthropic-ai/sdk` added to
     backend. **User action: put ANTHROPIC_API_KEY in backend/.env
     (env only, never repo) + hard-restart API and worker.**
     Deferred by user intent: a global LLM_PROVIDER switch
     (qwen vs claude as primary) — failover-only for now.
   - NOT yet live-tested end-to-end through the new step 2 (needs
     migration 191 applied + worker + warm LLM + SearXNG). First live
     Storyteller run verdict: deck
     generated OK end-to-end, quality needs work — deck-quality
     workstream (KG-edge-grounded prompts, competitor angles,
     stage-aware variants) starts NOW that relocation is done.
1e. **SEMANTIC CLUSTERS — the market vocabulary layer (user-directed,
   2026-07-27). ⚠️ APPLY MIGRATION 192.** The user challenged the
   research design: searching without curated vocabulary drops quality,
   and pulling only a stop-gap forward is rework ("why redo, when C
   works better?"). Agreed and built. `gt_semantic_clusters` is the
   Phase 2 table built in the only possible dependency order —
   vocabulary now (search needs it), `cluster_embedding vector(768)` +
   HNSW in Phase 2 (Lead Finder needs it). NOT rework.
   - **User design ruling:** `cluster_type`
     (category/offering/buyer/pain/outcome) replaces the ported
     ContractNest 12-value INDUSTRY enum — cluster TYPE drives how a
     cluster is searched; industry does not. Industry filtering returns
     in Phase 2 for Lead Finder.
   - Each cluster carries 10–15 `related_terms` (synonyms, customer
     phrases, jargon, transliterations) — the fuel that turns "AI
     transformation companies" into "fractional CDO"/"part-time CDO".
     This is the fix for the Accenture-vs-boutique result.
   - `approved_at` NULL = agent-suggested, set = human-confirmed
     (mirrors gt_tenant_profile). Only APPROVED clusters frame research.
   - Flow: KNOWLEDGE_UPDATED → profile recalc → `generateClusters()`
     (1 LLM call, prompt seeded as `profile-skill.semantic_clusters`)
     → tags in the wizard's ICP card → confirming the ICP ratifies them
     (no extra step, per the sprint ruling) → research frames queries
     from them, and says so in the feed. No approved vocabulary → it
     falls back to the old profile-guess and tells the user why.
   - Agent refresh never clobbers a human decision (approved or
     human-edited rows keep their terms); cluster failure is a visible
     failed STEP, never a failed profile recalc (rule 12).
   - Routes: `GET /profile/clusters`, `POST /profile/clusters/approve`.
   - NOT yet live-tested (needs migration 192 + a fresh run).
1f. **BUG FIXED — "Research again" appeared to do nothing (2026-07-27).**
   User clicked Research again and the card closed instantly. Cause:
   `GET /vani/competitors/research-status` returned the LATEST run for
   the tenant. A freshly-emitted event has no gt_agent_runs row until
   the worker polls (≤3s), so the first status poll read the PREVIOUS,
   completed run → UI jumped to 'done' with a "Research done — N
   competitors" toast while the real run was still queued and then ran
   invisibly. Fix: the status endpoint accepts `?event_id=` / `?run_id=`
   and scopes to that one run; POST already returns event_id (and run_id
   when a run is already active), so the wizard follows exactly the run
   its click produced. `run: null` now correctly means "queued", shown
   in the loader as "Waiting for an agent to pick this up…" escalating
   to the worker-not-running hint after ~24s. The resume-on-entry path
   polls by run_id. Lesson: never resolve "did my request start?" by
   reading the newest row — bind to the identifier the request returned.
1g. **PARKED (user ruling, 2026-07-27): Value Proposition Canvas belongs
   in the LOOP, not the wizard.** The user asked whether the ICP step's
   pain points could render as a Strategyzer Value Proposition Canvas,
   then ruled it a loop/enhancement surface — onboarding stays a sprint.
   Build it in `/onboarding/icp-builder` (the existing refine surface)
   and/or `/knowledge`, NOT in the wizard step.
   Feasibility mapped — 4 of 6 boxes are already live:
   - Pains ← primary_pain_points[] + PainPoint nodes (ICP FEELS) ✅
   - Products/Services ← Product/Feature nodes ✅
   - Pain Relievers ← existing `SOLVES`/`ADDRESSES` edges ✅ (the hard
     part: the canvas is meaningful because of the LINES between halves,
     and those are real extracted edges with source_url provenance)
   - Customer Jobs ← UseCase nodes ⚠️ close, not identical
   - **Gains ❌ and Gain Creators ❌ — MISSING. Build these FIRST**, or
     the canvas renders a third empty and reads as broken: add a `Gain`
     NodeLabel + `WANTS` (ICP→Gain) / `CREATES` (Product→Gain) relation
     types to kg.store + the extraction prompt (purely additive — no DB
     constraint on label, same as CaseStudy/Metric were), optionally a
     `desired_gains[]` profile field mirroring primary_pain_points.
   - The real payoff beyond layout: **fit/gap analysis.** A PainPoint
     with no inbound SOLVES edge = an unaddressed pain (positioning
     hole); a capability solving nothing = an unsold strength. "3 of
     your 5 pains have no matching capability" is a genuine finding and
     a PLG teaser in the same family as the SEO/AEO ones. Feeds stage 4
     directly (storytelling exists to explain the pains).
1c. **Marketing playbooks captured (2026-07-27).** The user shared their
   Claude marketing plugin's full skill playbooks (campaign-plan,
   email-sequence, competitive-brief, brand-review, performance-report,
   content-creation, seo-audit) as inspiration for VaNi's agents. Raw
   text: `documents/skill-references/claude-marketing-skills.txt`;
   distilled map + recommended build order:
   `documents/design-notes-marketing-playbooks.md`. Key take: these are
   the professional spec for stage-4/5 agents — VaNi fills their
   structures from the tenant KG instead of interviewing the user.
   Proposed order (NOT yet approved): brand-voice fields + auto
   brand-review gate → research-skill v2 analysis layer (tiers +
   battlecards) → sequence/campaign agents from playbook-seeded
   gt_prompts.
1d. **Wizard UI pass from the live-run screenshot (2026-07-27, DONE).**
   - Competitor rows → **tag-style cards in a responsive grid**
     (design/research parity): status tag (Verified / Unverified /
     Ignored) + domain chip, display-font name, description, action in
     the card footer. The live "mapped so far" list uses the same card.
   - **"Not a competitor" → "Remove"** ("Keep after all" to undo). The
     old label read as a verdict — the user reported "almost all are
     tagged not competitors" when only the agent-dropped one actually
     was. Removed cards now carry an explicit `Ignored` tag, the header
     reads "N on your map / M moving to your ignore list", the confirm
     button counts ("Confirm 3 competitors"), and a hint spells out that
     removal feeds the ignore list (backend already dismisses, 57d41e9).
   - **Loop moved OUT of onboarding** to `/knowledge` ("Teach VaNi", new
     nav item under Mission Wizard): URL + paste inputs, KG loader,
     profile score ring, "what moves the needle" panel. The wizard keeps
     a one-line pointer once onboarding is complete; enrichment state +
     submitEnrichment deleted from page.tsx.
1b. **Deferred (user-agreed, 2026-07-27): full date handling.** The
   `DD-MMM-YYYY` render convention is live via `lib/format.ts` (the
   single gateway, CLAUDE.md rule). Still to come, later: tenant
   timezone preferences, server↔UI conversion beyond browser-local,
   and customer date-INPUT parsing/validation (a VDF date field).
   All of it lands inside format.ts + one VDF component — nothing
   else may grow date logic.
2. **Phase 2 — data modelling** (screens now dictate schema; rename
   kept ki_ tables to gt_). **Required input:**
   `documents/design-notes-smartprofile-port.md` — distilled from the
   ContractNest SmartProfile spec + n8n workflow the user shared
   (2026-07-27): suggested_/approved_ field provenance for
   gt_tenant_profile (replaces fill-only-empty), gt_semantic_clusters
   + pinned-dim pgvector embeddings (prereq: verify vector extension
   on vani_gtm_db), embeddings via VPS Ollama (nomic-embed-text, add
   embed() to llm.client), their production cluster prompt, and the
   hybrid vector+cluster-boost search that becomes Lead Finder's
   matching engine. AI jobs run on the worker bus, NOT n8n.
3. UI smoke state: contact CONT-0001 created through the UI post-Phase-0.

## What this product is (scope — LOCKED)
Vikuna GTM = an **agent-powered go-to-market engine**. Scope is locked to
**ICP + pitch generation** right now. **Storytelling is ONE agent; more agents
are coming** (ICP, Lead Finder, Sequence, Pulse — see `documents/VIKUNA_AGENT_SPEC_V1.md`
and the mockups in `documents/gtm-engine-ui/`).
**Nothing works without an ICP — the ICP (tenant profile) is the foundation/gate**
for every downstream agent.

> **Strategic docs (long-range, beyond the locked scope) — read after this file:**
> 1. `documents/PRD-VaNi-GTM.md` — full product definition (v1.0)
> 2. `documents/POA-VaNi-GTM.md` — execution plan (UX → data → skills → stitch,
>    with Phase 0 = KI-Prime/kewalinvest legacy removal)
> 3. `documents/GTM-AGENT-ROADMAP.md` — phase history + standing decisions
>
> These are the roadmap BEYOND the locked scope; the locked scope above wins
> for what gets built next.

---

## ✅ Verified working end-to-end this session
- **Storyteller backend** over HTTP: `POST /api/v1/storyteller/build` →
  `PATCH /api/v1/storyteller/:id/approve` → `GET /api/v1/storyteller/share/:token`.
  Deck `E0cZmJMe2Ju6qZZasiC5iTRJ6vDH1FtE` for tenant `c829c707` is approved +
  shareable.
- **Frontend auth**: login + register work against the backend; rebranded to
  Vikuna GTM (copy + brand strings).
- **Profile API** (live-verified):
  - `GET /api/v1/profile/` → full profile + `completion_score` +
    `completion_detail {product, icp, gtm, vision}`.
  - `PUT /api/v1/profile/` → partial save (whitelisted fields), recomputes score,
    upserts if absent, writes history snapshot.
  - `PATCH /api/v1/onboarding/step` → completes a step, returns `onboarding_complete`.

### ✅ Continuity gap — RESOLVED (2026-07-25)
- The public deck viewer was rebuilt and pushed:
  `frontend/src/app/(public)/deck/[token]/page.tsx` (+ `deck-viewer.module.css`).
  It goes through `apiFetch` + `API.storyteller.share` (auth: false) rather
  than a raw fetch — the old `(public)/intake/[token]` pattern was removed in
  Phase 0, and serviceURLs/api-client is the house convention. Endpoint:
  `GET /api/v1/storyteller/share/:token` → `{ title, slides }` (Slide =
  `{ id, type, title, subtitle, bullets[{icon,head,body}], narration }`;
  narration is intentionally NOT rendered — speaker notes).

---

## Key facts the next session MUST know
- **DB role / RLS:** the app connects as **`vikuna_admin`** (superuser, `BYPASSRLS`),
  so **RLS is dormant at runtime** — tenant isolation currently rests on the
  app-layer `WHERE tenant_id` only. The least-privilege cutover to `vanigtm_app`
  (grants + the `SECURITY DEFINER get_shared_deck(token)` fix for the public
  share route, which will otherwise break under RLS) is **drafted but NOT done**
  in `scripts/grant-vanigtm-app.sql` + `docs/rls-cutover-checklist.md`.
  **Deploy-time task.**
- **Frontend** is a remodelled KI-Prime (Next.js 16 App Router, **NOT Vite**).
  Brand strings centralized in **`frontend/src/constants/brand.ts`**
  (`BRAND.name = 'Vikuna GTM'`). Theme = **vikuna-black (gold-on-black)** — keep
  as-is. (Mockups use a cyan/green mission-control palette; not adopted — would
  need a new theme.)
- **`onboarding_complete` is DERIVED, not stored.** `GET /auth/me` computes it as
  `count(vn_tenant_onboarding WHERE status != 'completed') == 0`. Seeded steps at
  registration: **`user_profile`** + **`business_profile`**.
  **`POST /profile/approve` does NOT release onboarding** — it only stamps
  `gt_tenant_profile`. To release the guard you must `PATCH /onboarding/step`
  for **every** pending step until the pending count hits zero.
- **Migrations are manual** (`cd backend && npm run db:migrate`); the server never
  auto-runs them. Highest migration = **186** (`gt_storyteller`).
- **LLM:** VaNi uses an OpenAI-compatible endpoint (`/v1/chat/completions`) via
  `LLM_PRIMARY_URL`/`LLM_PRIMARY_MODEL`. Working model on the dev laptop is
  **`qwen3:8b`** (pre-warm Ollama with `keep_alive:"24h"`; it emits the required
  tags). `llm.client.ts` appends `/no_think` and sends an optional
  `Authorization: Bearer $LLM_PRIMARY_KEY` only if that env is set.
- **`gt_events` has RLS disabled** by design (migration 185) — it is the
  cross-tenant event bus polled by the worker.

---

## ✅ SHIPPED via PR #8 (2026-07-25) — dashboard + ICP builder below are BUILT
The dashboard (ICP foundation card + agent launchpad), the /onboarding
icp-builder (editable, blur-save, Confirm ICP flow), the storyteller deck
list page, KNOWLEDGE_UPDATED→profile recalc wiring, and the gtmProfile
serviceURLs all landed via PR #8. The spec below is kept for reference.

## 🔨 Designed & LOCKED — shipped in PR #8 (spec kept for reference)
### Dashboard (`frontend/src/app/(app)/dashboard/page.tsx` — currently MFD dummy data)
- **ICP foundation card**: completion % from `completion_score`.
- **Agent launchpad**: Storytelling **live**; other agents **"coming soon"**.
  **All agents gated on an ICP existing** (profile present / approved).

### ICP builder = the `/onboarding` screen
- **Agentic UI, structured (NOT chat).** Sections **Product / ICP / GTM / Vision**
  mirroring `completion_detail`, each showing its sub-score.
- **Blur-save** via `PUT /api/v1/profile/` with **live score update** from the
  response.
- **NO per-field provenance** ("VaNi drafted" tags) — the backend does not track
  it (only a lossy row-level `source` column). Render all fields without
  provenance.
- **"Confirm ICP" = 3 calls, in order:**
  1. `POST /api/v1/profile/approve` (requires the 5 fields: product_name,
     product_description, core_problem, icp_role, primary_pain_points).
  2. `PATCH /api/v1/onboarding/step` for **EVERY** still-pending step
     (`user_profile`, `business_profile`) until `onboarding_complete === true`.
  3. Invalidate `useMe` and navigate to `/dashboard`.

### Step A (prerequisite before building the UI)
- **Register the gtmProfile endpoints in `frontend/src/lib/serviceURLs.ts`** —
  they are NOT there yet. Add under a key **`API.gtmProfile.*`** (do NOT reuse
  `API.tenant.profile.*`, which is the *business* profile at
  `/api/v1/tenant/profile` — a different thing):
  - `gtmProfileGet` — `GET  /api/v1/profile/`
  - `gtmProfileUpdate` — `PUT  /api/v1/profile/`
  - `gtmProfileApprove` — `POST /api/v1/profile/approve`
  - `gtmProfileHistory` — `GET  /api/v1/profile/history`

---

## 👀 Watch / open
- **`completion_score` looked erratic across live test calls** (95 vs 0;
  `version` 1 vs 2 on the same profile id). Investigate whether the score is
  stable during live editing **before** wiring the blur-save meter — a jumpy
  score will read as a bug in the ICP builder. Logic:
  `backend/src/skills/profile-skill/profile.service.ts` (`calculateCompletionScore`;
  product 0-40 / icp 0-30 / gtm 0-20 / vision 0-10; `is_complete` = score ≥ 60).
  Note `upsertProfile` MERGES with the existing row then recomputes on the merged
  result — check that partial PUTs aren't nulling fields and dropping the score.
- **Debug console.logs in the storyteller share handler: already removed**
  (commit `9bed127`) — verified clean at `85796b5`. Nothing to do unless they
  reappear.
- ~~`deck/[token]/page.tsx` not on the branch~~ — rebuilt and pushed
  (see resolved Continuity gap above).

---

## How to run (dev)
```
# backend  (port 3002 in the dev .env; 3001 is the code default)
cd backend && npm run dev            # Express + Next wrapper / API
cd backend && npm run worker         # event-bus worker (needed for VaNi / approve flows)

# frontend (Next.js 16, port 3000)
cd frontend && npm run dev
```
- **Frontend MUST set `NEXT_PUBLIC_API_URL`** (e.g. `frontend/.env.local` →
  `NEXT_PUBLIC_API_URL=http://localhost:3002`) or login/API calls hit the wrong
  origin (they fall back to the frontend's own origin). Restart the frontend
  after changing env.
- **CORS** allows `http://localhost:3000` by default (`CORS_ORIGIN`).
- **Seeded admin:** `charan@vikuna.in` / `Vikuna2026Admin` (tenant `vikuna`).
  Phase-3 test tenants use password `Test1234!`. Seed: `cd backend && npm run db:seed`.
- Live DB = `vani_gtm_db` on the VPS via `DB_PRIMARY`.

## Git hygiene (recurring pain this session)
- Local edits kept colliding with pushes. **Before every `git pull`, run
  `git status`; if anything is modified you didn't intend, `git stash` first,
  then pull.** Treat the local checkout as receive-only; branch before local
  experiments. If local and remote diverge and remote is authoritative:
  `git fetch origin && git reset --hard origin/claude/project-status-check-le8eyn`.

## Key files
```
backend/src/skills/storyteller-skill/     agent (buildDeck/approveDeck/answerQuestion) + routes + deck.schema
backend/src/skills/profile-skill/          profile.service.ts (score) + profile.routes.ts (GET/PUT/approve/history)
backend/src/auth/auth.routes.ts            /auth/me (derives onboarding_complete), /onboarding/status, /onboarding/step
backend/migrations/186_gt_storyteller.sql  gt_presentations + gt_qa_log
frontend/src/constants/brand.ts            BRAND (single source of the product name)
frontend/src/app/(public)/landing/         rebranded GTM landing (Step 1 done)
frontend/src/components/auth/              login-vault + register-page (rebranded, Step 2 done)
frontend/src/app/(app)/layout.tsx          auth + onboarding guard
frontend/src/lib/serviceURLs.ts            API registry — gtmProfile.* NOT yet added (Step A)
docs/rls-cutover-checklist.md              deploy-time RLS cutover (incl. share-route SECURITY DEFINER fix)
documents/gtm-engine-ui/                   the product UI mockups (design reference)
```
