---
name: contact-skill
version: 1.0.0
description: Prospect/contact management — identity, communication channels, skimmed financial snapshot, and conversion to client
tier: starter
default_recipe: contact-list
---

# Contact Skill

## Purpose
Manages the MFD's prospect pipeline. Contacts are the lightweight identity layer — name, channels, and optionally a skimmed financial snapshot used for pitching. When a contact is ready to onboard, `convert_to_client` upgrades them to a full client.

## Functions

### create_contact
Creates a new prospect contact with optional communication channels.
- Parameters: prefix (required, string), name (required, string), channels (optional, array)
- Returns: { contact: { id, name, prefix, normalized_name, is_client, channels }, recipe: 'contact-card' }

### get_contacts
Paginated list of contacts with optional search and filter.
- Parameters: search (optional, string), is_client (optional, boolean), limit (optional, number), offset (optional, number)
- Returns: { contacts: [{ id, name, prefix, is_client, primary_mobile, primary_email, created_at }], total, recipe: 'contact-list' }

### get_contact
Single contact with all channels and snapshot summary.
- Parameters: contact_id (required, number)
- Returns: { contact: { id, name, prefix, normalized_name, is_client, is_active, channels, snapshot_summary, created_at }, recipe: 'contact-profile' }

### update_contact
Update contact name or prefix.
- Parameters: contact_id (required, number), prefix (optional, string), name (optional, string)
- Returns: { contact: { id, name, prefix, updated_at }, recipe: 'contact-card' }

### delete_contact
Soft-delete a contact (sets is_active = false). Cannot delete if already a client.
- Parameters: contact_id (required, number)
- Returns: { deleted: true, contact_id, recipe: 'confirmation' }

### add_channel
Add a communication channel to a contact.
- Parameters: contact_id (required, number), channel_type (required, string), channel_value (required, string), channel_subtype (optional, string), is_primary (optional, boolean)
- Returns: { channel: { id, channel_type, channel_value, channel_subtype, is_primary }, recipe: 'inline-item' }

### delete_channel
Remove a communication channel (soft delete).
- Parameters: channel_id (required, number)
- Returns: { deleted: true, channel_id, recipe: 'confirmation' }

### get_snapshot
Get the skimmed financial snapshot for a contact.
- Parameters: contact_id (required, number)
- Returns: { snapshot: { risk_profile, net_worth_estimate, annual_income_estimate, investment_horizon_years, existing_mf_breakdown, goals_lite, notes } | null, recipe: 'snapshot-view' }

### update_snapshot
Upsert the financial snapshot for a contact.
- Parameters: contact_id (required, number), risk_profile (optional, string), net_worth_estimate (optional, number), annual_income_estimate (optional, number), investment_horizon_years (optional, number), existing_mf_breakdown (optional, object), goals_lite (optional, array), notes (optional, string)
- Returns: { snapshot: { id, contact_id, risk_profile, updated_at }, recipe: 'snapshot-view' }

### convert_to_client
Convert a contact to a full client. Requires contact to exist and not already be a client.
- Parameters: contact_id (required, number), pan (optional, string), dob (optional, string), anniversary_date (optional, string), ext_ref_id (optional, string), family_id (optional, string), is_family_head (optional, boolean), referred_by_name (optional, string), address (optional, object)
- Returns: { client: { id, client_uid, contact_id, ext_ref_id, pan, risk_profile, onboarding_status }, goals_seeded, recipe: 'client-card' }

### get_stats
Summary stats for the contacts dashboard.
- Parameters: none
- Returns: { total_contacts, total_clients, total_prospects, has_snapshot, recipe: 'stat-summary' }

### save_snapshot
Create or update a versioned financial snapshot for a contact. Handles draft/active lifecycle. All child tables (income, expenses, assets, liabilities, protection, goals) are fully replaced on every call.
- Parameters: contact_id (required, number), status (required, string), income (optional, array), expenses (optional, array), assets (optional, array), liabilities (optional, array), protection (optional, object), goals (optional, array), risk_profile (optional, string), notes (optional, string)
- Returns: { snapshot_id, version_number, status, calc_monthly_income, calc_net_worth, calc_savings_rate_pct, recipe: 'snapshot-view' }

### get_snapshot_full
Load the active (or draft) versioned snapshot with all child tables for a contact.
- Parameters: contact_id (required, number), status (optional, string)
- Returns: { snapshot: { id, version_number, status, risk_profile, notes, calc_monthly_income, calc_net_worth, calc_savings_rate_pct, income, expenses, assets, liabilities, protection, goals } | null, recipe: 'snapshot-view' }

### get_snapshot_history
List all snapshot versions for a contact (active + archived), ordered newest first.
- Parameters: contact_id (required, number)
- Returns: { versions: [{ id, version_number, status, submitted_at, calc_net_worth, calc_savings_rate_pct, created_by_name }], recipe: 'snapshot-history' }

### get_asset_types
Global master list of asset types for the snapshot assets form.
- Parameters: none
- Returns: { asset_types: [{ id, code, label, is_liquid_default }], recipe: 'master-list' }

### get_liability_types
Global master list of liability types for the snapshot liabilities form.
- Parameters: none
- Returns: { liability_types: [{ id, code, label }], recipe: 'master-list' }

### generate_intake_token
Generate a signed intake link. Flow 1: pass contact_id for a known contact. Flow 2: omit contact_id for a generic tenant-level link.
- Parameters: contact_id (optional, number)
- Returns: { token_id, token, intake_url, expires_at, recipe: 'intake-link' }

### assign_to_campaign
Assign one or more contacts to a GTM campaign. Idempotent — skips already assigned contacts.
- Parameters: campaign_id (required, number), contact_ids (required, array of numbers)
- Returns: { assigned_count, contact_ids, recipe: 'confirmation' }

### update_stage
Update the pipeline stage for a contact-campaign assignment. Logs the transition in gt_stage_log.
- Parameters: assignment_id (required, number), stage (required, string: identified|contacted|engaged|interested|qualified|converted|lost), trigger_detail (optional, string)
- Returns: { assignment: { id, stage, score, last_activity_at }, recipe: 'pipeline-card' }

### get_pipeline
Paginated contacts assigned to a campaign with pipeline stage, score, and contact info.
- Parameters: campaign_id (required, number), stage (optional, string), search (optional, string), limit (optional, number), offset (optional, number)
- Returns: { contacts: [...], stats: { total, identified, contacted, engaged, interested, qualified, converted, lost }, recipe: 'pipeline-view' }
