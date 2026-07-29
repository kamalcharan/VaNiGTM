# Design notes — Journey Cycle & Campaign Cycle

Status: **proposal, awaiting ruling (v2).** No migrations, no code.

Written in the order the sequencing was set:

> Journey Cycle (skeleton) → Campaign Cycle (skeleton) → what goes into the
> campaign cycle (story) → to whom it goes (contacts of prospect) → Journey
> cycle execution → Campaign cycle execution. Everything agentic with a
> human loop.

**v2 folds in three rulings given after v1:**

1. The story is per journey. **The skeleton's job is deciding the stage of the
   journey**; response and analytics decide whether another story gets written
   or the stage advances.
2. The human writes the story, or uses a Story skill to write it, then hands
   it over to the campaign.
3. **Customer acquisition and LTV are both in scope** — this is a full
   customer journey, not an outreach funnel.

§8 says where I think one of these is wrong.

---

## 0. The seam this closes

Research ends at a **decided brief about a company**: an offer chosen by a
human, a hook, evidence, a fit score with every rejected offer visible.

Nothing carries that to a **person**, in a **state**, with a **message**.

Two things are missing, and only two:

1. **A journey** — what state each account is in, and what is owed next.
2. **A campaign run** — a bounded delivery across many journeys in the same
   state.

Everything else downstream (`gt_campaigns`, `gt_sequences`,
`gt_contact_assignments` with its `identified → … → lost` stage machine) was
built for a different entry point: manual contact entry, then assignment. It
does not know a prospect exists. That is not a defect to repair — it is
machinery to leave dormant until the journey has earned a second touch (§2.4).

---

## 1. Journey Cycle — the skeleton

### 1.1 What it is

**A journey is the durable record of one relationship with one company.**
One journey per `prospect_id` per tenant per environment. It outlives every
campaign, every message, every rep — and, now, every *sale*.

**Why per company, not per person.** The brief is per company. The offer is
chosen per company. The pilot scoreboard counts per company. People change
jobs; the account is the stable unit. Persons hang off the journey as
threads (§4), they do not each get a journey.

**Why it is a cycle and not a pipeline.** A pipeline ends. A journey loops:
*learn → decide → reach → listen → learn again.* A company that says "not
this year" is not lost — it is parked with a reason and a wake date, and the
reason is exactly what the Learning Graph eats.

### 1.2 Two arcs, one ledger

Acquisition and LTV are both in scope, so `won` is a **doorway, not a
terminus**. One journey row, one append-only ledger, an `arc` column:

**Arc 1 — Acquisition**

| State | Means | Moved by | Owed next |
|---|---|---|---|
| `sourced` | In a cohort. Nothing learned. | cohort build / import | research |
| `researched` | Brief exists, undecided | research agent | a human decision |
| `qualified` | Human picked an offer | human — `decide_brief` | a person |
| `ruled_out` | Human said no fit | human — `decide_brief` | nothing, but the **reason** is kept |
| `addressed` | A contact with a working channel is confirmed | human confirms agent proposal | a story |
| `ready` | An approved story exists for this account | human writes / approves | delivery |
| `waiting` | Delivered. Response window open. | campaign run | patience, then a verdict |
| `answered` | A human answer arrived | human logs outcome | **the stage decision (§1.4)** |
| `parked` | A fit, wrong moment. `reason` + `wake_at`. | human, or agent proposal | re-entry at `wake_at` |
| `lost` | Played it out, no sale | human | nothing |
| `won` | Became a customer | human | **hand to Arc 2** |

**Arc 2 — Lifetime** (declared now, built later — see §8.3)

`onboarding → active → expanding | at_risk → renewed | churned | advocate`

The two arcs share the same journey row and the same event log. That costs
nothing today and saves a migration and a data backfill later.

**The commitment ladder already spans both arcs.** `gt_offers.commitment`
(entry / project / retainer) and `chooseOffer`'s lowest-ask-within-margin
rule were built for fit scoring — but an entry offer is an *acquisition*
instrument and a retainer is an *LTV* instrument. `laddered_from` is already
recording "we could have asked for the retainer and asked for the entry
instead." That is an LTV mechanic that exists in the data today.

### 1.3 What is new and what is not

Most of Arc 1 is not new data — it is a spine for pieces that already exist:

- `sourced` / `researched` / `qualified` / `ruled_out` are already computable
  from `gt_prospects` + `gt_account_briefs.status`.
- `waiting` / `answered` are already computable from `gt_touch_log`.
- **Genuinely new: `addressed`, `ready`, `parked`, `won` / `lost`.**

State is still stored explicitly rather than derived, for one reason: a
journey must carry a **reason**, a **wake date**, an **owner**, and now an
**arc**. A derivation holds none of those.

### 1.4 The stage decision — the actual loop

This is the heart of it, and it is the one thing the skeleton exists to serve.

When an outcome lands, the journey sits at `answered` and exactly one
question is open:

> **Another story, or does the stage move?**

The agent proposes with the evidence in hand: what was sent, what came back,
how many stories this journey has already had, what the fit lessons say
about accounts that answered this way. The human rules. The three outcomes:

| Ruling | Journey goes to |
|---|---|
| Another story — same stage, new angle | `addressed` (a new story is owed) |
| The stage moves | forward — or to `won` |
| Enough | `parked` (with a wake date) or `lost` (with a reason) |

**`ready` is therefore repeatable.** A journey can be `ready` many times.
Each approved story is a distinct artifact and a distinct campaign run.
Story 3 on an account is normal; the ledger shows all three and what each
one got.

### 1.5 The rules

- **R-J1 — No silent regression.** A journey may move backwards
  (`answered → addressed`), but a backward move carries a reason. Rule 12
  applied to relationships.
- **R-J2 — Three human gates, and only three.** The offer (exists today),
  the person (§4), the story (§3). Plus the stage decision (§1.4), which is
  a *ruling* on an agent proposal, not a fourth gate to invent. Everything
  else the agent may propose *and write*.
- **R-J3 — A campaign never advances a journey for its own convenience.** A
  campaign may move `ready → waiting`, and `waiting → answered` when an
  outcome is logged. Nothing else, ever.
- **R-J4 — The journey log is append-only.** Every transition writes actor,
  from, to, reason. The current state is a cache of the log's tail; the log
  is the truth.
- **R-J5 — R7 holds.** Changing a rule (offers, lessons, industry mapping)
  does not re-open a journey past `qualified`. A human decision is a fact,
  not a cached computation.

---

## 2. Campaign Cycle — the skeleton

### 2.1 The standing ruling, restated

> "Campaign is just a delivery partner … context is driven by journey."

Everything below follows from that sentence. The new ruling sharpens it: the
story is written **before** the campaign exists and is **handed to** it. A
campaign never authors anything.

### 2.2 What it is

**A campaign run is one channel, one step, delivering already-approved
stories across a frozen set of journeys that were all in the same state at
approval time.**

| State | Means |
|---|---|
| `draft` | A filter (segment / journey state / offer) and a channel are picked. Nothing resolved. |
| `staged` | Agent resolved the filter into members — one per journey, each carrying its approved story. **Nothing sent.** |
| `approved` | A human read the staged list and pressed go. **Membership freezes here.** |
| `delivering` | Sends happen. Pilot: a human checklist, each send logged. Later: a sender. |
| `concluded` | Every member has an outcome, or its window has closed. |

**Why membership freezes at approval.** The same discipline as
`gt_touch_log.had_brief`: if the member list can move after go, the
denominator moves and the reading stops meaning anything. You approved four
companies; the run is about those four forever.

### 2.3 What a campaign may not do

- Write or edit a story.
- Change a journey's offer.
- Invent a contact.
- Send to a journey not in its approved member list.
- Touch the same journey twice within one run.

A journey passes through many campaign runs over its life — one per story.
**A campaign run touches a journey once.**

### 2.4 Relationship to the existing campaign tables

`gt_campaigns` is a container built for multi-step sequences with day
offsets (`gt_sequences` → `gt_sequence_steps` → `gt_step_templates`, with
A/B variants). In the journey model a run is **one step**, and the second
touch is not a scheduled follow-up — it is a *new story a human decided to
write* (§1.4).

Proposal: **leave `gt_sequences` and its children dormant.** Add
`gt_campaign_runs` + `gt_campaign_members`; let a run optionally reference a
`gt_campaigns` row (nullable) so pilot runs stand alone and can later be
grouped without a rewrite.

---

## 3. What goes into the campaign — the story

### 3.1 Two scopes of content, one skill

Storyteller's purpose is **nurturing customer-journey content**. The deck is
the first *form* it took, not the boundary of the job. The right split is
not deck-vs-message, it is **who the content is about**:

| Scope | About | Written | Reused | Examples |
|---|---|---|---|---|
| **Asset** | **us** | once | across every journey | deck, one-pager, case study, offer explainer |
| **Move** | **them** | per journey | never | the outreach story, the follow-up, the meeting recap, the proposal note |

A move **carries** assets. *"Here is what I noticed about your plant → here
is the offer → here is the six-slide deck on how it worked elsewhere."* The
argument is per account; the proof is reused.

Both are authored by the same spine, which `buildDeck` already implements:
**load context → load prompt → `callLLMValidated` against a schema → persist
at `awaiting` → human approves → it becomes usable.** What varies by content
kind is the schema, the prompt key, and the inputs. That spine is worth
extracting rather than duplicating.

### 3.2 The story (a move) as an artifact

**The story belongs to the journey**, not to a campaign member. It is
written before any campaign exists, survives the campaign, and a journey
accumulates several over its life.

Each story carries: a sequence number within the journey, an author
(`human` | `agent`), a status (`draft` → `approved` → `sent`), the offer it
argues, the assets it attaches, its evidence trace, and — once concluded —
what it got.

**Two ways one gets written, both ending at the same gate:**

- **Human writes it.** Straight to `draft`, human approves.
- **Agent drafts it** from the brief's `hook` + `raw_evidence`, the decided
  offer, the person's role, the accepted fit lessons, the assets available
  for this stage, and the ledger of what earlier stories on this journey
  already said. Human edits and approves.

### 3.3 Content is stage-addressed — this is the nurture engine

Every asset and every story declares the **arc and stage(s) it serves**. A
journey at `addressed` needs different content from one at `answered` after
a *"not now"*, and both differ from an Arc-2 account being onboarded.

That tagging is what turns a content library into nurture: the stage
decision (§1.4) becomes *"given this stage and what came back, which angle
and which asset next?"* — a question the agent can propose against and a
human can rule on. Arc 2 is almost entirely this: onboarding content,
expansion content, advocacy content, same table, same gate.

### 3.4 Rules

- **R-S1 — Nothing unsupported ships, and the two scopes are evidenced
  differently.** Claims about the **prospect** trace to a `raw_evidence`
  entry on that prospect's brief. Claims about the **tenant** trace to an
  approved asset. Neither may be invented at send time. This is what makes
  `pilot_result`'s qualitative gate enforceable rather than aspirational:
  *"if a researched message says roughly what a template would have said, the
  research did no work."* It binds an agent draft and a human draft equally.
- **R-S2 — A story cannot repeat a previous story's argument.** The drafter
  reads the journey's earlier stories. "Another story" that says the same
  thing again is not another story.
- **R-S3 — The human approves the text, not a template.** At pilot scale
  that is four reads. Bulk approval needs its own ruling (D5).
- **R-S4 — An asset is approved once, a move is approved every time.** An
  asset is reusable precisely because its claims were vetted at authoring
  time. A move is about a specific company and is vetted per instance.

---

## 4. To whom it goes — contacts of the prospect

The pieces exist: `gt_contacts.prospect_id` (migration 196), the assignments
FK already re-pointed to `gt_contacts` (migration 187), and the brief
already carries `named_contacts` JSONB from extraction.

The missing step is one promotion: **a named contact in a brief becomes a
real `gt_contacts` row**, `source = 'research'`, carrying the evidence URL it
came from, with a human confirming role + channel. That confirmation *is*
the `addressed` gate.

- **R-C1 — No invented people.** If the brief named nobody, the journey sits
  at `qualified` and says so. It does not guess `info@` and call itself
  addressed. Rule 12 applied to people — a fabricated recipient is the most
  expensive silent fallback in the product.
- **R-C2 — A person carries a channel or does not count.** A name with no
  reachable address does not satisfy `addressed`.

---

## 5. Journey cycle execution

New events on the existing bus, dispatched by the existing worker, parking
at `awaiting` through the existing `agent.runner` human-in-the-loop path:

| Event | Agent proposes | Human answers |
|---|---|---|
| `CONTACTS_PROPOSED` | promote named contacts → people with channels | confirm / correct / reject → `addressed` |
| `STORY_REQUESTED` | draft a story for this journey (skipped when the human writes it) | edit / approve → `ready` |
| `STAGE_DECISION_REQUESTED` | after an outcome: another story, advance, or stop — with the reason | rule (§1.4) |

No new human-loop machinery. `awaiting` + `awaiting_input` + a REST response
is the pattern already carrying the brief decision and the lesson ratchet.

---

## 6. Campaign cycle execution

`draft → staged` is an agent run: resolve the filter, attach each journey's
approved story, park for approval. `approved → delivering` is human-paced at
pilot scale — each send logged through the existing `log_touch`, so
`had_brief` stays frozen at log time and `pilot_result` reads through
unchanged. A run concludes when every member has an outcome or its window
has closed; concluding emits `STAGE_DECISION_REQUESTED` per member, which is
where the loop closes back into §1.4.

The scoreboard does not change. That is the point: these cycles go
*underneath* a measurement that already works, not alongside a new one.

---

## 6b. Correction — the map, and the light on it

Ruled after the agenda prototype, and it changes §1 rather than adding to it.
Reconciled against `VaNiGTM_Customer_Journey_Agents_Spec.md` v0.1, which
already specified most of the machinery this needs.

### 6b.1 The agenda is a trigger, not the workspace

The agenda is right, and it is a **live query over states + modifiers**
(Agents Spec §4.2 — *"lists are live queries, never exports"*). It tells you
something is owed. It is not where you decide what to say.

That happens on the **opportunity page**: all the data, all the history, the
whole argument, and only then a trigger. Prototype:
`gtm-engine-ui/journey-opportunity.html`.

### 6b.2 A journey is a mindmap, not only a ladder

A ladder has one position. A real conversation is multi-threaded — interested
in one thing, objected on a second, gone quiet on a third — and flattening
that into a single state throws away the part you write from.

**Two structures, orthogonal:**

| | What it answers | Where it lives |
|---|---|---|
| **State** | Where does this opportunity stand? | `gt_journeys.state` |
| **Map** | What is there to talk about? | nodes — Agents Spec §8.1 `node_type: pain_point \| value_prop` |

A node carries its own evidence, its own status (`unraised / raised /
engaged / objected / resolved`), and what has already been said at it.
**A story is written AT a node**, and R-S2 ("cannot repeat a previous
story's argument") becomes checkable rather than aspirational: it is the
same node or it is not.

### 6b.3 Freshness is the light source

Agents Spec §8.3 already fixes the maths — every observation weighs
`exp(-Δdays / half_life)`, half-life 60 days. What was missing was making it
**visible and binding**:

- A node is lit by its **freshest** evidence, not its average. One live fact
  makes a topic openable however old its background is.
- Seven months is ×0.03. That node goes dark on the map and **the trigger
  refuses it** — not a warning, a block. An old fact is a footnote, never an
  opening.
- Bands: `≥.80` fed this month · `≥.50` inside the half-life · `≥.20` fading,
  usable as support but weak as an opening · below that, stale.

This is the same instinct as R-S1. R-S1 stops us asserting what we cannot
evidence; this stops us opening with something that stopped being true.

### 6b.4 Signals push — the trigger is not a timer

Exchange filings (NSE/BSE), concall transcripts, site visits and replies
arrive **dated**, so they land at full weight, attach to a node, relight it,
and push the opportunity back onto the agenda. A filing is not a reminder to
follow up. It is a new thing to say.

These are `gt_event_log` rows (Agents Spec §7.3) with a node reference — no
new substrate, and the story recompute already keys off them.

### 6b.5 Two open questions this raises

- **Q5 — the two state vocabularies.** Migration 222 ships an *operational*
  ladder (`sourced → researched → qualified → addressed → ready → waiting →
  answered → won`). The Agents Spec §4.1 defines a *behavioural* one
  (`UNKNOWN → AWARE → CONSIDERING → QUALIFIED → COMMITTED → ACTIVE → DORMANT
  / LOST / ADVOCATE`). These are not the same axis: mine says what WE owe,
  the spec's says where THEY stand. My reading is that both are real and
  should coexist — `state` and `posture` — but that has to be ruled on, not
  assumed. Collapsing them would lose one of the two questions.
- **Q6 — colour is spent on freshness, not node type.** The map cannot
  colour-code both `pain_point` vs `value_prop` and hot vs stale without the
  two fighting. Freshness won because it changes what you may do. Node type
  is shown on selection instead. Worth confirming.

---

## 7. Analytics' actual role

The ruling says response and analytics decide whether another story is
written. Agreed on direction, with one correction of scale: **at four sends
there is no analytics.** Any threshold computed on four outcomes is noise
wearing a number — the same reason `pilot_result` withholds a verdict below
twenty concluded sends.

So: build the loop as **human ruling on an agent proposal**, with the agent
citing whatever evidence exists (this journey's history, the lessons, the
brief). Let analytics *inform* the proposal as the numbers accumulate, and
never let it *trigger* a story on its own. An automatically written story is
a send nobody decided.

---

## 8. Where I disagree

### 8.1 ~~"Story skill" should not be storyteller-skill~~ — withdrawn

**v1 said stories should live outside `storyteller-skill` because a deck
cannot satisfy the evidence rule. That was judging the skill by its current
output rather than its job, and it was wrong.** Storyteller's purpose is
nurturing customer-journey content; the deck is the first form, not the
boundary.

The concern behind it was real and survives in a better shape: a deck is
about **us** and an outreach story is about **them**, and those are
evidenced from different sources. §3.4 R-S1 now says exactly that — prospect
claims trace to a brief, tenant claims trace to an approved asset — which
dissolves the conflict instead of splitting the skill. One authoring skill,
two content scopes.

**What that means for the existing code:**

- The `buildDeck` spine (context → prompt → `callLLMValidated` → `awaiting`
  → approve) is the reusable part. Extract it; it already does the right
  thing including refusing to write a half row on validation failure.
- `DeckSchema` stays as the deck kind's contract. Each new kind brings its
  own schema and its own prompt key under `storyteller-skill.*` (the deck
  keeps `vani-skill.generate_slides`, reused as-is as it is today).
- `gt_presentations` becomes the home for **assets** of every kind rather
  than a second content table being created beside it — one home, or the
  library forks in two. Add `kind`, `arc`, `stages TEXT[]`, and a `body`
  JSONB backfilled from `slides`; leave the table rename to POA Phase 2
  with the other renames. The `slides` column carrying a one-pager would be
  ugly, which is why `body` goes in now and `slides` is left deprecated
  rather than reused. → **D7**
- The public `share_token` route already works for any asset kind. That is
  the mechanism by which a move attaches proof.
- Moves (`gt_journey_stories`) are a separate table because they are
  journey-scoped, approved per instance, and never reused — not because they
  are a different skill.

### 8.2 "Customer journey map" — we are building a ledger, not a map

A customer journey map, in the usual sense, is a **template**: awareness →
consideration → decision → retention → advocacy, drawn once per persona,
describing what customers *generally* do.

What is being described here is a **ledger**: per account, actual state,
actual history, actual reasons, with a human ruling at each fork.

The difference is not vocabulary. If we build a map, the system's job
becomes *inferring* which stage a customer is at — and inference is exactly
where a silent fallback would creep back in ("they opened it twice, they're
probably in consideration"). If we build a ledger, the system only ever
records what happened and what a human decided, and the map becomes a *view
over* the ledger — a real one, drawn from actual accounts.

**Recommendation:** ledger first. The map is an output, and it will be a
better map for being measured rather than drawn.

### 8.3 Declare Arc 2 now, build Arc 1 only

LTV in scope is right, and the `arc` column should exist from the first
migration. But modelling `onboarding / active / expanding / at_risk /
renewed / churned / advocate` in detail today — with zero customers and four
pilot sends — is the instrument-perfecting trap again. Every state we build
before we can exercise it is a state we will get wrong and then have to
migrate.

**Recommendation:** the schema admits two arcs; only Arc 1 gets states,
transitions and screens now. `won` writes `arc = 'lifetime'` and parks there
until there is a real customer to learn the next state from.

---

## 9. Decisions needed before code

| # | Question | Recommendation |
|---|---|---|
| **D1** | Journey per company, people as threads? | Yes |
| **D2** | New `gt_campaign_runs` (nullable link to `gt_campaigns`), sequences dormant? | Yes — the second touch is a new story, not a scheduled follow-up |
| **D3** | Eleven Arc-1 states — too many? | Keep them. The four exit states carry different reasons, and the reasons are the learning signal. |
| **D4** | Does `parked` auto-wake at `wake_at`? | Surface only. An automatic wake is a send nobody decided. |
| **D5** | Bulk story approval — now or later? | Later |
| **D6** | A journey for every cohort member, or only from `researched`? | Every member. The sourced→researched gap is a number worth seeing. |
| **D7** | ~~Generalise `gt_presentations`, or a new table beside it?~~ | **RULED.** Generalise, *and* `kind` is an open registry (`gt_content_kinds`), never a CHECK constraint — kinds arrive one at a time forever. See `POA-journey-campaign.md` §1. |
| **D8** | Build Arc 2 states now? | No — declare the arc, build Arc 1 (§8.3) |

---

## 10. Schema sketch (shape only — not migrations)

```
gt_journeys              one row per (tenant, is_live, prospect_id)
  arc ('acquisition'|'lifetime'), state, state_reason, wake_at,
  owner_id, offer, contact_id, entered_state_at, story_count

gt_journey_events        append-only; actor, from_state, to_state, reason, payload

gt_presentations         THE ASSET LIBRARY (about us, reused, approved once)
  + kind ('deck'|'one_pager'|'case_study'|'explainer')
  + arc, stages TEXT[]          -- what this asset is for
  + body JSONB                  -- backfilled from slides; slides deprecated
  (existing: title, status, share_token, approved_at)

gt_journey_stories       THE MOVES (about them, per journey, approved each time)
  journey_id, seq, author ('human'|'agent'), offer, stage,
  subject, body, asset_ids BIGINT[], evidence_refs,
  status ('draft'|'approved'|'sent'), approved_by, approved_at

gt_campaign_runs         campaign_id (nullable), channel, filter, status,
                         staged_at, approved_at, approved_by, concluded_at

gt_campaign_members      run_id, journey_id, story_id, contact_id,
                         touch_id, outcome — frozen at approval
```

Nothing is written until D1–D8 are ruled on.
