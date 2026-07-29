# Design notes — Journey Cycle & Campaign Cycle

Status: **proposal, awaiting ruling.** No migrations, no code. Written in the
order the sequencing was set:

> Journey Cycle (skeleton) → Campaign Cycle (skeleton) → what goes into the
> campaign cycle (story) → to whom it goes (contacts of prospect) → Journey
> cycle execution → Campaign cycle execution. Everything agentic with a
> human loop.

Depth is front-loaded on §1 and §2 because those two are what needs a ruling
before anything else can be built honestly. §3–§6 declare shape, not detail.

---

## 0. The seam this closes

Research ends at a **decided brief about a company**: an offer chosen by a
human, a hook, evidence, a fit score with every rejected offer visible.

Nothing carries that to a **person**, in a **state**, with a **message**.

Two things are missing, and only two:

1. **A journey** — what state each account is in, and what is owed next.
2. **A campaign run** — a bounded delivery across many journeys that are all
   in the same state.

Everything else downstream (`gt_campaigns`, `gt_sequences`,
`gt_contact_assignments` with its `identified → … → lost` stage machine) was
built for a different entry point — manual contact entry, then assignment.
It does not know a prospect exists. That is not a defect to repair, it is
machinery to leave dormant until the journey has earned a second touch (§2.4).

---

## 1. Journey Cycle — the skeleton

### 1.1 What it is

**A journey is the durable record of one relationship with one company.**
One journey per `prospect_id` per tenant per environment. It outlives every
campaign, every message, every rep.

**Why per company, not per person.** The brief is per company. The offer is
chosen per company. The pilot scoreboard counts per company. People change
jobs; the account is the stable unit. Persons hang off the journey as
threads (§4), they do not each get their own journey.

**Why it is a cycle and not a pipeline.** A pipeline ends. A journey loops:
*learn → decide → reach → listen → learn again.* A company that says "not
this year" is not lost — it is parked with a reason and a wake date, and the
reason is exactly what the Learning Graph eats.

### 1.2 The states

| State | Means | Moved by | What is owed next |
|---|---|---|---|
| `sourced` | In a cohort. Nothing learned. | cohort build / import | research |
| `researched` | Brief exists, undecided | research agent | a human decision |
| `qualified` | Human picked an offer | human — `decide_brief` | a person |
| `ruled_out` | Human said no fit | human — `decide_brief` | nothing, but the **reason** is kept |
| `addressed` | A contact with a working channel is confirmed | human confirms agent's proposal | a story |
| `ready` | An approved message exists for this account | human approves | delivery |
| `waiting` | Delivered. Response window open. | campaign run | patience, then a verdict |
| `answered` | A human answer arrived | human logs outcome | a next move |
| `parked` | Fit, but not now. Carries `reason` + `wake_at`. | human, or agent proposal | re-entry at `wake_at` |
| `closed` | Ran its course — won or lost | human | nothing |

Three terminal-ish states, deliberately distinct, because they mean
different things and the difference is the whole learning signal:
`ruled_out` = never a fit. `parked` = a fit, wrong moment. `closed` = we
played it out.

### 1.3 What is new and what is not

Most of this is not new data — it is a spine for pieces that already exist:

- `sourced` / `researched` / `qualified` / `ruled_out` are already computable
  from `gt_prospects` + `gt_account_briefs.status`.
- `waiting` / `answered` are already computable from `gt_touch_log`.
- **Genuinely new: `addressed`, `ready`, `parked`.**

The state is still stored explicitly rather than derived, for one reason: a
journey must carry a **reason**, a **wake date**, and an **owner**. A
derivation cannot hold any of those.

### 1.4 The rules

- **R-J1 — No silent regression.** A journey may move backwards
  (`answered → parked`), but a backward move must carry a reason. Rule 12
  applied to relationships.
- **R-J2 — Three human gates, and only three.** The offer (exists today),
  the person (§4), the message (§3). Everything else the agent may propose
  *and write*. Anything externally visible waits for a human.
- **R-J3 — A journey is never advanced by a campaign's convenience.** A
  campaign may only move a journey `ready → waiting`, and `waiting →
  answered` when an outcome is logged. Nothing else.
- **R-J4 — The journey log is append-only.** Every transition writes a row
  with actor, from, to, reason. The current state is a cache of the log's
  tail; the log is the truth.
- **R-J5 — R7 holds.** Changing a rule (offers, lessons, industry mapping)
  does not re-open a journey that has already moved past `qualified`. The
  human decision is a fact, not a cached computation.

---

## 2. Campaign Cycle — the skeleton

### 2.1 The standing ruling, restated

> "Campaign is just a delivery partner … context is driven by journey."

Everything below follows from that one sentence.

### 2.2 What it is

**A campaign run is one channel, one story shape, one step, delivered across
a frozen set of journeys that were all in the same state at approval time.**

| State | Means |
|---|---|
| `draft` | A filter (segment / journey state / offer) and a channel are picked. Nothing resolved. |
| `staged` | Agent resolved the filter into members — one per journey — each with a rendered message. **Nothing sent.** |
| `approved` | A human read the staged list and pressed go. **Membership freezes here.** |
| `delivering` | Sends happen. Pilot: a human checklist, each send logged. Later: a sender. |
| `concluded` | Every member has an outcome, or its window has closed. |

**Why membership freezes at approval.** Same discipline as
`gt_touch_log.had_brief`: if the member list can move after approval, the
denominator moves and the reading stops meaning anything. You approved 4
companies; the run is about those 4 forever.

### 2.3 What a campaign may not do

- Change a journey's offer.
- Invent a contact.
- Send to a journey not in its approved member list.
- Touch the same journey twice within one run.

A journey passes through many campaign runs over its life. **A campaign run
touches a journey once.**

### 2.4 Relationship to the existing campaign tables

`gt_campaigns` is a container built for multi-step sequences with day
offsets (`gt_sequences` → `gt_sequence_steps` → `gt_step_templates`, with
A/B variants). In the journey model a campaign run is **one step**.

Proposal: **leave `gt_sequences` and its children dormant.** Building the
sequence runner now would be perfecting the instrument again — a second
touch is only meaningful once a first touch has produced an answer worth
following. Add `gt_campaign_runs` + `gt_campaign_members`; let a run
optionally reference a `gt_campaigns` row (nullable) so pilot runs can stand
alone and later be grouped without a rewrite. → **decision D2.**

---

## 3. What goes into the campaign — the story

**The story is per journey, not per campaign.** A campaign carries a
*shape*: angle, offer, channel, length. The agent renders **one message per
journey** from four inputs:

1. the brief's `hook` and `raw_evidence`,
2. the decided offer (`human_offer` if set, else `recommended_offer`),
3. the person's role (§4),
4. the ratified fit lessons (`gt_fit_lessons`, accepted only).

- **R-S1 — Nothing unsupported ships.** Every factual claim in a message
  traces to a `raw_evidence` entry on that brief, or it is cut. This is what
  makes the qualitative gate in `pilot_result` enforceable rather than
  aspirational: *"if a researched message says roughly what a template would
  have said, the research did no work."*
- **R-S2 — The human approves the text, not a template.** At pilot scale
  (4 companies) that is four reads. Bulk approval with spot checks is a
  later problem and needs its own ruling.

---

## 4. To whom it goes — contacts of the prospect

The pieces are already in place: `gt_contacts.prospect_id` exists
(migration 196), the assignments FK was re-pointed to `gt_contacts`
(migration 187), and the brief already carries `named_contacts` JSONB from
extraction.

The missing step is one promotion: **a named contact in a brief becomes a
real `gt_contacts` row**, with `source = 'research'`, carrying the evidence
URL it came from, and a human confirms role + channel. That confirmation
*is* the `addressed` gate.

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
| `STORY_REQUESTED` | render the message for this journey | approve / edit → `ready` |
| `JOURNEY_REVIEW_REQUESTED` | next move for stalled journeys (park, re-touch, close) with a reason | ratify |

No new human-loop machinery. `awaiting` + `awaiting_input` + a REST response
is the pattern already carrying the brief decision and the lesson ratchet.

---

## 6. Campaign cycle execution

`draft → staged` is an agent run: resolve the filter, render a message per
member, park for approval. `approved → delivering` is human-paced at pilot
scale — each send is logged through the existing `log_touch`, so
`had_brief` is still frozen at log time and `pilot_result` reads through
unchanged. A run concludes when every member has an outcome or its window
has closed.

The scoreboard does not change. That is the point: the journey and campaign
cycles are being added *underneath* a measurement that already works, not
alongside a new one.

---

## 7. Decisions needed before code

| # | Question | Recommendation |
|---|---|---|
| **D1** | Journey per company, with people as threads? | Yes — the brief, the offer, and the scoreboard are all per company. |
| **D2** | New `gt_campaign_runs` (+ nullable link to `gt_campaigns`), sequences dormant? | Yes — one step until a first touch earns a second. |
| **D3** | Are all ten journey states real, or is that too many for v1? | Keep ten. The three terminal states carry different reasons, and the reasons are the learning signal. |
| **D4** | Does a `parked` journey wake automatically at `wake_at`, or only surface for a human? | Surface only. An automatic wake is a send nobody decided. |
| **D5** | Bulk message approval — now or later? | Later. Four reads at pilot scale; the rule for bulk needs its own ruling. |
| **D6** | Does a journey exist for every cohort member, or only from `researched` onward? | Every cohort member. `sourced` is a real state and the gap between sourced and researched is a number worth seeing. |

---

## 8. Schema sketch (not migrations — shape only)

```
gt_journeys              one row per (tenant, is_live, prospect_id)
  state, state_reason, wake_at, owner_id,
  offer, contact_id, entered_state_at

gt_journey_events        append-only; actor, from_state, to_state, reason, payload

gt_campaign_runs         campaign_id (nullable), channel, offer, story_shape,
                         status, staged_at, approved_at, approved_by, concluded_at

gt_campaign_members      run_id, journey_id, contact_id, message_subject,
                         message_body, approved, touch_id, outcome
                         — frozen at approval
```

Nothing here is written until D1–D6 are ruled on.
