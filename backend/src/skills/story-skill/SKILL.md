---
name: story-skill
version: 1.0.0
description: The story — a first-class artifact belonging to the journey. Human-written now; agent-drafted later.
tier: starter
default_recipe: story-detail
---

# story-skill — the artifact

## Why this exists

Every earlier phase built the machinery around the send: brief, decision,
person, cadence. Without a story artifact there is nothing for a campaign
run to carry. This is that artifact.

## What a story is (and is not)

A story is a **move**: about them, per journey, approved every time, never
reused. Reusable **assets** (a deck, a case study, a piece of gyan) live in
`gt_presentations` and are attached to a story via `asset_ids`. Two
lifetimes, two rows-per-write patterns, two tables.

`ready` is repeatable. A journey accumulates several stories over its life;
`seq` orders them so R-S2 has something to iterate over.

## The rules, enforced

**R-S1 — every claim traces to evidence.** `trace.ts` compares each
sentence to the brief's `raw_evidence` and marks it *traced*, *about us*,
*neutral*, or *unsupported*. **One unsupported sentence and the story
cannot be approved.** Numbers count as claims whatever their length — a
figure is the most specific thing a sentence can carry and the easiest to
invent.

**R-S2 — cannot repeat a previous story's argument.** Jaccard similarity
over content terms; ≥ 0.5 against any earlier story on the same journey
refuses approval. The writer picks a different angle, or passes
`allow_similar` with an `override_note`. **The override is recorded on the
journey event**, so a bypass without a trace is impossible.

**R-S3 — the human approves the text.** There is no auto-approve. Approval
is what the reviewer's click IS. Approval also moves the journey to `ready`
(from `addressed`; no-op if already `ready`) in the same transaction —
approved with no move would leave the ledger inconsistent.

**Also:** a story cannot be written if the brief has no evidence yet. R-S1
against an empty set trivially passes, so refusing at the door means a
template with a name on it can never sneak past.

## D7 — content kinds live as data

`gt_content_kinds` is the open registry ruled at D7. Adding a kind is a
row + a prompt + a schema, not a migration. The eight system kinds ship
seeded — email, LinkedIn, WhatsApp, deck, one-pager, success story,
experience, gyan — but only `email` has any writing-side plumbing in
Phase 3. The rest are declared so browsing the whole library on day one
shows what is coming.

Kinds split by **scope**: `move` (about them) vs `asset` (not about them).
Each kind names the stages of the journey it serves; empty means "any".

## Files

- `trace.ts` — R-S1 and R-S2 as pure functions. Sentence splitter,
  content-term extractor, per-sentence verdict, similarity. No database —
  the rule that decides whether a real message goes out is testable
  cheaply.
- `story.service.ts` — the brief evidence for a journey, earlier stories
  on the same journey, and the kind-key existence check.

## Wired into

`research-skill.log_touch` now accepts `story_id`. If given, the story must
be approved AND on this journey's account — checked at the door, not
guessed. On success the story flips to `sent`, records the touch that
carried it, and `gt_touch_log.story_id` points back. Reply rate per story
is a query, which is what Phase 6's human-baseline comparison needs.

## Functions

### create_story
Save a draft. seq is claimed atomically inside the transaction. Returns the
trace verdict and any R-S2 warning immediately — the compose screen can
show both as-you-type without a second endpoint.
**Params:** `journey_id (required, number)`, `body (required, string)`, `subject (optional, string)`, `kind_key (optional, string, default 'email')`, `offer (optional, string)`, `asset_ids (optional, object)`
**Returns:** `{ story_id, seq, status, trace, repeats_earlier, recipe: 'story-detail' }`

### approve_story
Re-runs R-S1 and R-S2 against the CURRENT state of the journey — evidence
may have been edited, other drafts may have landed — then signs the row
and moves the journey to `ready`.
**Params:** `story_id (required, number)`, `allow_similar (optional, boolean)`, `override_note (optional, string)`
**Returns:** `{ story_id, seq, journey_state, journey_moved, override, trace, recipe: 'story-detail' }`

### list_stories
Every story on a journey (or a prospect), oldest first. Includes drafts,
because a draft in another tab is still work the next author must not
repeat.
**Params:** `journey_id (optional, number)`, `prospect_id (optional, number)`, `status (optional, string)`
**Returns:** `{ stories, total, recipe: 'story-list' }`

### list_kinds
The registry, filtered. Empty stages means "any", so an empty-stages kind
matches every stage filter.
**Params:** `scope (optional, string)`, `arc (optional, string)`, `stage (optional, string)`
**Returns:** `{ kinds, total, recipe: 'kind-list' }`

## Tables

`gt_journey_stories`, `gt_content_kinds`, and `gt_touch_log.story_id` —
migration 225.
