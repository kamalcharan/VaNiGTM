---
name: scoring
version: 1.0.0
description: The 0–100 readiness score — the profile in force (yours or the platform default), saving your own weights, the platform default (admin), companies by level, and one company's score explained.
tier: starter
default_recipe: scoring
---

# Scoring Skill

## Purpose

D-Q4–D-Q8 and S17 (Charan, 2026-10-02), release 3. A company's readiness is a
score in seven parts — Identity 20 · Firmographics 20 · Digital presence 10 ·
Contact points 20 · People 15 · Research 10 · Signals & response 5 — and a
level: Raw · Identified · Qualified (passes Complete) · Reachable ·
Campaign-ready (passes the Exit gate) · Strong. Pure arithmetic over the
record (`src/scoring/score.ts`); no model, no tokens.

The platform default (admin) scores the common pool always, and every tenant
that has not saved its own. A tenant may change the seven PART weights only —
the split inside each part and the level boundaries stay the platform's, so a
level means the same thing everywhere. Nothing is seeded at signup. Every save
is a new version (append-only); every stored score names the version that
made it.

Risk classes: reads are R0. `save_profile` / `follow_platform` / `rescore`
change THIS tenant's own scores (R1, owner or admin). `save_platform_profile`
and a pool `rescore` change shared platform data (R2, admin).

## Functions

### profile
The profile in force for this workspace, the platform default beside it, whether the default changed since this workspace's own was based on it, and the history of versions.
- Risk: R0
- Parameters: none
- Returns: { in_force: { scope, version, platform_version, own, based_on_version, platform_changed, part_weights }, platform: { version, part_weights, item_weights, level_bounds }, parts: [{ key, label, items: [{ key, label }] }], levels: [{ key, label }], can_edit, history: [...] }

### save_profile
Save this workspace's own part weights (seven whole numbers adding up to 100) as a new version, then re-score its companies.
- Risk: R1
- Parameters: part_weights (required, object), note (optional, string)
- Returns: { version, changed, rescore_event_id }

### follow_platform
Go back to the platform default (and follow its future versions), then re-score.
- Risk: R1
- Parameters: none
- Returns: { changed, rescore_event_id }

### save_platform_profile
Save the platform default — part weights, item weights, level boundaries — as a new version (admin only), then re-score the common pool.
- Risk: R2
- Parameters: part_weights (optional, object), item_weights (optional, object), level_bounds (optional, object), note (optional, string)
- Returns: { version, rescore_event_ids }

### levels
How many companies sit at each level — this workspace's own, and (admin) the common pool's — with the average score and when they were last scored.
- Risk: R0
- Parameters: none
- Returns: { tenant: { total, by_level, average, unscored }, pool?: { total, by_level, average, unscored } }

### rescore
Queue a re-score of this workspace's companies, or (admin, scope pool) of the common pool.
- Risk: R1
- Parameters: scope (optional, string — tenant|pool)
- Returns: { event_id }

### explain
One company's score now, part by part and item by item, with the evidence for each.
- Risk: R0
- Parameters: prospect_id (optional, string), company_id (optional, string — pool, admin only)
- Returns: { score, level, level_reason, parts: [{ key, label, weight, earned, measured, items: [{ key, label, weight, earned, evidence }] }], profile, last_refreshed }
