# POA — Journey Cycle & Campaign Cycle

**v1.0 · 2026-07-29** · companion to `design-notes-journey-campaign.md`
(read that first for the *why*; this is the *order*).

---

## 0. The organising principle

> "Story building skill is the max time we will take, I don't think it will
> come out so easily … there will be a lot many skills we will have to add
> one by one … it's a long game."

Agreed, and there is a hard reason it cannot be rushed: **there is no schema
that makes a message good.** Fit scoring could be tuned against a human
ruling the same day. A story can only be tuned against *replies*, and
`pilot_result` withholds a verdict below twenty concluded sends. The story
generator therefore **cannot** be tuned before the pilot produces answers.

Everything in this plan follows from that one dependency:

> **Build the journey so it works with a human-written story. Add the
> generator afterwards, one content kind at a time, tuned on real replies.**

The alternative — waiting for a good generator before shipping the journey —
means the pilot never sends, so no replies exist, so the generator never gets
tuned. That loop has to be broken at the human-written end.

---

## 1. D7, ruled — kinds are data, not an enum

The ruling: a content kind can be a presentation, an email, a WhatsApp
reminder, a success story, an experience, a piece of gyan, LinkedIn chasing —
and more will keep arriving.

**Consequence: `kind` must never be a CHECK constraint.** One migration per
new kind, forever, is not a long game — it is a tax on it. Kinds live in a
registry table, seeded like `gt_prompts` (system rows + tenant overrides).

**Adding a kind becomes: one registry row + one prompt + one Zod schema.
No migration.**

The named kinds sort cleanly into the two scopes from §3.1 of the design note:

| Kind | Scope | Channel | Notes |
|---|---|---|---|
| presentation / deck | asset | — | exists today (`gt_presentations`, `DeckSchema`) |
| success story | asset | — | about a *third party*, still reused |
| experience | asset | — | |
| gyan | asset | — | thought-leadership; the backbone of long nurture |
| email | move | email | first move kind to build |
| WhatsApp reminder | move | whatsapp | short form, different rules |
| LinkedIn chasing | move | linkedin | |

This sharpens the asset definition: **an asset is content that is not about
the recipient.** A success story is about someone else's plant, not ours and
not theirs — and it is still written once and reused. "Not about the
recipient" is the line that actually holds.

```
gt_content_kinds     kind, scope ('asset'|'move'), channel (nullable),
                     schema_key, prompt_key, arc, stages TEXT[],
                     is_system, tenant_id (nullable), is_active
```

---

## 2. Phases

Each phase is shippable and leaves the product working. No phase depends on
a later one.

### Phase 1 — The journey ledger *(the spine)*

| | |
|---|---|
| Migrations | `gt_journeys`, `gt_journey_events` |
| Backfill | one journey per existing prospect; state derived once from `gt_prospects` + `gt_account_briefs.status` + `gt_touch_log`, then owned by the ledger |
| Skill | `journey-skill`: `get_journey`, `list_journeys`, `advance_journey`, `park_journey` |
| UI | journey state on `/prospects`; a journey panel on the dossier |
| Done when | every prospect has a journey, every transition writes an event, and the ledger reproduces today's brief/touch reality without contradicting it |

`arc` ships in this migration (`acquisition` / `lifetime`) even though only
Arc 1 gets states. That column costs nothing now and saves a backfill later.

### Phase 2 — The person *(the `addressed` gate)*

| | |
|---|---|
| Migrations | none expected — `gt_contacts.prospect_id` (196) and the FK re-point (187) are already in place |
| Skill | `promote_contact` (brief `named_contacts` → `gt_contacts`, `source='research'`, carrying its evidence URL) |
| Agent | `CONTACTS_PROPOSED` — proposes, parks at `awaiting` |
| UI | confirm/correct/reject on the dossier |
| Done when | R-C1 holds: a brief that named nobody leaves the journey at `qualified` and says so — no `info@` guessing |

### Phase 3 — The story: human-written, AI-recommended *(unblocks the pilot)*

**Ruled:** the human writes the words. The agent recommends the **topic and
context** — which angle, which evidence from the brief, which offer, which
stage-appropriate asset. Not the prose.

That split is not a compromise, it is the only part that can be tuned early.
A topic recommendation is judged the moment a human accepts or discards it —
a signal available at n=4. Prose can only be judged by reply rate, which
needs ~20 concluded sends. So the recommender starts learning immediately
while the generator waits for the pilot to answer.

| | |
|---|---|
| Migrations | `gt_content_kinds` (+ seed `email`), `gt_journey_stories` |
| Skill | `create_story`, `approve_story`, `list_stories`, `recommend_topic` |
| Agent | `STORY_TOPIC_REQUESTED` — proposes angle + evidence + asset, parks at `awaiting`. Never prose. |
| UI | the recommendation beside an empty box the human types into; the journey's earlier stories visible while writing (R-S2) |
| Done when | four pilot stories are written, approved, and the journeys read `ready` |

**This is the phase that lets the pilot send.**

### Phase 4 — The campaign run *(delivery)*

| | |
|---|---|
| Migrations | `gt_campaign_runs`, `gt_campaign_members` |
| Skill | `campaign-run`: `stage_run`, `approve_run`, `deliver_member`, `conclude_run` |
| Wiring | `deliver_member` calls the existing `log_touch` — `had_brief` still frozen at log time, `pilot_result` reads through unchanged |
| UI | a run screen: staged list → approve → send checklist |
| Done when | the four sends go out through a run and the scoreboard counts them exactly as it does today |

Membership freezes at `approved`. `gt_sequences` stays dormant.

### Phase 5 — The stage decision *(closes the loop)*

| | |
|---|---|
| Agent | `STAGE_DECISION_REQUESTED` on run conclusion — proposes *another story / advance / park / lost* with its reason, parks at `awaiting` |
| Inputs | this journey's story ledger, the outcome, accepted fit lessons, the brief |
| UI | a decision card; the ruling writes a journey event |
| Done when | an outcome on a real send produces a proposal a human can rule on, and the journey moves with a recorded reason |

This is the point at which the thing becomes a *cycle* rather than a line.

### Phase 6 — The story generator *(the long game — kind by kind)*

One kind at a time, each on the same ladder, none started before the
previous kind has produced replies to learn from:

1. **email** — the pilot's channel, the only one with data
2. **LinkedIn chasing** — different length and register
3. **WhatsApp reminder** — short form, different rules entirely

Per kind: a Zod schema → a seeded prompt → a registry row → agent drafting
into `draft` → human edits and approves → measured against the same reply
rate as the human-written ones.

**The measurement that matters:** an agent-drafted story must beat the
human-written baseline from Phase 3 on reply rate *and* pass R-S1 (every
prospect claim traces to that brief's evidence). A generator that writes
faster but says what a template would have said has done no work — that is
`pilot_result`'s qualitative gate, and it applies to the generator first.

### Phase 7 — The asset library *(nurture content)*

| | |
|---|---|
| Migration | generalise `gt_presentations`: `kind`, `arc`, `stages TEXT[]`, `body` JSONB backfilled from `slides` (`slides` deprecated, table renamed in POA Phase 2 with the others) |
| Refactor | extract the `buildDeck` spine — context → prompt → `callLLMValidated` → `awaiting` → approve — so every kind shares it |
| Kinds | success story → experience → gyan, in that order (most concrete first) |
| Wiring | `gt_journey_stories.asset_ids`; the existing `share_token` route is how a move attaches proof |
| Done when | a move can carry an asset and the stage tags decide which one is offered |

### Phase 8 — Arc 2 *(deferred until there is a customer)*

States, transitions and screens for `onboarding → active → expanding |
at_risk → renewed | churned | advocate`. Not before a real customer exists
to learn the first state from. The `arc` column and the stage-tagged content
library — both landed in Phases 1 and 7 — are the whole preparation.

---

## 3. What this does not touch

- **`gt_sequences` / `gt_sequence_steps` / `gt_step_templates`** — dormant.
  The second touch is a new story a human decided to write, not a scheduled
  follow-up.
- **`gt_contact_assignments`** and its `identified → … → lost` stages — the
  journey supersedes it for prospect-sourced accounts. Left alone, not
  deleted, until something is actually using it.
- **`pilot_result` and `gt_touch_log`** — unchanged, on purpose. These cycles
  go *underneath* a measurement that already works.

---

## 4. Open questions

| # | Question | Why it matters |
|---|---|---|
| **Q1** | Does `pulse-skill` become part of the journey, or stay separate? | Its follow-up tasks overlap directly with "what is owed next", and its recurring **client meeting workflow** is Arc 2 already built. Two systems answering "what should I do about this account today" will diverge. |
| **Q2** | When a contact leaves the company, what happens to the journey? | The journey is per company by design (D1); this is the case that tests it. |
| **Q3** | Can one journey run two campaigns at once — e.g. an email move and a LinkedIn move in the same week? | The frozen-membership rule permits it; whether it is *wanted* is a judgement about how it reads to the recipient. |
| **Q4** | Do assets need tenant-level approval separate from authoring? | An asset is approved once and reused everywhere; that makes its approval heavier than a move's, not lighter. |

---

## 5. Status

| Phase | State |
|---|---|
| D1–D8 | **ruled** — proceeding on the recommendations in the design note |
| **Phase 1 — journey ledger** | ✅ **backend done.** Migration 222, `journey-skill` (states / service / 3 functions), and the four existing flows wired in. 409 tests pass. UI outstanding. |
| **Governor** (unblocks Phase 3, added mid-POA) | ✅ **backend done.** Migration 223, `cadence-skill` (governor / service / 5 functions). Contact-scoped, opportunity-agnostic; a moved slot is never silent. |
| **Phase 2 — the person** | ✅ **backend done.** Migration 224, `contact-skill.list_brief_contacts` + `promote_from_brief`. R-C1 enforced at the door; R-C2 gates the `addressed` move. 480 tests pass. UI outstanding. |
| **Phase 3 — story (human-written)** | ✅ **backend done.** Migration 225 (`gt_content_kinds` + `gt_journey_stories` + `gt_touch_log.story_id`), `story-skill` (tracer / service / 4 functions). R-S1 & R-S2 enforced at approval, R-S3 by construction. D7 registry seeded with the eight named kinds. `log_touch` consumes the story. 522 tests pass. UI outstanding. |
| Phase 4 — campaign run | next |
| Phase 3 — story (human-written, AI-recommended) | after 2 |
| Phase 4 — campaign run | after 3 |
| Phase 5 — stage decision | closes the cycle |
| Phases 6–8 | the long game |

### Phase 1, as built

- `gt_journeys` + `gt_journey_events` (migration 222), backfilled once from
  prospects + briefs + touches, then owned by the ledger. Idempotent, and a
  re-run cannot overwrite a state a human has since moved.
- `arc` shipped; only Arc 1 has states.
- `states.ts` — one state machine for the CHECK constraint, the API and the UI.
- `journey.service.ts` — `ensureJourney` / `moveJourney` / `moveByProspect` /
  `moveIfAt`. Takes the caller's `tx`, so a journey move commits with whatever
  caused it.
- Wired: `writeBrief → researched` (only from `sourced`), `decide_brief →
  qualified | ruled_out`, `log_touch → waiting`, `set_touch_outcome →
  answered`.

**Two things the tests changed.** `reasonRequired` now also fires moving OUT
of an exit — un-parking reverses a recorded judgement, and without it a
cohort quietly refills with companies rejected for good cause. And
`JourneyRow.id` was typed `number` while node-pg returns BIGINT as a string;
coerced once at the boundary.

**Outstanding for Phase 1:** the board UI (`/journeys`) and the journey panel
on the dossier.
