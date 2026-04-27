---
name: sequence-skill
version: 1.0.0
description: Outreach sequence builder — define multi-step flows with email, WhatsApp, LinkedIn, wait, and condition steps
tier: starter
default_recipe: sequence-detail
---

# Sequence Skill

## Purpose
Manages outreach sequences within GTM campaigns. A sequence is an ordered flow of steps (email, whatsapp, linkedin, wait, condition) that contacts progress through. Steps have message templates with A/B variant support.

## Functions

### get_sequences
List sequences for a campaign.
- Parameters: campaign_id (required, number)
- Returns: { sequences: [{ id, name, description, status, contacts_count, avg_open_rate, avg_reply_rate, step_count, sort_order }], recipe: 'sequence-list' }

### get_sequence
Single sequence with all steps and templates.
- Parameters: sequence_id (required, number)
- Returns: { sequence: { id, name, description, status, steps: [{ id, step_type, title, day_offset, sort_order, templates, channel }] }, recipe: 'sequence-detail' }

### create_sequence
Create a new sequence for a campaign.
- Parameters: campaign_id (required, number), name (required, string), description (optional, string)
- Returns: { sequence: { id, name, status }, recipe: 'sequence-card' }

### update_sequence
Update sequence name, description, or status.
- Parameters: sequence_id (required, number), name (optional, string), description (optional, string), status (optional, string)
- Returns: { sequence: { id, name, status, updated_at }, recipe: 'sequence-card' }

### add_step
Add a step to a sequence.
- Parameters: sequence_id (required, number), step_type (required, string), title (required, string), day_offset (optional, number), channel_id (optional, number), wait_duration_hours (optional, number), condition_type (optional, string)
- Returns: { step: { id, step_type, title, sort_order }, recipe: 'step-card' }

### update_step
Update an existing step.
- Parameters: step_id (required, number), title (optional, string), day_offset (optional, number), channel_id (optional, number), wait_duration_hours (optional, number), condition_type (optional, string)
- Returns: { step: { id, title, updated_at }, recipe: 'step-card' }

### remove_step
Delete a step and its templates.
- Parameters: step_id (required, number)
- Returns: { deleted: true, step_id, recipe: 'confirmation' }

### reorder_steps
Reorder steps within a sequence.
- Parameters: sequence_id (required, number), order (required, array of { step_id, sort_order })
- Returns: { reordered: true, recipe: 'confirmation' }

### upsert_template
Create or update a message template for a step.
- Parameters: step_id (required, number), variant_label (optional, string), subject (optional, string), body (required, string)
- Returns: { template: { id, variant_label, subject, body }, recipe: 'template-card' }

### delete_template
Delete a template variant.
- Parameters: template_id (required, number)
- Returns: { deleted: true, template_id, recipe: 'confirmation' }
