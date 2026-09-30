---
name: access-skill
version: 1.0.0
description: Requests for access to VaNi's closed beta, made on vani.vikuna.io
tier: professional
default_recipe: access-requests
---

# Access Skill

## Purpose

VaNi is in closed beta. A visitor to vani.vikuna.io without an access phrase
fills in Request access; `POST /api/v1/funnel/access-request` turns that into a
`gt_lead` plus one `access_requested` event in the workspace named by
`FUNNEL_LEADS_TENANT_SLUG` (connect@vikuna.io's). This skill is how that
workspace reads them. Every other workspace has none, so its list is empty.

Read-only. Following a request up (status, notes) is the lead spine's job
(`assessment-skill`), not a second copy of it here.

## Functions

### list_requests
Access requests in the caller's workspace, newest first, each with the site the person read and the words they agreed to.
- Parameters: limit (optional, number, default 50)
- Returns: { requests: [{ lead_id, lead_no, name, email, company, role_title, country_code, mobile, site, consent_text, requested_at, times_asked, status }], total, recipe: 'access-requests' }
