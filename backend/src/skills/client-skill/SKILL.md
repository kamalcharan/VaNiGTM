---
name: client-skill
version: 2.0.0
description: Full client profile management — KYC, family, addresses, bookmarks, and stats
tier: starter
default_recipe: client-list
---

# Client Skill

## Purpose
Manages the MFD's full client database. Clients are contacts that have been onboarded with KYC details (PAN, DOB, ext_ref_id), addresses, family grouping, and bookmarks. Portfolio, goals, and transactions are managed by their respective skills.

## Functions

### get_clients
Paginated list of clients with optional search and filter.
- Parameters: filters (optional, object: { search?: string, risk_profile?: string, bookmarked_only?: boolean }), limit (optional, number), offset (optional, number)
- Returns: { clients: [{ id, client_uid, name, prefix, ext_ref_id, pan, risk_profile, onboarding_status, is_bookmarked, primary_mobile, primary_email }], total, recipe: 'client-list' }

### get_client
Single client with full profile — channels, addresses, family info.
- Parameters: client_id (required, number)
- Returns: { client: { id, client_uid, contact_id, name, prefix, pan, dob, ext_ref_id, risk_profile, onboarding_status, family, channels, addresses, bookmark }, recipe: 'client-profile' }

### update_client
Update client fields (KYC, risk profile, onboarding status).
- Parameters: client_id (required, number), pan (optional, string), dob (optional, string), anniversary_date (optional, string), ext_ref_id (optional, string), risk_profile (optional, string), onboarding_status (optional, string), referred_by_name (optional, string)
- Returns: { client: { id, pan, dob, risk_profile, onboarding_status, updated_at }, recipe: 'client-card' }

### add_address
Add or update an address for a client.
- Parameters: client_id (required, number), address_type (required, string), line1 (required, string), line2 (optional, string), city (required, string), state (required, string), country (optional, string), pincode (required, string), is_primary (optional, boolean)
- Returns: { address: { id, address_type, line1, city, state, pincode, is_primary }, recipe: 'inline-item' }

### add_bookmark
Add or update a bookmark for a client (user-scoped).
- Parameters: client_id (required, number), reason_id (optional, number), custom_reason (optional, string), notes (optional, string)
- Returns: { bookmark: { id, client_id, reason_id, custom_reason, notes }, recipe: 'inline-item' }

### remove_bookmark
Remove a bookmark (soft delete).
- Parameters: client_id (required, number)
- Returns: { removed: true, client_id, recipe: 'confirmation' }

### get_family_members
Get all clients in the same family group.
- Parameters: family_id (required, string)
- Returns: { members: [{ id, client_uid, name, prefix, is_family_head, ext_ref_id }], family_name, recipe: 'data-table' }

### get_stats
Summary stats for the clients dashboard.
- Parameters: none
- Returns: { total_clients, active_clients, pending_onboarding, bookmarked, recipe: 'stat-summary' }
