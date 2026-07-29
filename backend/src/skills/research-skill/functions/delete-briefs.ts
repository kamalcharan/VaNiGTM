/**
 * research-skill: delete_briefs
 *
 * Throw away research so it can be run again from scratch.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────
 *
 * `refresh` re-crawls and overwrites, which is the right tool most of the
 * time. It is the wrong one when a batch produced garbage — a truncating
 * model, a half-written offer, a budget stop midway — because the rows are
 * still there colouring the stats, the fit filter and the Learning Graph
 * while you look at them. Sometimes the honest move is to delete the run and
 * start over, and refusing to offer that just means doing it in psql.
 *
 * ── WHY IT IS FUSSY ───────────────────────────────────────────────────
 *
 * Deleting a brief throws away a crawl, an extraction and — where a human
 * decided — a ruling that the Learning Graph learns from. So:
 *
 *   - a scope is REQUIRED. There is no "delete everything" default; you name
 *     a status, a tag, or specific companies.
 *   - `confirm: true` is required, and the count is returned by a dry run
 *     first, so nobody deletes 144 rows meaning to delete 4.
 *   - briefs a human has DECIDED are protected unless `include_decided` is
 *     passed. Those carry the reviewer's own words and are the most expensive
 *     thing on the table to recreate — a re-crawl costs tokens, a re-read
 *     costs their afternoon.
 */

import { SkillContext } from '../../../shared/types';

interface DeleteBriefsParams {
  /** One status, e.g. 'extract_failed' or 'unreadable'. */
  status?: string;
  /** Everything in a cohort tag. */
  tag_id?: number;
  /** Specific companies. */
  prospect_ids?: number[];
  /** Also delete briefs a human has ruled on. Off by default. */
  include_decided?: boolean;
  /** Nothing is deleted without this; without it you get the count. */
  confirm?: boolean;
}

export async function delete_briefs(params: DeleteBriefsParams, ctx: SkillContext) {
  const status = String(params.status ?? '').trim() || null;
  const tagId = Number(params.tag_id) || null;
  const ids = Array.isArray(params.prospect_ids)
    ? params.prospect_ids.map(Number).filter(Number.isFinite)
    : [];

  if (!status && !tagId && ids.length === 0) {
    throw new Error(
      'Name what to delete: a status, a cohort tag, or specific companies. '
      + 'There is no "delete everything" — a brief is a crawl, an extraction '
      + 'and sometimes your own ruling, and none of that should go on a '
      + 'mis-click.',
    );
  }

  const scope = {
    tenant_id: ctx.tenant_id,
    is_live: ctx.is_live,
    status,
    tag_id: tagId,
    ids: ids.length > 0 ? ids : null,
    include_decided: params.include_decided === true,
  };

  // The same WHERE clause counts and deletes, so the number shown is exactly
  // the number that goes.
  const WHERE = `
       WHERE b.tenant_id = $tenant_id
         AND b.is_live   = $is_live
         AND ($status::text IS NULL OR b.status = $status::text)
         AND ($ids::bigint[] IS NULL OR b.prospect_id = ANY($ids::bigint[]))
         AND ($tag_id::bigint IS NULL OR EXISTS (
               SELECT 1 FROM gt_prospect_tags pt
                WHERE pt.prospect_id = b.prospect_id
                  AND pt.tag_id      = $tag_id::bigint))
         AND ($include_decided::boolean OR b.decided_at IS NULL)`;

  const counted = await ctx.db.query<{ n: string; decided: string }>(
    `SELECT count(*)::text AS n,
            count(*) FILTER (WHERE b.decided_at IS NOT NULL)::text AS decided
       FROM gt_account_briefs b ${WHERE}`,
    scope,
  );
  const matched = Number(counted.rows[0]?.n ?? 0);
  const decided = Number(counted.rows[0]?.decided ?? 0);

  // Dry run: answer the question, delete nothing.
  if (params.confirm !== true) {
    return {
      matched,
      decided_included: decided,
      deleted: 0,
      confirmed: false,
      message: matched === 0
        ? 'Nothing matches that.'
        : `${matched} brief(s) would be deleted`
          + (decided > 0 ? `, ${decided} of them carrying your own ruling` : '')
          + '. Nothing has been deleted — send confirm to go ahead.',
      recipe: 'delete-preview' as const,
    };
  }

  return ctx.db.transaction(async (tx) => {
    const res = await tx.query<{ id: number }>(
      `DELETE FROM gt_account_briefs b ${WHERE} RETURNING b.id`,
      scope,
    );
    return {
      matched,
      decided_included: decided,
      deleted: res.rows.length,
      confirmed: true,
      message: `${res.rows.length} brief(s) deleted. Those companies are `
        + 'untouched otherwise and can be researched again.',
      recipe: 'delete-result' as const,
    };
  });
}
