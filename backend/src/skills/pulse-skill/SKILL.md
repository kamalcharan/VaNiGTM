# pulse-skill

Manages the `ki_pulses` table — unified follow-up surface for prospect and client follow-ups,
plus system-generated alerts (new scheme detected on import, etc.).

## Functions

### list_pulses
Returns a paginated list of pulses for the tenant.

**Params:**
- `contact_id?` number — filter by prospect contact
- `client_id?` number — filter by client
- `status?` 'open' | 'snoozed' | 'done' | 'dismissed'
- `origin?` 'system' | 'manual'
- `pulse_type?` string — e.g. 'prospect_followup', 'new_scheme_detected'
- `limit?` number (default 50, max 200)
- `offset?` number (default 0)

**Returns:** `{ pulses: PulseItem[], total: number, recipe: 'pulse-list' }`

---

### create_pulse
Creates a manual follow-up pulse.

**Params:**
- `pulse_type` 'prospect_followup' | 'client_followup' — required
- `title` string — required
- `body?` string
- `priority?` 'high' | 'medium' | 'low' (default 'medium')
- `due_date?` ISO date string
- `notes?` string
- `contact_id?` number — required for prospect_followup
- `client_id?` number — required for client_followup
- `snapshot_id?` number — optional link to ki_contact_snapshots
- `assigned_to?` UUID string

**Returns:** `{ pulse: PulseItem, recipe: 'pulse-detail' }`

---

### update_pulse
Updates mutable fields on an existing pulse. Only provided fields are changed.

**Params:**
- `id` number — required
- `status?` 'open' | 'snoozed' | 'done' | 'dismissed'
- `priority?` 'high' | 'medium' | 'low'
- `title?` string
- `body?` string
- `notes?` string
- `due_date?` ISO date string
- `snoozed_until?` ISO date string
- `assigned_to?` UUID string
- `clear_due_date?` boolean — set true to NULL out due_date
- `clear_snooze?` boolean — set true to NULL out snoozed_until

**Returns:** `{ pulse: PulseItem, recipe: 'pulse-detail' }`

---

## Pulse Types

| type | origin | description |
|------|--------|-------------|
| prospect_followup | manual | MFD follow-up on a prospect/contact |
| client_followup   | manual | MFD follow-up on an existing client |
| new_scheme_detected | system | Auto-created when import finds a new holding |
| rebalance_needed    | system | Portfolio allocation drift |
| sip_at_risk         | system | SIP mandate issue |
| goal_behind         | system | Goal projection below target |
| review_due          | system | Periodic review trigger |
| nav_drop            | system | Significant NAV decline |

## Status Lifecycle
open → snoozed (defer) → open (un-snooze)
open → done (action taken)
open → dismissed (not actionable)
