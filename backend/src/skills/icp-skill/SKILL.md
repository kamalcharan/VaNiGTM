---
name: icp-skill
version: 1.0.0
description: ICP persona management — define target buyer personas with tags, company size, and buying signals per campaign
tier: starter
default_recipe: persona-list
---

# ICP Skill

## Purpose
Manages Ideal Customer Profile (ICP) personas for GTM campaigns. Each persona represents a target buyer profile with title, description, qualification tags, company size range, and buying signals. Personas are used to score and segment contacts during outreach (Phase 2).

## Functions

### get_personas
List all personas for a campaign, ordered by sort_order.
- Parameters: campaign_id (required, number)
- Returns: { personas: [{ id, title, emoji, description, tags, company_size_min, company_size_max, seniority_level, sort_order, signal_count }], recipe: 'persona-list' }

### create_persona
Create a new persona for a campaign.
- Parameters: campaign_id (required, number), title (required, string), emoji (optional, string), description (optional, string), tags (optional, array), company_size_min (optional, number), company_size_max (optional, number), seniority_level (optional, string)
- Returns: { persona: { id, title, emoji, tags }, recipe: 'persona-card' }

### update_persona
Update an existing persona.
- Parameters: persona_id (required, number), title (optional, string), emoji (optional, string), description (optional, string), tags (optional, array), company_size_min (optional, number), company_size_max (optional, number), seniority_level (optional, string)
- Returns: { persona: { id, title, emoji, updated_at }, recipe: 'persona-card' }

### delete_persona
Soft-delete a persona (sets is_active = false).
- Parameters: persona_id (required, number)
- Returns: { deleted: true, persona_id, recipe: 'confirmation' }

### reorder_personas
Reorder personas within a campaign.
- Parameters: campaign_id (required, number), order (required, array of { persona_id, sort_order })
- Returns: { reordered: true, recipe: 'confirmation' }

### add_signal
Add a buying signal to a persona.
- Parameters: persona_id (required, number), signal_type (required, string), label (required, string), description (optional, string), weight (optional, number)
- Returns: { signal: { id, signal_type, label, weight }, recipe: 'inline-item' }

### remove_signal
Remove a buying signal.
- Parameters: signal_id (required, number)
- Returns: { deleted: true, signal_id, recipe: 'confirmation' }
