# VaNi AI — WS2.2–2.5 SQL drafts

**Status: draft, reviewable, NOT applied to `vani_gtm_db`.** Written against
Charan's five G1 rulings (2026-07-31) recorded in `docs/WS2.1-schema-report.md`
§9 and the ruling message itself. Apply nothing without an explicit go-ahead.

## Apply order

1. `ws2.2-schema-and-roles.sql` — `vani` schema, vendored pgjwt functions,
   JWT-claim helper functions, `vani_authenticator`/`vani_anon`/`vani_partner`/
   `vani_owner` roles, all six tables (`assessment_def`, `assessment_response`,
   `lead`, `report`, `partner`, `lead_event`), RLS policies, table grants.
2. `ws2.3-assessment-flow.sql` — `vani.score_response()` (deterministic
   scoring, config-driven off any `assessment_def.definition`), plus the three
   RPCs anonymous users call: `save_answer`, `complete_assessment`,
   `capture_lead`.
3. `ws2.4-login.sql` — `vani.login()`, the console auth RPC.
4. `ws2.5-seed.sql` — creates the Vikuna Consulting tenant (ruling 4) and
   seeds the `ai-recovery` assessment definition verbatim from
   `docs/vani-ai-recovery-assessment-definition.json`.
5. `ws2.6-isolation-test.sql` — **not applied as migration**, a verification
   script to run afterward, in a scratch session, to prove ruling 1's
   isolation claim against this specific database rather than assume it.

Each file is its own transaction (`BEGIN`/`COMMIT`) and safe to review/apply
independently in order; later files depend on earlier ones having run.

## Operational prerequisites (outside version control, Charan/WS0)

- `vani_authenticator`'s password — generate and `ALTER ROLE vani_authenticator
  PASSWORD '...';` directly, never commit it. ws2.2 creates the role with a
  placeholder password precisely so the file is safe to commit.
- `vani.jwt_secret` — `ALTER DATABASE vani_gtm_db SET vani.jwt_secret =
  '...';`. Must match the WS0.4 PostgREST instance's own `jwt-secret` config
  exactly (PostgREST verifies what `vani.sign()` in ws2.4 issues).
- **WS0.4: a second PostgREST container.** One PostgREST instance serves one
  database/schema set; the existing instance serving `kaala_dristi` (WS2.1's
  infra notes) can't also serve `vani`. The new instance's config needs
  `db-schemas = "vani"`, `db-anon-role = "vani_anon"`,
  `db-uri` pointing at `vani_authenticator`, and the matching `jwt-secret`
  above. This is infrastructure, not something these SQL files can set up.
- The first owner login (a `vn_users` row + a `vani.partner` row with
  `role='owner'`) is deliberately NOT in `ws2.5-seed.sql` — see the comment at
  the bottom of that file for the shape to run by hand with a real,
  never-committed password.

## What's still open (not blocking this draft, per Charan's ruling)

- WS0.1 — whether the worker/`AGENT_REGISTRY` is deployed against
  `vani_gtm_db` (gates WS4.1 orchestration, not this schema).
- The CRO branch sequencing call.
- The one-line Supabase-naming-convention confirmation (WS2.1 §6 — Charan's
  ruling already answers this: self-hosted `postgres:17-alpine` +
  `postgrest/postgrest:v12.2.3` in Docker per the infra doc, `anon`/
  `authenticated`/`service_role` is just a copied naming convention, not an
  actual Supabase project. Worth Charan's one-line sign-off on record per his
  own message, but doesn't change anything in these files).

## Judgment calls made beyond the five rulings (flag if you'd rather I do it differently)

- **`vani.partner` doubles as the console-identity table** (`role` column,
  `'owner'` or `'partner'`), rather than adding a seventh table. Ruling 1
  enumerated exactly six tables; this keeps that count while still needing
  somewhere for `vani.login()` to resolve role + partner_id without touching
  `vn_roles`/`vn_user_roles` (unexplored in WS2.1, and coupling to their
  unknown shape would work against ruling 1's whole minimal-blast-radius
  argument, applied consistently to auth as well as data).
- **Answers are stored as `{question_id: option_index}`**, not the option's
  score value — `vani.score_response()` always re-derives the score from
  `assessment_def.definition` server-side, so a tampered client answer can
  only select a different valid option, never inject an arbitrary score.
- **`vani.complete_assessment`/`capture_lead` are SECURITY DEFINER functions
  that check a bearer `anon_token`**, rather than granting `vani_anon` direct
  table INSERT/UPDATE and relying on RLS — an identity-less anonymous role has
  no JWT claims for RLS to check, so the token check inside the function is
  the actual security boundary, not a redundant one.
- **`report` access by `report_token` is a bearer-capability pattern**
  (`USING (revoked_at IS NULL)` for `vani_anon`, no further row filtering) —
  matches the App Spec's private `/r/{token}` link design; documented in
  ws2.2 so it doesn't read as an oversight on the next review pass.
