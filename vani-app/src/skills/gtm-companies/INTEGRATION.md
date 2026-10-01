# gtm-companies — integration notes

A reference surface (noun) over the tenant's own prospects. Both reads are REAL
on the API; nothing here is previewed.

| Call | Screen | Exists today | Notes |
|---|---|---|---|
| `prospect-skill.get_records` (scope `mine`, `search`, `research`) | list | **REAL** | Same rows the hot list is built from. `research` filter values: `none / done / failed / decided`. Postgres counts arrive as strings. |
| `prospect-skill.get_prospect` (`ref`) | detail | **REAL** | Returns `{ prospect, people, tags, brief, offers, source_row }` in one call — the dossier. `source_row` is the ORIGINAL file row, every column, including ones no mapping claimed. |

No writes. Anything you DO with a company is a pathway step (Build the
audience) and links back there.

Why it exists: the imported list landed in `gt_prospects` and was visible only
as step 1 of a pathway — "where do I see the list I imported" had no answer
(Charan, 2026-09-25). This is the answer.
