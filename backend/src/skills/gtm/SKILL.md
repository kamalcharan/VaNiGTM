---
name: gtm
version: 1.0.0
description: GTM's journey as the console declares it — profile, audience, people, motion, sending — read from the tables that hold the answer.
tier: starter
default_recipe: gtm
---

# GTM (journey)

## Purpose

`gtm-nav.ts` declares five steps. Each has a done predicate over existing
tables: the Brain is complete (`gt_tenant_profile.is_complete`), an audience
exists (`gt_prospects`), people were found (`gt_contacts`), something is in
motion (`gt_journeys`), something was sent (`gt_touch_log`). Journey reader,
not pathway engine — the pathway definitions come next (POA Track D5).

## Functions

### journey
Which declared steps are done, which is current, and one line of state.
- Parameters: none
- Returns: { done: string[], current: string | null, note: string }
