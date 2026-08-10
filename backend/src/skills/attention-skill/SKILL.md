---
name: attention-skill
version: 1.0.0
description: Quiet accounts — which relationships have gone silent, why, in what order, and what a human decided about each
tier: professional
default_recipe: attention-queue
---

# Attention Skill

## Purpose

The queue behind `/today`. It answers one question — *which accounts have gone
quiet and need a human today* — and records what the human decided.

## Where "last touch" comes from

`gt_touch_log`, and nothing else.

The G3 work order named `gt_touch_reservations`, `gt_activity_feed` and
`gt_journey_events` as the candidates. None of the three is right, and the
reasoning is in **`docs/gtm/attention-query.md`**. The short version:

- `gt_touch_reservations` is *prospective* — a claim on a future slot, keyed
  on the contact, and blind to manual sends. It is read here to **suppress**
  accounts that are already queued, never to measure recency.
- `gt_activity_feed` has exactly one writer in the codebase, the demo seeder.
  It is not read here at all.
- `gt_journey_events` records state transitions, only some of which are
  touches. Its states decide **who is eligible**; its timestamps decide
  nothing.

Read that document before changing anything in `queries/`.

## Why an item appears

| Reason | Means | Waits for the quiet window? |
|---|---|---|
| `wake_due` | a parked journey's `wake_at` has passed | no — due is due |
| `owed_reply` | they answered and we have not come back | no — urgent on day one |
| `story_unsent` | an approved story exists and was never sent | yes |
| `gone_quiet` | touched, no answer, past the window | yes |
| `never_touched` | in play, never contacted | yes |

`wake_due` is new behaviour, not a re-skin. Migration 222 said only the parked
list would be scanned for `wake_at` and nothing has ever scanned it — every
"remind me in three weeks" set since then has been sitting in the database,
due, invisible. This is that scan.

## Ranking

`backend/src/config/attention.config.ts`. Weights, the quiet window, the
staleness cap and the page size all live there and reach the query as bound
parameters. There are no magic numbers in the SQL. Retuning is a one-file
diff, and because `gt_attention_decision.shown` freezes what the operator saw,
an old decision can still be read against the weights that produced it.

## Decisions are append-only

`gt_attention_decision` (migration 238) has **no status column**. The standing
decision is the latest row per account, folded in the `standing` CTE. Reversal
is a new row (`reopened`), never an update — a trigger refuses one.

`decided` is deliberately not `done`: an `acted` row says the item was taken
on from `/today`, not that anything was sent. Sending is
`research-skill.log_touch`, which also consumes the cadence reservation, marks
the story sent and moves the journey. Recency on the next render always comes
from `gt_touch_log`, so an `acted` row with no touch behind it correctly
leaves the account quiet.

## Functions

### get_attention
A page of quiet accounts, ranked, plus the counts the empty states need.
- Parameters: limit (optional, number, default 15), offset (optional, number, default 0), include_dismissed (optional, boolean, default false)
- Returns: { items: [{ prospect_id, company, ref, journey_state, reason, days_quiet, last_touch_at, last_outcome, score, wake_at, offer }], context: { prospects_total, journeys_in_play, matched, surfaced, suppressed_handled, suppressed_snoozed, suppressed_dismissed, next_snooze_due, in_play_never_touched }, empty_state, tuning, recipe: 'attention-queue' }

### decide_attention
Append one decision about one account.
- Parameters: prospect_id (required, number), decision (required, string: 'acted' | 'snoozed' | 'dismissed' | 'reopened'), reason (optional, string, required when dismissing), snooze_until (optional, string), snooze_days (optional, number, default 7), shown (optional, object)
- Returns: { decision: { id, prospect_id, decision, reason, snooze_until, created_at }, recipe: 'attention-decision' }

## Empty states

`get_attention` returns `empty_state` so the screen renders a verdict rather
than re-deriving one from six counts and reaching a different conclusion.

| `empty_state` | What is true | What the screen should offer |
|---|---|---|
| `has_items` | there is work | the list |
| `no_accounts` | nothing imported | import or find companies |
| `none_in_play` | companies exist, none qualified | the research queue — **not** "all caught up" |
| `all_current` | in play, nothing past the window | the window, so the number is not a mystery |
| `all_handled` | there was work and it is disposed of | what was snoozed, and when it returns |

Three of those four are wrong if rendered as a generic "nothing to show".

## Guardrails

- All access through `ctx.db`. SQL in `queries/*.sql`. No raw `pool.query`.
- `_candidates.sql` is a **prefix, not a query** — it is concatenated with a
  tail so the candidate logic exists once. See its header.
- `insert-decision.sql` is `INSERT … SELECT` over `gt_prospects` on purpose:
  that join is the ownership check. A `VALUES` insert would take a
  `prospect_id` from the request body at face value.
- `gt_attention_decision` has `FORCE ROW LEVEL SECURITY` from creation.
  Phase 0 found eighteen tables whose policies were inert because the owner
  is exempt without it — see `docs/db/rls-status.md` §3.2.
