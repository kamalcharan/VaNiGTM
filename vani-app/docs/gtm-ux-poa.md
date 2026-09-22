# GTM — build the UX layer first: plan of action, three sprints

**Date:** 2026-09-22 · **Status:** plan, awaiting approval. Nothing built.
**Supersedes** `gtm-migration-poa.md` §3 as the BUILD ORDER. That document's
slice order is still the order in which backends are ready, and it becomes the
integration order after Sprint 3. Its §2 invariants and §5 decisions stand.

**The ruling this answers** (Charan, 2026-09-22): *"build the UX flow first,
and then think whatever for the code integration. UI in vanigtm-frontend is not
up to the mark and when we build now we need to build it much better."*

So this plan does not port anything. It designs GTM as it should be, on the
method that already worked once for Vara — **journey map → playground →
build to the playground** — and it treats the retired `frontend/` as evidence
of what not to do, not as a source.

---

## 0. What "much better" means, so it can be checked

A slogan cannot gate a sprint. Each line below is traceable to a defect in the
retired app, and each is a checkbox on every screen's definition of done.

| Better means | The failure it replaces |
|---|---|
| **Agent produces, human confirms.** A screen opens on the agent's finished work and asks for a decision | Form-first. `audience/find` opens on an offers form with a checklist of what is still missing |
| **One screen, one decision.** ≤ ~400 lines, one question the tenant answers | `audience/find` is 1,591 lines stacking three sections that each deserved a step |
| **Day one is designed first.** The empty state IS the first impression and carries the next action (rule 9b) | War Room: seven zeros and a flat funnel |
| **Pathways are verbs, surfaces are nouns**, and the shell is `PathwayShell` — stepper, artefact rail, findings rail, nothing else invented | every page invented its own layout; the wizard was the only pathway |
| **Five states per screen, designed in the playground** (loading, error, empty, content, outcome) — not retrofitted | states hand-rolled per page; `success:false` with HTTP 200 rendered as an empty success |
| **Tokens only, four themes × two modes**, every screen checked in Vani light | hex literals; one theme |
| **The agent's work is visible and honest.** What it read, what it did not, what it refused (rule 12) — on the screen, not in worker stdout | run 114 was visible only in a terminal |
| **Ten minutes to first value.** The playground has a clock, like Vara's | no notion of time-to-value at all |
| **Deep-link, never duplicate.** Offers, brand, ICP live in the Smart Profile; GTM links there | `brain/offers` was a second editor for a BRAIN object |

---

## 1. The method, and why the order is fixed

```
Sprint 1   JOURNEY MAP  →  PLAYGROUND          documents, clickable, synthetic data
           + Settings in one place · "What VaNi has read"      real code, live transport
              approve ─────────────┐
Sprint 2   SCREENS  G0 landing · G1 audience · People      real code, mock transport
              approve ─────────────┐
Sprint 3   SCREENS  G3 today · G2 motion · the invisible four   real code, mock transport
              approve ─────────────┐
After      INTEGRATION  fixtures become the contract; gtm-migration-poa §3 is the order
```

Two facts make this order not just tidy but cheap:

- **Mock mode is the sanctioned mode for UI work** (`vani-app/CLAUDE.md` §0).
  No `.env.local` → whole console, no backend, no session. Sprints 2 and 3 need
  no VPS, no worker, no LLM, and nothing they build is throwaway.
- **The mock fixtures ARE the API contract.** Every screen is built against a
  typed fixture in its skill folder (the Vara precedent: `vara-onboarding/
  mock-data.ts`). At integration, a skill function either returns that shape or
  the gap is listed. The UX decides the shape; the backend meets it — which is
  the reverse of how `frontend/` was built and the reason it read like a
  database.

**Every sprint ends at Charan's approval, in the browser, not in a doc.** Vara
lost work once because an approved playground was not carried into the build
("you gave me HTML playground and I approved — but you did not take that design
into VaNi"). So Sprint 2 and 3's definition of done includes *"matches the
approved playground scene"* as a literal checkbox per screen.

---

## 2. Sprint 1 — the map and the ten minutes

**Deliverables** (in `VaNiGTM/documents/`, beside Vara's):

1. `gtm-journey-map.html` — the document. Same sections as Vara's:
   *the journey · the other lane · three layers · what breaks today · decisions
   before any more code.*
2. `gtm-ux-playground.html` — clickable, synthetic data only, a clock, a
   scenario switch. Every scene is a screen Sprint 2/3 will build.

### 2.1 The journey the map draws

**The first ten minutes** — a tenant whose Smart Profile is done (offers,
ICP, vocabulary, brand exist) lands in GTM and leaves with a list of people
worth a message:

```
land        "Here is what I know about who you sell to"     reads the Smart Profile
bring       pick a data posture                              upload · platform pool · your own Apollo/Clay
find        companies that match — with why                  agent proposes, tenant confirms
qualify     briefs: fit, evidence, the smallest ask           agent proposes, tenant decides "worth a message"
people      decision-makers found, enrichment waterfall      hit/miss per provider, honest "no email"
→ Today     the queue exists now
```

**The first week** — G2, put them in motion:

```
segment     who gets which story                             from the qualify verdicts
story       the offer-story per segment (ASSET) and the      story library, gt_content_kinds.scope
            per-person move (MOVE)
cadence     the governor shows the window BEFORE anything    reservations, quiet hours — visible for the first time
            is scheduled
activate    LOCKED — consent/suppression does not exist       PathwayStep.locked + lockedTag, reason on screen
```

**The other lane** — the tenant whose Smart Profile is NOT ready. GTM says
exactly which BRAIN object is missing and links to it; it never re-asks and
never shows a second form. (Old `find` disabled its button and said why; the
new one does not have the button at all — the missing thing is the screen.)

**What breaks today** — written from the retired app and the run logs, not
from taste: the seven zeros; 1,591-line find; offers editable in two places;
`/today` a Brain-completeness card rather than a queue; four built pieces with
no console; consent absent; assisted channels invisible to the governor.

### 2.2 The playground's scenarios (the "director" control)

| Switch | Values | Why it exists |
|---|---|---|
| **Data posture** | I have a list · I have nothing · I have my own Apollo/Clay | the three postures from the outreach note §2; the screens after `bring` are the SAME, which the playground has to prove |
| **Smart Profile** | ready · offers missing | the other lane |
| **Identity** | first-party (Vikuna product) · tenant | first-party may send under the platform's identity; every other tenant sees their own channels. One flag, per the ruling |

### 2.3 Decisions the map forces (Charan, before Sprint 2)

1. **Where does a new GTM tenant land** — G1's first step, or Today?
   Recommend G1; Today is empty until something is in motion.
2. **Is Import a pathway step or a surface?** Recommend: it is the `bring`
   step of G1 in the upload posture. The 2,016-line ETL wizard collapses into
   one step with a mapping preview, and stops being a destination.
3. **Naming.** *Build the audience · Put them in motion · Today* — keep, or
   rename. The playground uses these until told otherwise.
4. **How much of G2 shows while sending is locked.** Recommend: all of it,
   with `activate` locked and the reason on screen. A pathway with a hidden
   last step is the failure rule 12 exists for.
5. **Does the playground show the platform-pool posture at all**, given
   `gt_connectors` does not exist? Recommend yes, labelled as not yet
   connected — the tenant should see what the three postures are before
   choosing the one that works today.

### 2.4 The landing — Vara's shape, the old landing's substance *(Charan, 2026-09-22)*

A tenant signs in and explores agents; each agent has its own landing. GTM's is
`/agents/gtm`, a card in `skills/agents/index.ts` beside Vara's, and it takes
**Vara's chrome** (eyebrow, name, state, one action, "what it does" tiles —
`agents/screens/VaraLanding.tsx`, so GTM's is `GtmLanding.tsx` next to it) and
**the old GTM landing's substance** (`frontend/(app)/today`): the readiness
ring over the BRAIN objects, the weakest one named with why it matters to GTM,
and the one thing to do next.

**It picks up the ICP and the rest from the Smart Profile — it never asks.**
ICP, offers, brand, vocabulary, competitors are read from `gt_tenant_profile`
(the typed projection); each is shown as *captured / missing*, and *missing*
deep-links to the Smart Profile step that owns it.

**And it picks up the triggers.** The landing carries a "what changed" strip
fed by the same events the worker already emits — `KNOWLEDGE_UPDATED`
(something new was read), `PROFILE_COMPLETE` (the brain crossed the line),
research completing. `PROFILE_COMPLETE` has **no consumer today**
(`worker.ts` keeps the ICP agent commented out at the registry) — at
integration GTM's agent subscribes to it, so a profile crossing the threshold
proposes the first audience without being asked. That is an integration item,
not a screen; the playground shows the strip populated.

### 2.5 Two console items are built in Sprint 1, in real code *(Charan, 2026-09-22)*

Both are independent of the GTM playground, both have a live backend, and
Sprint 1 would otherwise change nothing visible — against the working method.
They ship on the **live** transport, not mock.

**S1-a · Settings becomes one place** *(Charan: "models, appearance, BYO — be
inside settings")*. Today `/appearance` and `/model-provider` are two
top-level SYSTEM entries plus a planned `/settings`. They fold into **one
`settings` skill with tabs** — the `model-provider` folder moves to
`settings/screens/`, the old routes redirect:

```
/settings/appearance        themes, mode                       (live, moves)
/settings/model             model provider — platform or your own key   (live, moves)
/settings/data              data provider — your own Apollo / Clay      (placeholder tab: says the backend is not built — rule 12)
/settings/channels          sending identity + channel connections     (Sprint 3, read-only)
```

The three "bring your own" surfaces share one posture shape — platform or
yours, key goes in and never comes back, an empty key means keep the stored
one — so they share one screen pattern and read as one idea. BYOK stays a
menu item, never an onboarding step (ruling 2026-09-16). The SYSTEM group then
shows Settings and Runs & Traces, nothing else.

**S1-b · Knowledge, as sources — not as a graph** *(Charan: "we have not used
'knowledge' or the knowledge graph — how will this get in?")*. The graph is
already fed and already read: the wizard's crawl, the VaNi conversation and
competitor research write `gt_kg_nodes`; `profile.service` projects it,
`research.agent` and `storyteller.agent` read it. What is missing is any UX
layer to CHECK what was fed — "if knowledge is already fed, there is no UX
layer right now to check" — and a way to add to it after the wizard. In vani-app the
Smart Profile shows six projections and no sources; the old `brain/teach` and
`brain/knowledge` have no counterpart.

*A graph viewer is deliberately not built* (CLAUDE.md, "knowledge graph as a
product surface"). Knowledge enters in two ways:

- **On the Smart Profile, a seventh section: "What VaNi has read."** The list
  of sources — site crawl, documents, URLs, a connected folder — each with
  status, and a *Teach VaNi* action (URL · file · paste) that goes to the
  `/ingest` routes already in `serviceURLs.ts` (`submitUrl`, `submitText`,
  `listSources`, `getSource`). `FILE_UPLOADED` / `URL_SUBMITTED` /
  `FOLDER_CONNECTED` → ingestion → `KNOWLEDGE_UPDATED` → profile recalc: the
  whole pipeline exists; this is its door. BRAIN, so it lives on the Smart
  Profile, not inside GTM.
- **In GTM, as provenance on every artefact.** A brief, a segment, a story
  says what it was built from — "your site, 2 documents, 14 competitor
  entries" — and what it did not read (the storyteller already reports the
  nodes it dropped for budget; rule 12). The graph shows up as an evidence
  trail on the decision, never as a diagram.

**Exit:** Charan clicks through every playground scenario and approves, or lists
what to change; Settings and "What VaNi has read" are live on the deployed
stack. Nothing in Sprint 2 starts on an unapproved scene.

---

## 3. Sprint 2 — G0, G1 and People, in real code, mock transport

**Where:** `vani-app/src/skills/` — one folder per skill, one line each in
`src/skills/index.ts`, zero `src/platform/` edits (`gtm-migration-poa.md` §1
established the shell costs nothing).

```
src/skills/gtm-shell/       gtm-nav.ts (the catalog) · GtmShell.tsx (<Shell skills={GTM_SKILLS}>)
src/skills/gtm-audience/    G1 — the pathway: bring · find · qualify · people
                             screens/ one file per step · mock-data.ts (the contract)
src/skills/gtm-people/      the reference surface: list · person
src/app/(gtm)/agents/gtm/   layout.tsx wraps the group in GtmShell; one page per route
```

**Screens, in build order:**

| # | Screen | Built to scene | Posture-aware |
|---|---|---|---|
| 1 | `/agents/gtm` landing — Vara's chrome, the readiness ring, the weakest BRAIN object, the "what changed" strip, one next action (§2.4) | land | Smart Profile ready / missing |
| 2 | G1 · bring — choose posture; upload maps a file; own-provider asks for the key the same way Model Provider does (key goes in, never comes back) | bring | all three |
| 3 | G1 · find — proposed companies with the WHY per row | find | — |
| 4 | G1 · qualify — briefs; fit, evidence, smallest ask; decide | qualify | — |
| 5 | G1 · people — decision-makers, enrichment waterfall | people | — |
| 6 | People list + person — the noun surface; `CONT-0001`-style ids, never raw PKs | people | — |

**The component gap is paid here, once.** The 11 VDF components the audit
counted (`VdfBadge`, `VdfEmptyState`, `VdfStatusBadge`, `VdfDrawer`,
`VdfModal` as native `<dialog>`, `VdfSearchBar`, `VdfTabs`, `VdfToggleGroup`,
`VdfInsightsCard`, `VdfStatCard` → check `VdfKpiCard` first). They land in
`src/platform/vdf/` — **which is a platform edit, and is logged here as the
one platform change request this plan makes.** Built against the four themes,
not ported.

**Definition of done, per screen** (a checklist in the PR, not a sentiment):

- [ ] matches the approved playground scene
- [ ] five states via `<DataBoundary>`; empty state carries a next action
- [ ] `success:false` path written (a refusal, not a network error)
- [ ] writes through `useSkillMutation`; **server half of idempotency listed
      as an integration item** (the header is honoured by no endpoint yet)
- [ ] no hex; checked in Vani dark AND Vani light at minimum
- [ ] ≤ ~400 lines, one decision
- [ ] copy: verbs for pathways, outcomes not table names ("14 worth a message",
      not "14 rows")
- [ ] fixture typed and documented as the contract; divergence from the
      existing skill function's shape noted in the folder's `INTEGRATION.md`

**Exit:** Charan walks the deployed preview in mock mode — landing → G1 end to
end → People, in all playground scenarios. Approve or list changes.

---

## 4. Sprint 3 — Today, Motion, and the four that were never shown

```
src/skills/gtm-today/       G3 — the queue: what has gone quiet, ranked by cost of inaction
src/skills/gtm-motion/      G2 — the pathway: segment · story · cadence · activate(locked)
src/skills/gtm-channels/    the invisible four, READ-ONLY: channels · governor · story library · touch log
```

**Screens, in build order:**

| # | Screen | Built to scene | Note |
|---|---|---|---|
| 7 | Today — the queue, not a Brain card. Empty state on day one says what to put in motion and links to G2 | today | ranked by cost of inaction; the old page becomes the landing's "what GTM knows" strip, not this |
| 8 | G2 · segment — from qualify verdicts, agent proposes, tenant confirms | segment | — |
| 9 | G2 · story — ASSET per segment, MOVE per person; the storyteller's output with what it did not read (rule 12) | story | story library scope comes from `gt_content_kinds` |
| 10 | G2 · cadence — the governor's window for these people, BEFORE scheduling; reservations visible | cadence | first console the governor has ever had |
| 11 | G2 · activate — **locked**, reason on screen: "no consent or suppression model exists yet" | activate | `PathwayStep.locked`; unlock is a schema decision, not a UI one |
| 12 | Channels · Governor policy · Story library · Touch log — read-only surfaces under `gtm-channels`; assisted channels (LinkedIn, X) shown as assisted, and their touches shown consuming slots | — | nothing here sends |
| 13 | Runs strip on the landing — the orchestrator's work on this tenant, linked to `/agents/runs` | land | answers "what did VaNi do" without a new page |

**Gate carried, not fixed:** nothing in Sprint 3 sends. The consent/suppression
schema is a change request to Charan (`design-notes-outreach-and-delivery.md`
§5); until it exists, `activate` stays locked and says so.

**Exit:** the whole product walkable in mock mode: landing → G1 → People →
G2 (to the lock) → Today → the four surfaces. Every screen in 4 themes × 2
modes. Approve, then integration begins.

---

## 5. After Sprint 3 — integration, in one paragraph

Each skill folder's `INTEGRATION.md` lists, per screen: the fixture shape, the
skill function that should return it, and the delta. The order is
`gtm-migration-poa.md` §3 — People (contact-skill, 16 fn, most complete) →
G1 (research + prospect) → Today (attention-skill) → the invisible four
(cadence/story/channel skills) → G2 (campaign/sequence/journey). Where the
delta is a new function, it is a backend slice; where it is a new column, it
is a schema request and waits. Server-side idempotency (store-and-replay, same
transaction) lands with each write endpoint, per `vani-app/CLAUDE.md` §2 — a
write shipped with only the client half is unfinished.

---

## 6. What this plan does not do

- Port `frontend/` pages. They are evidence. `gtm-agent-migration-audit.md`
  stays as the inventory of what the backend can already answer.
- Touch the Smart Profile, the Mission Wizard or `skills/onboarding`. GTM
  reads them and links to them.
- Build a send path, a consent model, `gt_connectors`, or the industry
  taxonomy (Nova's).
- Assign sprint length. Each sprint is scoped by its exit gate; the working
  method says something visible changes within about a week, and Sprint 1 is
  the only one where that is a document rather than a screen.

## 7. Open, needing Charan

| Question | Blocks |
|---|---|
| Approve this plan as the build order | Sprint 1 start |
| The five decisions in §2.3 | Sprint 2 start |
| Consent/suppression schema | unlocking `activate`; nothing in these three sprints |
| Does GTM share `gt_channels` and one cadence budget with Vara? | screen 12's copy, not its existence |
| `PROFILE_COMPLETE` gets GTM's agent as its consumer | integration, not a sprint here — recorded so it is not re-derived |
