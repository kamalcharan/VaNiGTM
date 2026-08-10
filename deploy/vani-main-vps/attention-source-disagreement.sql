-- ============================================================
-- attention-source-disagreement.sql
--
-- Read-only. Checks the claims in docs/gtm/attention-query.md against the
-- live database before G3 · /today ships.
--
-- WHY THIS EXISTS
--   The source-of-truth decision was made from schema and call sites, which
--   are checkable in the repo. Row counts are not. Phase 0's standing lesson
--   is that a local rebuild is not production — four conclusions were wrong
--   until checked. This is the cheap check.
--
-- HOW TO RUN
--   Paste the whole file into any SQL client and run it. It returns three
--   result grids, no psql meta-commands, no RAISE NOTICE — GUI clients hide
--   notices and \-commands are a syntax error outside psql. Both have already
--   bitten this project once each.
--
-- SAFETY
--   SELECT only. It opens no transaction you need to roll back, writes
--   nothing, and creates only temp tables that vanish with the session.
--   Safe against production during business hours.
--
-- WHAT TO DO WITH THE ANSWERS
--   Grid 1  — if gt_activity_feed shows ANY rows with is_live = true, STOP.
--             Something outside this repo writes to it and the analysis in
--             §3 of attention-query.md is wrong.
--   Grid 2  — disagreement is expected and fine. What is NOT fine is
--             gt_touch_log being *older* than the others on many prospects,
--             which would mean touches are being recorded somewhere else.
--   Grid 3  — sizes the "we know nothing about this account" empty state.
-- ============================================================

DROP TABLE IF EXISTS _attn_census;
CREATE TEMP TABLE _attn_census (
    seq        INT,
    scope      TEXT,
    tbl        TEXT,
    rows_total BIGINT,
    rows_live  BIGINT,
    oldest     TEXT,
    newest     TEXT
);

-- ────────────────────────────────────────────────────────────────────────
-- GRID 1 · Census. Does each table hold anything, and is it real?
--
-- Counted per tenant inside that tenant's context, then summed, so the
-- numbers are what the APPLICATION can see rather than what a superuser
-- can. Bootstrapped from vn_tenants, which carries no RLS — gathering the
-- tenant list through the RLS being measured is how the Phase 0 isolation
-- test first returned a confident, meaningless zero.
-- ────────────────────────────────────────────────────────────────────────

DO $census$
DECLARE
    t     RECORD;
    spec  RECORD;
    n     BIGINT;
    nl    BIGINT;
    lo    TIMESTAMPTZ;
    hi    TIMESTAMPTZ;
BEGIN
    FOR spec IN
        SELECT * FROM (VALUES
            (1, 'gt_touch_log',           'touched_at'),
            (2, 'gt_touch_reservations',  'scheduled_at'),
            (3, 'gt_activity_feed',       'created_at'),
            (4, 'gt_journey_events',      'created_at'),
            (5, 'gt_journeys',            'entered_state_at'),
            (6, 'gt_prospects',           'created_at')
        ) AS v(seq, tbl, ts_col)
    LOOP
        IF to_regclass('public.' || spec.tbl) IS NULL THEN
            INSERT INTO _attn_census
            VALUES (spec.seq, 'all tenants', spec.tbl, NULL, NULL, 'TABLE ABSENT', NULL);
            CONTINUE;
        END IF;

        n := 0; nl := 0; lo := NULL; hi := NULL;

        FOR t IN SELECT id FROM vn_tenants ORDER BY id
        LOOP
            PERFORM set_tenant_context(t.id::text);

            EXECUTE format(
                'SELECT count(*), count(*) FILTER (WHERE is_live), min(%I), max(%I) FROM %I',
                spec.ts_col, spec.ts_col, spec.tbl)
            INTO n, nl, lo, hi;

            INSERT INTO _attn_census
            VALUES (spec.seq, t.id::text, spec.tbl, n, nl,
                    to_char(lo, 'YYYY-MM-DD'), to_char(hi, 'YYYY-MM-DD'));
        END LOOP;
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _attn_census
    VALUES (99, 'ERROR', SQLERRM, NULL, NULL, NULL, NULL);
END
$census$;

SELECT
    tbl                              AS "table",
    sum(rows_total)                  AS "rows (all tenants)",
    sum(rows_live)                   AS "rows is_live",
    count(*) FILTER (WHERE rows_total > 0) AS "tenants with rows",
    min(oldest)                      AS "oldest",
    max(newest)                      AS "newest",
    CASE
        WHEN tbl = 'gt_activity_feed' AND coalesce(sum(rows_live), 0) > 0
            THEN 'INVESTIGATE — something outside this repo writes here'
        WHEN tbl = 'gt_activity_feed'
            THEN 'expected: demo fixtures only'
        WHEN tbl = 'gt_touch_log' AND coalesce(sum(rows_total), 0) = 0
            THEN 'INVESTIGATE — no touches logged at all; /today has nothing to rank'
        ELSE ''
    END                              AS "verdict"
FROM _attn_census
WHERE scope <> 'ERROR'
GROUP BY seq, tbl
ORDER BY seq;


-- ────────────────────────────────────────────────────────────────────────
-- GRID 2 · Do the sources disagree about the most recent moment?
--
-- Per prospect, the latest timestamp each source would report. Note that
-- gt_activity_feed is absent from this grid ON PURPOSE: it has no
-- prospect_id, and its contact_id points at ki_contacts, which does not
-- exist in production. There is no supported join. That absence is itself
-- one of the findings.
--
-- Runs for every tenant with prospects, unioned.
-- ────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS _attn_gap;
CREATE TEMP TABLE _attn_gap (
    tenant        TEXT,
    prospect_id   BIGINT,
    prospect      TEXT,
    journey_state TEXT,
    last_touch    TIMESTAMPTZ,
    last_sent_rsv TIMESTAMPTZ,
    last_jrn_evt  TIMESTAMPTZ
);

DO $gap$
DECLARE t RECORD;
BEGIN
    FOR t IN SELECT id FROM vn_tenants ORDER BY id
    LOOP
        PERFORM set_tenant_context(t.id::text);

        INSERT INTO _attn_gap
        SELECT
            t.id::text,
            p.id,
            left(p.name, 40),
            j.state,
            (SELECT max(tl.touched_at)   FROM gt_touch_log tl
              WHERE tl.prospect_id = p.id),
            (SELECT max(r.scheduled_at)  FROM gt_touch_reservations r
              WHERE r.prospect_id = p.id AND r.status = 'sent'),
            (SELECT max(e.created_at)    FROM gt_journey_events e
              WHERE e.journey_id = j.id)
        FROM gt_prospects p
        LEFT JOIN gt_journeys j
               ON j.prospect_id = p.id AND j.is_live = p.is_live
        WHERE p.is_live = true;
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _attn_gap VALUES ('ERROR', NULL, SQLERRM, NULL, NULL, NULL, NULL);
END
$gap$;

SELECT
    count(*)                                                   AS "live prospects",
    count(last_touch)                                          AS "have a touch",
    count(last_sent_rsv)                                       AS "have a sent reservation",
    count(last_jrn_evt)                                        AS "have a journey event",
    count(*) FILTER (
        WHERE last_jrn_evt IS NOT NULL
          AND (last_touch IS NULL OR last_jrn_evt > last_touch + interval '1 day')
    )                                                          AS "journey newer than touch >1d",
    count(*) FILTER (
        WHERE last_sent_rsv IS NOT NULL
          AND (last_touch IS NULL OR last_sent_rsv > last_touch + interval '1 day')
    )                                                          AS "sent rsv newer than touch >1d",
    CASE
        WHEN count(*) FILTER (
            WHERE last_sent_rsv IS NOT NULL AND last_touch IS NULL) > 0
        THEN 'INVESTIGATE — a reservation is marked sent with no touch behind it'
        ELSE 'ok'
    END                                                        AS "verdict"
FROM _attn_gap
WHERE tenant <> 'ERROR';


-- ────────────────────────────────────────────────────────────────────────
-- GRID 3 · How big is each /today empty state, per tenant?
--
-- 'in play' mirrors §5 of attention-query.md. If "in play, never touched"
-- is most of the population, /today's opening screen is mostly the
-- no-touch-data state and that has to be designed for, not treated as an
-- edge case.
-- ────────────────────────────────────────────────────────────────────────

SELECT
    tenant                                                     AS "tenant",
    count(*)                                                   AS "live prospects",
    count(*) FILTER (WHERE journey_state IS NULL)              AS "no journey at all",
    count(*) FILTER (WHERE journey_state IN
        ('qualified','addressed','ready','waiting','answered')) AS "in play",
    count(*) FILTER (WHERE journey_state IN
        ('qualified','addressed','ready','waiting','answered')
        AND last_touch IS NULL)                                AS "in play, never touched",
    count(*) FILTER (WHERE journey_state IN
        ('qualified','addressed','ready','waiting','answered')
        AND last_touch < now() - interval '14 days')           AS "in play, quiet >14d",
    count(*) FILTER (WHERE journey_state = 'parked')           AS "parked"
FROM _attn_gap
WHERE tenant <> 'ERROR'
GROUP BY tenant
ORDER BY tenant;
