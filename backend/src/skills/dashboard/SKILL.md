---
name: dashboard
version: 1.0.0
description: The landing after login — the Brain's completeness and its weakest section, counters over real runs, and the activity feed.
tier: starter
default_recipe: dashboard
---

# Dashboard

## Purpose

The product starts from the Smart Profile. The retired frontend's `/today` read
the profile score, named the weakest Brain section with why it matters to the
agents, and offered one action; the console's dashboard rendered fixtures. These
three reads put the tenant back on the landing page. No new tables.

`brain` reads the same weights the score is computed from (`BRAIN_WEIGHTS`
in profile-skill) — the old page copied the table by hand and CLAUDE.md drifted.

## Functions

### brain
The Brain's completeness: score, per-section detail, the weakest section by fraction of its own weight, and the one thing to do next.
- Parameters: none
- Returns: { exists: boolean, completion_score, is_complete, detail, sections: [{key, label, weight, earned, ratio, why}], weakest: {key,label,why} | null, unlocks: { storytelling: boolean } }

### counters
Four numbers over real rows: agents live for this tenant, runs today, runs waiting on a person, and things needing attention (failed runs in 24h + events nobody consumes).
- Parameters: none
- Returns: { agents_active, runs_today, handovers, attention, detail: {...} }

### activity
The last runs as a feed: when, which agent, what its last step said.
- Parameters: limit (optional, number, default 20, max 100)
- Returns: { activity: [{ id, at, agent, text, run }] }
