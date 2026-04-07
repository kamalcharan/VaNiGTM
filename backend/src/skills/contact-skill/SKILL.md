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
