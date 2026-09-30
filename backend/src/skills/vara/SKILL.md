---
name: vara
version: 1.0.0
description: Vara's journey as the console declares it, read from the tables that already hold the answer — no fixture.
tier: starter
default_recipe: vara
---

# Vara (journey)

## Purpose

`vara-nav.ts` declares four steps: domain declared, families taken, first JD
published, second JD. Each has a done predicate over data the API already
holds. This is the "journey reader" option (POA Track B4, ruled 2026-09-30):
no pathway table, no new schema — a read.

## Functions

### journey
Which of the declared steps are done, which is current, and one line of state.
- Parameters: none
- Returns: { done: string[], current: string | null, note: string }
