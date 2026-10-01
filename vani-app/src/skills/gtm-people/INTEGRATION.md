# gtm-people — integration notes

Read-only surface over `contact-skill` (16 functions, the most complete backend
in the repo). Shapes in `mock.ts` follow `contact-skill/SKILL.md` verbatim for
`get_contacts` and `get_contact`; the deltas:

| Call | Exists | Delta |
|---|---|---|
| `contact-skill.get_contacts` | yes — `{ contacts[], total }` with `contact_no` | none; `search` param already supported |
| `contact-skill.get_contact` | yes — `{ contact: identity + GTM fields + channels[] }` | add `prospect_id` / `prospect_ref` (the brief it was promoted from), `touches[]` (from `gt_touch_log` by `contact_id`, migration 223) and `journey` (from `gt_journeys`) — or the screen makes three calls |

Dates go through `lib/format.ts` (`DD-MMM-YYYY`), never inline.
