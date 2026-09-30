---
name: runs
version: 1.0.0
description: What the agents did — every run, its steps, what it changed, what is waiting on a person, and every event on the bus including the ones nobody consumes.
tier: starter
default_recipe: runs
---

# Runs (visibility)

## Purpose

The data has always existed — `gt_agent_runs` carries a step timeline per run,
`gt_events` carries status and attempts, `gt_kg_nodes.source_run_id` says which
run wrote a node — and nothing showed it. Until 2026-09-30 the console's `/runs`
page was a fixture. These four reads make the runtime visible without a new
table.

Rule 12 applies to the queue itself: an event with no handler used to be
resolved `done` by the worker and vanish. Since C6 (2026-09-30) the worker only
CLAIMS event types it can run, so such an event stays `pending` and runs the day
an agent subscribes. `events` marks it `handled:false` with a `waiting_reason`,
and counts it separately (`waiting_for_agent`), so "PROFILE_COMPLETE was
emitted and nothing happened" is a thing a person can see — and a queue of them
does not read as a jammed worker. Rows from before C6 are `done` with no run.

`gt_agent_runs` has RLS DISABLED by design (migration 237) — every query here
filters `tenant_id` explicitly.

## Functions

### list
Recent runs for the tenant, newest first, in the shape the console's runs table renders.
- Parameters: status (optional, string — queued|running|awaiting|completed|failed), limit (optional, number, default 50, max 200)
- Returns: { runs: [{ id, agent, trigger, actor, started, started_at, duration, duration_ms, steps, status, awaiting, event_type }] }

### get
One run in full: the step timeline, what it is waiting for, and what it changed in the knowledge graph.
- Parameters: run_id (required, string)
- Returns: { run: {...} | null, steps: [...], changed: { count, nodes: [{label, name, updated_at}] }, event: {...} | null, reason?: 'NOT_FOUND' }

### events
The bus: every event for the tenant with status, attempts, age, whether a handler exists and whether a run was created for it.
- Parameters: status (optional, string), limit (optional, number, default 100, max 500)
- Returns: { events: [{ …, handled, consumed, waiting_reason }], unconsumed: [...], counts: { pending, processing, done, failed, waiting_for_agent } }

### awaiting
Everything parked on a person: failover questions, profile input, approvals — one queue.
- Parameters: none
- Returns: { items: [{ run_id, agent, kind, question, asked_at, event_type, event_id }] }
