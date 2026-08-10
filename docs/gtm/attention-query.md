# What "last touch" means, and which table is allowed to say so

**Status:** decided, from schema and call-site evidence. One claim in here is
not yet checked against production data and is marked as such (§6).
**Decided:** 2026-08-10, for G3 · `/today`.

The G3 work order named three candidates — `gt_touch_reservations`,
`gt_activity_feed`, `gt_journey_events` — said they may disagree, and said a
wrong answer here makes every item on the screen wrong. That is correct, and
it is worse than the brief assumed: **none of the three is the right answer.**
The authoritative record of an outbound touch is `gt_touch_log`, which the
brief did not list.

This document exists so nobody re-litigates that from the table names.

---

## 1. The verdict

| Table | Records | Verdict for "last touch" |
|---|---|---|
| **`gt_touch_log`** | one row per touch that actually went out | ✅ **authoritative** |
| `gt_touch_reservations` | a *prospective* claim on a person's attention | ❌ as history — ✅ as **suppression** (§4) |
| `gt_activity_feed` | nothing. Demo fixtures only (§3) | ❌ **not a source of anything** |
| `gt_journey_events` | state transitions of a relationship | ❌ as touch — ✅ as **eligibility** (§5) |

The attention query reads `gt_touch_log.touched_at` for recency,
`gt_journeys.state` for who is even in play, and `gt_touch_reservations` for
what is already handled. It does not read `gt_activity_feed` at all.

---

## 2. Why `gt_touch_reservations` is not history

It is the cadence governor's claim table (migration 223), and 223's own header
says the quiet part out loud:

> `gt_touch_log` records what HAPPENED. A governor that only reads history can
> tell you afterwards that you over-touched somebody, which is useless.
> Arbitration has to be prospective.

The consequences for a gap query are concrete:

- **`scheduled_at` is usually in the future.** A `held` reservation for next
  Tuesday is not evidence that anyone has been touched. Ranking on it would
  rank an account as *freshly handled* precisely because someone planned to
  handle it and hasn't yet — the exact inversion of what `/today` is for.
- **It is keyed on `contact_id`, not `prospect_id`**, deliberately: "an
  opportunity cannot skip the queue by being a different opportunity."
  `prospect_id` is nullable there. Quiet *accounts* is a company-level
  question, and the company axis on that table is optional.
- **It is incomplete by design.** `log-touch.ts` says a send with no
  reservation "is NOT an error — somebody wrote by hand, which is
  legitimate." Manual sends land in `gt_touch_log` with no reservation at all.
  A last-touch derived from reservations would silently miss every one of
  them.

The one place it *is* historical — `status = 'sent'` — carries `touch_id`, a
foreign key to `gt_touch_log`. Even the historical subset is a pointer at the
real record. Following the pointer instead of the pointee buys nothing and
loses the manual sends.

## 3. Why `gt_activity_feed` is not a source at all

**Its only writer in the entire codebase is the demo seeder.**

```
backend/src/skills/campaign-skill/functions/seed-demo-data.ts:436
  INSERT INTO gt_activity_feed (tenant_id, is_live, event_type, campaign_id, summary, created_at)
```

That is the complete list. Nothing in the ETL, the agents, the cadence skill,
the research skill or the journey skill has ever written a row to it. It is
read by `gtm-analytics-skill` (`get-activity-feed.sql`, and a `meeting_booked`
count in `get-dashboard-stats.sql`), and cleared by `clear-demo-data.ts`.

Two things follow, and the second one matters beyond G3:

1. For `/today`, it is not a weak signal to be down-weighted. It is empty of
   real rows, and the rows it does have are seeded with `is_live = false`.
2. **The War Room's "live activity feed" has been showing demo data since
   migration 162.** So has the `meeting_booked` figure on the analytics
   dashboard. That is out of G3's scope to fix, but it should not stay
   undocumented — see §7.

Even setting the emptiness aside, its shape is wrong for this question. Its
`event_type` mixes outbound (`email_sent`), inbound (`email_opened`,
`email_replied`, `linkedin_visit`) and system events (`score_change`,
`stage_change`) in one column, so "last activity" there is not "last touch"
even in principle — an account we have ignored for six weeks looks busy the
moment its score recalculates. And it has no `prospect_id`; its `contact_id`
is an unenforced reference to `ki_contacts`, **a table that does not exist in
production at all** (Phase 0, `docs/db/ki-disposition.md`). There is no
supported join from it to a company.

## 4. Reservations still earn a place — as suppression, not recency

An account with no touch for five weeks but a `held` reservation for tomorrow
is not a quiet account. It is a handled account. Surfacing it on `/today`
would ask a human to decide something the governor has already decided, and
the reliable outcome of that is a double-touch — which is the precise failure
`gt_touch_reservations` was built to prevent.

So the gap query joins it with `status = 'held' AND scheduled_at >= now()` and
uses it to **suppress**, never to score. This is a different use of the table
than the brief imagined and it is the correct one: reservations are a
statement about the future, and the future is exactly what tells you an item
does not need attention today.

## 5. Journey events are the eligibility axis, not the recency axis

`gt_journey_events` is the append-only ledger behind `gt_journeys.state`
(migration 222: "`gt_journeys.state` is a cache of this table's tail. When
they disagree, this table is right").

It moves for reasons that are not touches — a brief gets decided, a story gets
approved, somebody parks an account. It also moves *because* of touches:
`log-touch.ts` calls `moveByProspect(..., 'waiting')` in the same transaction
as the `gt_touch_log` insert. So its timestamps are a superset that cannot be
told apart without inspecting `to_state`, and reconstructing "was this
transition a touch" from the ledger is just a worse way of reading
`gt_touch_log`.

What it *is* good for is deciding **who is a candidate at all**. Quietness is
only interesting for a relationship that is supposed to be moving:

| State | On `/today`? | Why |
|---|---|---|
| `waiting` | ✅ | touched, no answer — the core case |
| `answered` | ✅ | they replied and we have not come back |
| `ready` | ✅ | a story is approved and unsent — quiet by our own inaction |
| `qualified`, `addressed` | ✅ | in play, not yet touched |
| `sourced`, `researched` | ❌ | not yet qualified; this is the research queue, not the attention queue |
| `ruled_out`, `lost`, `won` | ❌ | closed. Silence is the correct state |
| `parked` | ⚠️ **only when `wake_at <= now()`** | see below |

**`parked` is the find worth calling out.** Migration 222 says a wake date on
a non-parked journey "is a reminder nobody will ever see, because only the
parked list is scanned for it." **Nothing scans it.** `get-journey.ts`
computes `is_due` for one journey you already opened, and that is the only
reader of `wake_at` in the codebase. Every "remind me in three weeks" anyone
has ever set is sitting in the database, due, invisible.

`/today` closes that. A parked journey whose `wake_at` has passed is a
first-class attention item with its own reason — *you asked to be reminded* —
and it is not a gap-based item at all, so it must not be ranked by silence.

## 6. The one thing not yet verified

Everything above is derived from schema and call sites, which is checkable in
the repo. **The row counts are not.** Phase 0's standing lesson is that a
local rebuild is not production, and four conclusions were wrong until checked
against the live database.

The specific claim at risk: *`gt_activity_feed` has no real rows in
production.* The code says nothing writes to it. If production disagrees,
something writes to it that is not in this repo — an n8n workflow, a manual
insert, a migration-era backfill — and that would need explaining before
`/today` ships.

`deploy/vani-main-vps/attention-source-disagreement.sql` measures it. It is
read-only, runs as the application role, and answers three questions:

1. How many rows does each of the four tables actually hold, and how many are
   `is_live`?
2. Per prospect, do the sources disagree about the most recent moment — and by
   how much?
3. How many in-play journeys have **no** touch at all (the "no touch data"
   empty state in §7 is only correct if this number is non-trivial)?

Run it before `/today` goes to a real tenant. If (1) shows real
`gt_activity_feed` rows, stop and find the writer.

## 7. Consequences recorded for later, out of G3's scope

- **The War Room activity feed and the `meeting_booked` counter read demo
  data.** Not fixed here. Fixing it means giving `gt_activity_feed` real
  writers or retiring it in favour of `gt_touch_log` + `gt_journey_events`,
  and that is a decision about the War Room, which `/today` replaces anyway.
- **`gt_touch_log.contact_id` is nullable** for rows predating migration 223.
  Account-level quietness does not care; anything later that wants
  person-level quietness must handle the gap rather than assume it away.
- **`gt_touch_log` has no `FORCE ROW LEVEL SECURITY`** but is owned by
  `vikuna_admin`, so its policy is live (Phase 0 §3.2). If ownership ever
  moves to `vanigtm_app`, it joins the eighteen tables that migration 236 had
  to force. Same for `gt_touch_reservations` and `gt_journeys`.

## 8. What would make this wrong

Re-check this document if any of these becomes true:

- Sending gets automated. Today `gt_touch_log` is manual entry by design
  (migration 221: "the pilot deliberately does not automate sending"). An
  automated sender that writes somewhere else first makes that table lag.
- `gt_activity_feed` acquires a real writer. Then it becomes a candidate for
  *inbound* signal — which `/today` currently cannot see at all, and which is
  a genuine limitation: an account that replied yesterday is not quiet, and we
  learn that only when a human sets `outcome` on the touch.
- Journeys grow the opportunity axis. `gt_touch_reservations.journey_id` is
  reserved for it. Quietness then becomes per-opportunity, not per-account,
  and the whole query changes shape.
