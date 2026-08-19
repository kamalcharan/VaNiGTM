/**
 * vara_match_log writer — one call per semantic-match decision.
 *
 * Every worker that lets a nearest-neighbour match influence an outcome
 * MUST call recordMatch() before that outcome is committed. Not after,
 * not "if we remember". Without this, a similarity match becomes a
 * hidden input to a decision — exactly what the "model is never a legal
 * actor" invariant exists to prevent.
 *
 * ── Kinds are enum-like ──────────────────────────────────────────────
 * matched_from_kind / matched_to_kind values MUST match the CHECK
 * constraint in migration 246. Adding a new kind is a schema change to
 * raise, not a "just call it something new" moment.
 */

import type { Pool, PoolClient } from 'pg';

export type MatchKind =
  | 'jd'
  | 'family'
  | 'candidate'
  | 'skill'
  | 'chat_turn'
  | 'extraction';

export interface RecordMatchInput {
  tenantId: string;
  from: { kind: MatchKind; id: string };
  to:   { kind: MatchKind; id: string };
  /** Cosine similarity in [0, 1]. 1 = identical, 0 = orthogonal. */
  similarity: number;
  /** Which worker used the match. E.g. 'vara.family_recommender'. */
  usedBy: string;
  /** What outcome the match fed. E.g. 'family_pack_suggested'. */
  usedFor: string;
  /** Optional evidence blob — model, threshold, alternates. Ids only per V-13. */
  details?: Record<string, unknown>;
}

/**
 * Write a match row. Runs inside the caller's transaction if a client is
 * supplied — the intended pattern, so the audit row and the outcome it
 * feeds commit or roll back together.
 */
export async function recordMatch(
  db: Pool | PoolClient,
  input: RecordMatchInput,
): Promise<string> {
  const sim = Math.max(0, Math.min(1, input.similarity));
  const r = await db.query(
    `INSERT INTO vara_match_log
       (tenant_id, matched_from_kind, matched_from_id, matched_to_kind, matched_to_id,
        similarity, used_by, used_for, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id`,
    [
      input.tenantId,
      input.from.kind, input.from.id,
      input.to.kind, input.to.id,
      sim,
      input.usedBy,
      input.usedFor,
      JSON.stringify(input.details ?? {}),
    ],
  );
  return r.rows[0].id;
}
