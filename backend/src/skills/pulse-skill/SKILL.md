# pulse-skill

Two systems in one skill:

1. **Follow-up tasks** (`ki_pulses`) — simple open/done/dismissed task list for prospect and client follow-ups, plus system-generated alerts.
2. **Pulse Sessions** (`ki_pulse_config` + `ki_pulse_sessions` + supporting tables) — structured recurring client meeting workflow: Queue → Setup → Prep → In Meeting → Post Meeting → History.

---

## Follow-up Task Functions (ki_pulses)

### list_pulses
Returns a paginated list of follow-up tasks for the tenant.

**Params:**
- `contact_id?` number
- `client_id?` number
- `status?` 'open' | 'snoozed' | 'done' | 'dismissed'
- `origin?` 'system' | 'manual'
- `pulse_type?` string
- `limit?` number (default 50, max 200)
- `offset?` number

**Returns:** `{ pulses: PulseItem[], total: number, recipe: 'pulse-list' }`

---

### create_pulse
Creates a manual follow-up task.

**Params:**
- `pulse_type` 'prospect_followup' | 'client_followup' — required
- `title` string — required
- `body?` string
- `priority?` 'high' | 'medium' | 'low' (default 'medium')
- `due_date?` ISO date
- `notes?` string
- `contact_id?` number
- `client_id?` number
- `assigned_to?` UUID

**Returns:** `{ pulse: PulseItem, recipe: 'pulse-detail' }`

---

### update_pulse
Updates mutable fields on a follow-up task.

**Params:**
- `id` number — required
- `status?` 'open' | 'snoozed' | 'done' | 'dismissed'
- `priority?` 'high' | 'medium' | 'low'
- `title?` string
- `body?` string
- `notes?` string
- `due_date?` ISO date
- `snoozed_until?` ISO date
- `assigned_to?` UUID
- `clear_due_date?` boolean
- `clear_snooze?` boolean

**Returns:** `{ pulse: PulseItem, recipe: 'pulse-detail' }`

---

## Pulse Session Functions (ki_pulse_config + ki_pulse_sessions)

### list_pulse_queue
Returns all clients with an active pulse config and their latest/next session.
Includes aggregate stats for the Queue header strip.

**Params:**
- `urgency?` 'overdue' | 'due_soon' | 'upcoming' | 'completed' | 'no_session'
- `frequency?` 'monthly' | 'bimonthly' | 'quarterly' | 'custom'
- `limit?` number (default 50, max 200)
- `offset?` number

**Returns:** `{ items: PulseQueueItem[], stats: PulseQueueStats, total: number, recipe: 'pulse-queue' }`

PulseQueueStats: `{ overdue_count, due_this_week_count, upcoming_count, completed_ytd, total_configs }`

---

### get_pulse_config
Returns the active pulse config for a specific client.

**Params:**
- `client_id` number — required

**Returns:** `{ config: PulseConfig | null, recipe: 'pulse-config' }`

---

### upsert_pulse_config
Creates or updates the active pulse config for a client. If an active config exists, it is updated; otherwise a new one is created.

**Params:**
- `client_id` number — required
- `frequency?` 'monthly' | 'bimonthly' | 'quarterly' | 'custom'
- `custom_days?` number (required when frequency = 'custom')
- `template?` 'full_review' | 'quick_checkin' | 'annual_review' | 'gap_followup'
- `medium?` 'phone' | 'google_meet' | 'in_person' | 'whatsapp'
- `preferred_day?` 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'
- `preferred_time?` 'morning' | 'afternoon' | 'evening'
- `jtd_auto_schedule?` boolean
- `vani_auto_brief?` boolean
- `vani_include_gaps?` boolean
- `client_reminder?` boolean
- `contact_id?` number
- `assigned_to?` UUID

**Returns:** `{ config: PulseConfig, recipe: 'pulse-config' }`

---

### create_pulse_session
Creates a new pulse session (meeting instance). Initial status is always 'scheduled'.

**Params:**
- `client_id` number — required
- `scheduled_at` ISO datetime — required
- `config_id?` number — links to ki_pulse_config (omit for ad-hoc)
- `contact_id?` number
- `template?` 'full_review' | 'quick_checkin' | 'annual_review' | 'gap_followup'
- `medium?` 'phone' | 'google_meet' | 'in_person' | 'whatsapp'
- `jtd_appointment_id?` string
- `assigned_to?` UUID

**Returns:** `{ session: PulseSession, recipe: 'pulse-session' }`

---

### update_pulse_session
Updates a pulse session. Handles status transition side-effects in SQL:
- `→ in_progress` : sets started_at
- `→ completed` : sets ended_at, computes duration_minutes
- `→ missed / cancelled` : sets ended_at

**Params:**
- `id` number — required
- `status?` 'scheduled' | 'prep_ready' | 'in_progress' | 'completed' | 'missed' | 'cancelled'
- `scheduled_at?` ISO datetime
- `template?` string
- `medium?` string
- `jtd_appointment_id?` string
- `meeting_notes?` string
- `vani_brief?` string
- `vani_summary?` string
- `summary_confirmed?` boolean
- `report_generated?` boolean
- `duration_minutes?` number
- `next_session_id?` number
- `assigned_to?` UUID

**Returns:** `{ session: PulseSession, recipe: 'pulse-session' }`

---

### get_client_pulse_history
Returns pulse sessions for a specific client, newest first.
Each session includes its actions as a JSON array.

**Params:**
- `client_id` number — required
- `limit?` number (default 20, max 100)
- `offset?` number

**Returns:** `{ sessions: PulseHistoryItem[], total: number, recipe: 'pulse-history' }`

---

## Session Status Lifecycle

```
scheduled → prep_ready   (VaNi brief generated 48h before)
          → in_progress  (MFD starts meeting)
          → completed    (notes saved, summary confirmed)
          → missed       (auto-flagged if >3 days past scheduled_at)
          → cancelled
```

## Urgency Classification (for Queue)

| urgency     | condition |
|-------------|-----------|
| overdue     | scheduled_at < NOW() and status not completed/cancelled |
| due_soon    | scheduled_at within next 7 days |
| upcoming    | scheduled_at > 7 days from now |
| completed   | status = completed or cancelled |
| no_session  | no session created yet |
