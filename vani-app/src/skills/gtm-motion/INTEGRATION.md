# gtm-motion / gtm-today / gtm-journeys / gtm-channels — integration notes

Read-only where the backend has no write yet; nothing here sends. Deltas per call:

| Call | Exists | Delta |
|---|---|---|
| `gtm.motion_state`, `gtm.motion_advance`, `gtm.motion_restart` | — | pathway position; same home as `gtm.audience_state` (schema question) |
| `prospect-skill.get_segments` / `save_segment` | yes | add `why`, `offer`, `ask`, `people[]` (from verdict + best-fit offer); confirm-all → per-segment save |
| `story-skill.list_stories` / `approve_story` / `list_kinds` | yes | add `trace` (read / voice / not_read — the storyteller already reports dropped nodes), `segment_id`, `body[]` |
| `gtm.cadence_plan` | — | loop `cadence-skill.get_cadence` per contact, or add a batch read returning `in_window / open_now / reason` |
| `cadence-skill.reserve_touch` | yes | per contact; the screen reserves one slot per open person |
| `cadence-skill.get_policy` | yes | matches |
| `cadence-skill.reservations` | — | list held `gt_touch_reservations` for the tenant |
| `channel-skill.get_channels` | yes | add `identity` (the tenant flag: first-party vs tenant) and `status` ∈ connected / not_connected / assisted / platform |
| `gtm.touch_log` | — | read `gt_touch_log` by tenant; empty until anything sends |
| `attention-skill.get_attention` / `decide_attention` | yes | matches SKILL.md; add `person`, `contact_ref` per item |
| `journey-skill.list_journeys` | yes | add `person`, `contact_ref`, `offer` per row |

Send stays locked until a consent + suppression model exists (design note §5).
