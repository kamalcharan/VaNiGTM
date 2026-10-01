---
name: gtm
version: 1.0.0
description: GTM's journey as the console declares it — profile, audience, people, motion, sending — read from the tables that hold the answer.
tier: starter
default_recipe: gtm
---

# GTM (journey)

## Purpose

`gtm-nav.ts` declares five steps. Each has a done predicate over existing
tables: the Brain is complete (`gt_tenant_profile.is_complete`), an audience
exists (`gt_prospects`), people were found (`gt_contacts`), something is in
motion (`gt_journeys`), something was sent (`gt_touch_log`). Journey reader,
not pathway engine — the pathway definitions come next (POA Track D5).

## Functions

### journey
Which declared steps are done, which is current, and one line of state.
- Parameters: none
- Returns: { done: string[], current: string | null, note: string, counts: { score: number | null, companies, people, in_motion, touches } }
  (counts are what the GTM landing states; same read, no second query)

### outreach_notice
The platform's DPDP outreach notice, this workspace's decision on it, and its history (D9-e).
- Parameters: none
- Returns: { status: 'no_notice'|'not_provisioned'|'not_accepted'|'accepted'|'accepted_older'|'revoked', in_force: boolean, notice: { id, version, body, published_at } | null, current: event | null, history: event[], can_decide: boolean }

### accept_outreach_notice
Accept the notice that was shown — owner or admin only. Refused if a newer version was published since it was read.
- Parameters: notice_id (required, string)
- Returns: the same state as outreach_notice, plus changed: boolean (false = already accepted, nothing appended)

### revoke_outreach_notice
Switch GTM outreach off — owner or admin only. Takes effect at once; nothing already sent is affected.
- Parameters: none
- Returns: the same state as outreach_notice, plus changed: boolean (false = nothing was in force)

## The DPDP acknowledgement

`comms/may-contact.ts` lets GTM contact a person only while this workspace's
latest `vani_tenant_acknowledgement` row is `accept`. These three functions
are the only writers. The notice is a platform row in `vani_consent_text`;
version 1 is a DRAFT in `documents/drafts/263_vani_gtm_outreach_notice_v1.sql.draft`
until its wording is approved — until then `outreach_notice` answers
`no_notice` and nothing can be accepted.

- **Who:** `ctx.role` owner or admin (the workspace role from the JWT). Absent
  role = not privileged.
- **Replay-safe by construction:** accepting what is already accepted, or
  revoking when nothing is in force, appends nothing (`changed: false`). A
  per-workspace advisory lock serialises the read-then-append, so two clicks
  append one row. The Idempotency-Key header is not stored.
- **A new notice version** does not silently carry the old "I agree" over and
  does not switch sending off either: the status is `accepted_older`, sending
  stays on, and the console asks for the new version (design-notes-consent §6b).
