---
name: contact-skill
version: 2.0.0
description: GTM prospect/contact management — identity, communication channels, campaign assignment, and pipeline
tier: starter
default_recipe: contact-list
---

# Contact Skill

## Purpose
Manages the tenant's prospect/contact base for GTM campaigns. Contacts are the
identity layer — name, job title, company, channels, source provenance, and the
Scoring Agent's ICP-fit score. Contacts are assigned to campaigns
(`gt_contact_assignments`) and move through the pipeline stages
(identified → contacted → engaged → interested → qualified → converted / lost).

Tables: `gt_contacts`, `gt_contact_channels` (migrations 187 + 189).
Provenance: every contact carries `source` ('manual' | 'upload' |
'byo:<provider>' | 'platform:<provider>'), `external_ref`, and `raw` payload —
the universal-connector contract.

## Functions

### create_contact
Creates a new contact with optional channels.
- Parameters: name (required), prefix?, job_title?, company_name?, company_domain?, linkedin_url?, location?, source?, channels? (array)
- Returns: { contact: { id, contact_no, name, prefix, normalized_name, job_title, company_name, score, channels }, recipe: 'contact-card' }

### get_contacts
Paginated list with optional search (name / company / channel value).
- Parameters: search?, show_inactive?, limit?, offset?
- Returns: { contacts: [{ id, contact_no, name, job_title, company_name, location, source, score, primary_mobile, primary_email, created_at }], total, recipe: 'contact-list' }

### get_contact
Single contact with all channels.
- Parameters: contact_id (required)
- Returns: { contact: { …identity + GTM fields, channels[] }, recipe: 'contact-profile' }

### update_contact
Update identity/GTM fields (name, prefix, job_title, company_name, company_domain, linkedin_url, location).
- Parameters: contact_id (required), any subset of the above
- Returns: { contact, recipe: 'contact-card' }

### delete_contact
Soft-delete (is_active = false).
- Parameters: contact_id (required)
- Returns: { deleted: true, contact_id, recipe: 'confirmation' }

### reactivate_contact
Reverse a soft-delete.
- Parameters: contact_id (required)
- Returns: { contact, recipe: 'contact-card' }

### add_channel / delete_channel
Manage communication channels (email, mobile, whatsapp, instagram, twitter, linkedin, other).

### assign_to_campaign
Assign a contact to a campaign pipeline (gt_contact_assignments).

### update_stage
Move an assignment through pipeline stages.

### get_pipeline
Campaign pipeline view (assignments joined with contact + channels).

### get_stats
Dashboard stats: total_contacts, high_fit_contacts (score ≥ 60), distinct_companies.

## Removed in Phase 0 (MFD legacy)
convert_to_client, generate_intake_token, snapshot functions
(get/save/update/history/full), asset/goal/liability type lookups.
