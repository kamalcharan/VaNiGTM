---
name: agents
version: 1.0.0
description: Which agents exist on the platform and where each stands for this tenant — from the registry and the subscription row, not a fixture.
tier: starter
default_recipe: agents
---

# Agents

## Purpose

`vani_agent` is the registry (Flow F1 of the platform spec) and
`vani_tenant_agent` the per-tenant subscription with its lifecycle
provisioned → activating → live → suspended. Vara is registered there. GTM and
Edge are not yet registered agents on the spine — GTM runs on the tenant's
Brain directly and Edge keeps its mission in the browser — so their rows are
DERIVED and say so (`source: 'derived'`). When they are registered, the derived
branch goes away and nothing in the console changes.

## Functions

### list
Every agent the console can offer, with its state for this tenant.
- Parameters: none
- Returns: { agents: [{ id, name, version, status: 'active' | 'attention' | 'not_activated', subscription, activated_at, source: 'registry' | 'derived' }] }
