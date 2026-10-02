/**
 * What a person decides about a pool company (common pool P1-B, prototype
 * screen 2): company or individual practitioner, not a duplicate after all,
 * junk with a reason, restore. Admin only — the caller gates.
 *
 * A TYPE decision is a source row under the `manual` source (tier 85), not an
 * edit of the derived record: the golden record is re-derived from its
 * sources on every run, so an edit would be undone; a source row survives the
 * re-run and carries who decided and when. It speaks for that one field only
 * (rederive's `speaksFor`).
 *
 * Junk is a state with a reason, never a deletion, and restore puts the
 * record back through the Complete test. Every decision is idempotent by
 * shape: deciding the same thing twice leaves the same state.
 */
import type { Pool, PoolClient } from 'pg';
import { assess, rederive, withPoolTx } from './pool-merge';

export const JUNK_REASONS = ['placeholder', 'unreadable', 'consumer', 'defunct', 'out_of_scope', 'spam_source'] as const;
export type JunkReason = typeof JUNK_REASONS[number];
export type Decision =
  | { kind: 'company' }
  | { kind: 'individual' }
  | { kind: 'not_duplicate' }
  | { kind: 'junk'; reason: JunkReason }
  | { kind: 'restore' };

export class DecisionError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'DecisionError'; }
}

const DECISIONS_LOAD_LABEL = 'Decisions by people';

async function decisionsLoad(client: PoolClient): Promise<{ loadId: number; sourceId: number }> {
  const src = await client.query(`SELECT id FROM gt_data_sources WHERE code = 'manual'`);
  if (!src.rows[0]) throw new DecisionError('NO_MANUAL_SOURCE', 'The "manual" data source is missing (migration 264).');
  const sourceId = Number(src.rows[0].id);
  const found = await client.query(
    `SELECT id FROM gt_source_loads WHERE source_id = $1 AND tenant_id IS NULL AND label = $2 AND status = 'active'
      ORDER BY id LIMIT 1`, [sourceId, DECISIONS_LOAD_LABEL]);
  if (found.rows[0]) return { loadId: Number(found.rows[0].id), sourceId };
  // A person's decision is enrichment of what was delivered (migration 264's
  // load_kind), under the `manual` source.
  const made = await client.query(
    `INSERT INTO gt_source_loads (source_id, label, tenant_id, load_kind) VALUES ($1, $2, NULL, 'enrichment') RETURNING id`,
    [sourceId, DECISIONS_LOAD_LABEL]);
  return { loadId: Number(made.rows[0].id), sourceId };
}

export async function decide(pool: Pool, companyId: string, decision: Decision, userId: string) {
  return withPoolTx(pool, async (client) => {
    const c = (await client.query(
      `SELECT id::text, name, lifecycle_state, duplicate_of_id, needs_review FROM gt_universe_companies
        WHERE id = $1 AND merged_into_id IS NULL FOR UPDATE`, [companyId])).rows[0];
    if (!c) throw new DecisionError('NOT_FOUND', `Company #${companyId} is not in the pool.`);

    switch (decision.kind) {
      case 'company':
      case 'individual': {
        const { loadId, sourceId } = await decisionsLoad(client);
        await client.query(
          `INSERT INTO gt_universe_company_sources
             (source_id, load_id, source_record_id, company_id, name, is_individual, method, raw)
           VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7::jsonb)
           ON CONFLICT (source_id, source_record_id) DO UPDATE
             SET is_individual = EXCLUDED.is_individual, raw = EXCLUDED.raw,
                 company_id = EXCLUDED.company_id, updated_at = now()`,
          [sourceId, loadId, `decision:is_individual:${companyId}`, companyId, c.name,
           decision.kind === 'individual',
           JSON.stringify({ decision: 'is_individual', by: userId, at: new Date().toISOString() })]);
        await rederive(client, [companyId]);
        if (decision.kind === 'individual') {
          // An individual practitioner does not belong in a companies pool.
          await client.query(
            `UPDATE gt_universe_companies SET lifecycle_state = 'junk', junk_reason = 'out_of_scope',
                    junk_by = $2, junk_at = now(), admitted_at = NULL, updated_at = now() WHERE id = $1`,
            [companyId, userId]);
        }
        break;
      }
      case 'not_duplicate':
        if (!c.duplicate_of_id) throw new DecisionError('NOT_FLAGGED', `Company #${companyId} is not flagged as a possible duplicate.`);
        // duplicate_of_id stays as history; needs_review closes the question.
        await client.query(`UPDATE gt_universe_companies SET needs_review = false, updated_at = now() WHERE id = $1`, [companyId]);
        break;
      case 'junk':
        if (!(JUNK_REASONS as readonly string[]).includes(decision.reason)) {
          throw new DecisionError('BAD_REASON', `A junk reason must be one of: ${JUNK_REASONS.join(', ')}.`);
        }
        await client.query(
          `UPDATE gt_universe_companies SET lifecycle_state = 'junk', junk_reason = $2, junk_by = $3,
                  junk_at = now(), admitted_at = NULL, updated_at = now() WHERE id = $1`,
          [companyId, decision.reason, userId]);
        break;
      case 'restore':
        if (c.lifecycle_state !== 'junk') throw new DecisionError('NOT_JUNK', `Company #${companyId} is not junk.`);
        await client.query(
          `UPDATE gt_universe_companies SET lifecycle_state = 'candidate', junk_reason = NULL, junk_by = NULL,
                  junk_at = NULL, updated_at = now() WHERE id = $1`, [companyId]);
        break;
    }
    await assess(client, [companyId]);
    return (await client.query(
      `SELECT id::text, lifecycle_state, junk_reason, needs_review, is_individual, complete_checks
         FROM gt_universe_companies WHERE id = $1`, [companyId])).rows[0];
  });
}

/** Retire a delivery: its rows stop counting; every company it fed is re-derived and re-tested. */
export async function retireDelivery(pool: Pool, loadId: number) {
  return withPoolTx(pool, async (client) => {
    const l = (await client.query(
      `UPDATE gt_source_loads SET status = 'retired' WHERE id = $1 AND tenant_id IS NULL AND status = 'active'
       RETURNING id`, [loadId])).rows[0];
    if (!l) throw new DecisionError('NOT_ACTIVE', `Delivery #${loadId} is not an active common-pool delivery.`);
    const ids = (await client.query(
      `SELECT DISTINCT company_id::text AS id FROM gt_universe_company_sources
        WHERE load_id = $1 AND company_id IS NOT NULL`, [loadId])).rows.map((r) => r.id as string);
    await rederive(client, ids);
    await assess(client, ids);
    return { retired: loadId, companies_retested: ids.length };
  });
}
