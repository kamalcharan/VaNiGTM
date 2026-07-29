---
name: cadence-skill
version: 1.0.0
description: The cadence governor — how often one person may be touched, across every opportunity
tier: starter
default_recipe: cadence-strip
---

# cadence-skill — the governor

## Why this exists

One person carries several opportunities. Each opportunity plans its own
touches and each believes it is the only one. Without arbitration, R. Menon
gets the AMC nudge and the payback calculator in the same week and decides
we are spammers.

> **At most `max_touches` touches to one contact in any rolling
> `window_days` period, never in a quiet window.**

## Why it was built first

**It is opportunity-agnostic.** The governor arbitrates on the *contact*, so
it works today — before `gt_journeys` grows its opportunity axis — and keeps
working after. Everything downstream (ghosts, veto windows, a committed
7-day horizon) assumes something is already arbitrating. This is it.

## Rolling, not calendar

A calendar week permits **Fri, Fri, Mon, Mon** — four touches in four days,
every one of them honestly "two per week". Nobody means that. Only a rolling
window protects the recipient.

## Reservations, not just history

`gt_touch_log` records what *happened*. A governor reading only history can
tell you afterwards that you over-touched somebody, which is useless.
Arbitration is prospective: a planned touch **claims** a slot, and the claim
is what the next planner collides with.

**Sent touches and held reservations both consume the window.** Counting only
reservations lets a manual send slip past the cap; counting only sends lets
two planners fill the same empty week.

## The move is never silent

When a touch does not fit, it is **moved and the reason is recorded** —
never dropped, never sent anyway (rule 12). `requested_at` and
`scheduled_at` are both stored, so *"moved +2d by the governor"* is a fact
on the record rather than a label somebody typed. The migration's CHECK
constraint refuses a moved reservation with no reason, so it cannot become
silent even by a coding mistake.

When a contact is genuinely saturated, `reserve_touch` **writes nothing** and
returns the reason plus when the window clears. A bare "could not schedule"
would invite somebody to send by hand, which is the exact outcome the
governor exists to prevent.

## Files

- `governor.ts` — the rule. Pure functions, no database: the decision about
  when a real person gets written to is testable exhaustively and cheaply.
  Exact window test (any run of `max+1` touches spanning less than the
  window is a violation), quiet days and midnight-wrapping quiet hours,
  timezone via `Intl` rather than a dependency.
- `cadence.service.ts` — policy resolution, what is already claimed, and the
  one write that grants a slot. Takes a row lock on the contact so two
  planners cannot both be granted the same empty week.

## Policy resolution

Channel-specific row → tenant default row (`channel IS NULL`) → built-in
(2 per 7 days, quiet weekends, quiet 19:00–09:00 Asia/Kolkata). The built-in
is reported as `source: 'built-in'` so an unconfigured tenant never reads as
a deliberate one.

Timezone lives on the **policy**, not the tenant: tenant timezone preferences
are deferred (CLAUDE.md), and this is a scheduling rule rather than a display
one — it must not wait on that work.

## Functions

### reserve_touch
Claim the first slot the policy allows at or after `desired_at`.
**Params:** `contact_id (required, number)`, `channel (required, string)`, `desired_at (optional, string)`, `prospect_id (optional, number)`, `journey_id (optional, number)`, `note (optional, string)`
**Returns:** `{ reservation_id, scheduled_at, moved, moved_days, reason, blocked_by, policy, competing, recipe: 'cadence-reservation' }`

### cancel_reservation
Give a slot back. Only a `held` one — a sent reservation is a historical fact.
**Params:** `reservation_id (required, number)`, `reason (optional, string)`
**Returns:** `{ reservation_id, contact_id, message }`

### get_cadence
One person's strip: what was sent, what is held, which slots were moved and why.
**Params:** `contact_id (required, number)`, `channel (optional, string)`, `days (optional, number, default 30)`
**Returns:** `{ contact, policy, touches, moves, in_window, open_now, recipe: 'cadence-strip' }`

### get_policy
The rules in force and where each came from.
**Returns:** `{ policies, built_in, using_built_in, recipe: 'cadence-policy' }`

### set_policy
Change the cap. Absurd values are refused rather than quietly obeyed.
**Params:** `scope (optional, string)`, `channel (optional, string)`, `max_touches (optional, number)`, `window_days (optional, number)`, `quiet_dows (optional, object)`, `quiet_from (optional, string)`, `quiet_to (optional, string)`, `timezone (optional, string)`
**Returns:** `{ …the policy, message, recipe: 'cadence-policy' }`

## Wired into

`research-skill.log_touch` takes `contact_id` and consumes the matching held
reservation. A send with **no** reservation is not an error — somebody wrote
by hand, which is legitimate — and it still lands in `gt_touch_log`, so it
still counts against the cap.

## Tables

`gt_cadence_policy`, `gt_touch_reservations`, and `gt_touch_log.contact_id` —
migration 223. Fatigue belongs to a person, and the log recorded only
`prospect_id`, so *"how many times have we written to R. Menon this week"*
was literally unanswerable.
