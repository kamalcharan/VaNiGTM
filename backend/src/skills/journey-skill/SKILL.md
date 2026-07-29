---
name: journey-skill
version: 1.0.0
description: The journey ledger — one durable relationship per company, what state it is in and what is owed next
tier: starter
default_recipe: journey-board
---

# journey-skill — the spine

## Why this skill exists

Research ends at a decided brief **about a company**. Nothing carried it to a
**person**, in a **state**, with a **message**. This is the state half: what
every account is, what is owed next, and an account of how it got there.

## A ledger, not a journey map

A customer journey map is a template — awareness → consideration → decision,
drawn once per persona, describing what customers *generally* do. This is the
other thing: per account, actual state, actual history, actual reasons, with a
human ruling at each fork.

The difference is not vocabulary. A map makes the system's job *inferring*
which stage a customer is at, and inference is where a silent fallback creeps
back in ("they opened it twice, they're probably in consideration"). A ledger
only records what happened and what a human decided. The map is then a view
over the ledger.

## One journey per company

The brief is per company. The offer is chosen per company. `pilot_result`
counts per company. People change jobs; the account is the stable unit.
Persons hang off the journey (`contact_id`, and later the stories addressed
to them).

## The states

Ladder: `sourced → researched → qualified → addressed → ready → waiting →
answered → won`
Exits: `ruled_out` (never a fit) · `parked` (a fit, wrong moment) · `lost`
(we played it out)

Three exits on purpose. They mean different things and the difference is the
only part the Learning Graph can eat.

`ready` is **repeatable** — `answered → addressed` ("another story is owed")
is the most-travelled edge in a working journey.

## Two arcs

`arc` is `acquisition` or `lifetime`. `won` is a **doorway**, not a terminus:
it flips the arc. Arc 2 has no states yet — there are no customers to learn
the first one from. See `documents/POA-journey-campaign.md` Phase 8.

## Rules

- **R-J1 — no silent regression.** A reason is required for every exit and
  every backward move, and for nothing else. Demanding one on routine forward
  moves trains people to type "n/a".
- **R-J3 — a campaign may move a journey exactly twice** (`ready → waiting`,
  `waiting → answered`) and nowhere else. `states.CAMPAIGN_MOVES`.
- **R-J4 — the ledger is append-only.** `gt_journeys.state` is a cache of
  `gt_journey_events`' tail. When they disagree, the events are right.
- **R-J5 / R7 — new work never rewrites what already happened.** Re-researching
  a company that has been emailed updates the brief and leaves the journey
  where it is (`journey.service.moveIfAt`).

## Files

- `states.ts` — the state machine. Pure values and pure functions, so the
  migration's CHECK, the API and the UI cannot hold different opinions.
- `journey.service.ts` — `ensureJourney`, `moveJourney`, `moveByProspect`,
  `moveIfAt`. **Every state change in the product goes through these.** They
  take the caller's `tx` so a journey move commits with whatever caused it.

## Who moves journeys today

| Caller | Move | Actor |
|---|---|---|
| `account.agent` writeBrief | `sourced → researched` (only from sourced) | agent |
| `research-skill.decide_brief` | → `qualified` / `ruled_out` | human |
| `research-skill.log_touch` | → `waiting` | human |
| `research-skill.set_touch_outcome` | → `answered` (or back to `waiting` when cleared) | human |
| `journey-skill.advance_journey` | anything the state machine allows | human |

## Functions

### get_journey
One journey with its full ledger, and the moves it may legally make next.
**Params:** `journey_id (optional, number)`, `prospect_id (optional, number)`, `ref (optional, string)`
**Returns:** `{ journey, events, moves, recipe: 'journey-detail' }`

### list_journeys
The board: one page of journeys plus the count behind every state.
**Params:** `state (optional, string)`, `arc (optional, string)`, `owner_id (optional, string)`, `due (optional, boolean)`, `search (optional, string)`, `limit (optional, number, default 50)`, `offset (optional, number)`
**Returns:** `{ journeys, counts, total, recipe: 'journey-board' }`

### advance_journey
Move a journey. Parking is a move to `parked` carrying a date, not a separate
endpoint — two endpoints would mean two places for the reason rule to live.
**Params:** `to (required, string)`, `journey_id (optional, number)`, `prospect_id (optional, number)`, `reason (optional, string)`, `wake_at (optional, string)`, `offer (optional, string)`, `contact_id (optional, number)`
**Returns:** `{ journey, moved, recipe: 'journey-detail' }`

## Tables

`gt_journeys`, `gt_journey_events` — migration 222.
