-- ============================================================================
-- 251_vara_seed_intents.sql
--
-- Vara declares what a VISITOR may ask it for.
--
-- This file is the reference implementation of the rule migration 249 states:
-- the intent TABLE is platform, every intent ROW is an agent's. When Nova
-- lands it ships its own seed file and nobody edits 249 or this one.
--
-- ── Only intents that have somewhere to go ───────────────────────────────
-- Three are seeded, and the two obvious absentees are deliberate:
--
--   NOT seeded: `apply`               — the intake conversation is Phase 5
--   NOT seeded: `application_status`  — there are no applications to report on
--
-- Both are real product surface and both are coming. Neither is declared,
-- because a chip that reads "Apply for this role" and routes to nothing is
-- exactly the defect this session already fixed once: a screen reporting a
-- state it had not verified. `status` here is active|retired with nothing in
-- between ON PURPOSE — there is no way to declare an intent without offering
-- it, so declaring one IS the promise. They get seeded by Phase 5's migration,
-- in the same slice as the thing that answers them.
--
-- What the three below can answer, they can answer TODAY, from data that
-- already exists: POST /embed/boot already returns each live agent's offers
-- (title, one-liner, description, employment type, work mode, locations,
-- band) drawn from the published JD version.
--
-- ── The examples are the substance ───────────────────────────────────────
-- The embedding is built from label + description + examples
-- (intentEmbedText() — one definition, shared by the backfill and any future
-- re-embed). A label alone is too short to match "anything going in backend?"
-- reliably, so the examples carry real phrasings, including the blunt and
-- ungrammatical ones people actually type into a chat box at 11pm.
--
-- Rows land with embedding NULL. `npm run intents:embed` fills them; until it
-- runs these are chip-reachable and not free-text reachable, and the router
-- says so out loud rather than matching against a partial set.
-- ============================================================================

INSERT INTO vani_agent_intent (agent_id, code, label, description, examples, surface, sort_order)
SELECT a.id, v.code, v.label, v.description, v.examples, 'visitor', v.sort_order
  FROM vani_agent a,
       (VALUES
         (
           'browse_openings',
           'See open roles',
           'Show every role this employer currently has published.',
           ARRAY[
             'what jobs are open',
             'do you have any openings',
             'show me the vacancies',
             'are you hiring',
             'anything going in backend',
             'list current positions',
             'what roles are available right now',
             'i am looking for a job here'
           ],
           10
         ),
         (
           'role_detail',
           'Tell me about a role',
           'Explain what one specific role involves, where it is based and how it is worked.',
           ARRAY[
             'tell me more about this role',
             'what does the job involve',
             'is that position remote or in office',
             'where is this role based',
             'what is the salary range for it',
             'is it full time or contract',
             'what would i be doing day to day',
             'more details on the second one'
           ],
           20
         ),
         (
           'how_applying_works',
           'How applying works',
           'Explain how to apply here, what the process looks like and what happens next.',
           ARRAY[
             'how do i apply',
             'where do i send my cv',
             'what is the application process',
             'can i email you my resume',
             'what happens after i apply',
             'how long does it take to hear back',
             'do i need to fill a form'
           ],
           30
         )
       ) AS v(code, label, description, examples, sort_order)
 WHERE a.code = 'vara'
ON CONFLICT (agent_id, code) DO NOTHING;

-- DO NOTHING rather than DO UPDATE, deliberately: changing an intent's
-- examples changes its embedding, so an edit is a new migration plus a
-- re-run of the backfill — not a silent overwrite that leaves the stored
-- vector describing text nobody can read any more.
