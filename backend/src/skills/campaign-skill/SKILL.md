---
name: campaign-skill
version: 1.0.0
description: GTM campaign management — create, list, update, and lifecycle (launch/pause/complete) campaigns
tier: starter
default_recipe: campaign-list
---

# Campaign Skill

## Purpose
Manages GTM (Go-To-Market) campaigns. A campaign is a mission targeting a specific product and market segment. Each campaign carries ICP personas, channel configuration, and outreach sequences (Phase 2). This skill handles campaign CRUD and lifecycle transitions.

## Functions

### get_campaigns
Paginated list of campaigns with optional search and status filter.
- Parameters: search (optional, string), status (optional, string), limit (optional, number), offset (optional, number)
- Returns: { campaigns: [{ id, campaign_no, name, description, status, target_industries, created_at, persona_count }], total, recipe: 'campaign-list' }

### get_campaign
Single campaign with full details.
- Parameters: campaign_id (required, number)
- Returns: { campaign: { id, campaign_no, name, description, product_name, product_url, target_industries, sender_name, sender_email, status, launched_at, completed_at, persona_count, created_at }, recipe: 'campaign-detail' }

### create_campaign
Create a new GTM campaign.
- Parameters: name (required, string), description (optional, string), product_name (optional, string), product_url (optional, string), target_industries (optional, array), sender_name (optional, string), sender_email (optional, string)
- Returns: { campaign: { id, campaign_no, name, status }, recipe: 'campaign-card' }

### update_campaign
Update campaign details. Cannot update if status is completed or archived.
- Parameters: campaign_id (required, number), name (optional, string), description (optional, string), product_name (optional, string), product_url (optional, string), target_industries (optional, array), sender_name (optional, string), sender_email (optional, string)
- Returns: { campaign: { id, name, updated_at }, recipe: 'campaign-card' }

### update_status
Transition campaign lifecycle status. Valid transitions: draft→active, active→paused, paused→active, active→completed, completed→archived.
- Parameters: campaign_id (required, number), status (required, string)
- Returns: { campaign: { id, campaign_no, status, launched_at, completed_at }, recipe: 'campaign-card' }

### get_stats
Summary stats for the campaigns dashboard.
- Parameters: none
- Returns: { total, draft, active, paused, completed, recipe: 'stat-summary' }

### seed_demo_data
Populates all GTM tables with realistic demo data. TEST environment only. Idempotent — clears previous demo data first. Creates 3 campaigns, 8 personas, 3 channels, 4 sequences with steps and templates, 25 contact assignments, 20 agent runs, 50 activity events, 14 days of metrics.
- Parameters: none
- Returns: { seeded, counts, message, recipe: 'confirmation' }

### clear_demo_data
Removes ALL GTM data from the test environment. Does not touch ki_contacts. TEST environment only.
- Parameters: none
- Returns: { cleared, total_deleted, counts, message, recipe: 'confirmation' }
