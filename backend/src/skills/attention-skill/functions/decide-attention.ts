/**
 * attention-skill: decide_attention
 *
 * Records what a human decided about a quiet account. One append-only row
 * per decision (migration 238) — there is no status to update and no undo
 * except a further decision.
 *
 * The three actions on /today map here as 'acted', 'snoozed' and 'dismissed'.
 * 'reopened' is the fourth, reachable from the dismissed list.
 *
 * ── WHAT THIS FUNCTION DOES NOT DO ────────────────────────────────────
 *
 * 'acted' does NOT log a touch. research-skill.log_touch does that, and it
 * does considerably more than write a row: it consumes the cadence
 * reservation, marks the story sent, and moves the journey — all in one
 * transaction. Duplicating any of that here would give the system two ways
 * to record a send that agree until they don't.
 *
 * So 'acted' means "this item was taken on from /today", which is a fact
 * about the queue, not about the outreach. Recency on the next render comes
 * from gt_touch_log either way, so an 'acted' row that is never followed by
 * a touch correctly leaves the account quiet — the screen forgets nothing
 * and forgives nothing, which is the desired behaviour for a to-do list.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SkillContext } from '../../../types/skill.types';
import { ATTENTION_CONFIG } from '../../../config/attention.config';

const INSERT_DECISION_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-decision.sql'), 'utf-8');

const DECISIONS = ['acted', 'snoozed', 'dismissed', 'reopened'] as const;
type Decision = typeof DECISIONS[number];

/**
 * Keys allowed in the frozen `shown` payload.
 *
 * This is a client claim about what was on screen, and it cannot be anything
 * else — the server does not render the page and re-running the gap query
 * here would return what is true NOW, which is a different question and
 * would quietly rewrite the audit trail it is supposed to preserve.
 *
 * So it is accepted, but narrowed: known keys, scalar values, no nesting.
 * That keeps it an audit note and stops it becoming an unbounded
 * client-controlled JSON blob on a table nobody can prune.
 */
const SHOWN_KEYS = [
  'days_quiet', 'score', 'journey_state', 'reason', 'last_touch_at', 'company',
] as const;

function narrowShown(raw: unknown): Record<string, string | number | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, string | number | null> = {};
  for (const k of SHOWN_KEYS) {
    const v = src[k];
    if (v === null) { out[k] = null; continue; }
    if (typeof v === 'number' && Number.isFinite(v)) { out[k] = v; continue; }
    if (typeof v === 'string') { out[k] = v.slice(0, 200); continue; }
    // Anything else — objects, arrays, booleans, NaN — is dropped rather
    // than coerced. A coerced audit value is a wrong one.
  }
  return out;
}

interface DecideParams {
  prospect_id: number | string;
  decision: string;
  reason?: string;
  /** Absolute wake date. Wins over snooze_days when both are sent. */
  snooze_until?: string;
  /** Relative alternative, which is what the UI's "in a week" buttons send. */
  snooze_days?: number;
  shown?: unknown;
}

export async function decide_attention(params: DecideParams, ctx: SkillContext) {
  const decision = String(params.decision ?? '').trim() as Decision;
  if (!DECISIONS.includes(decision)) {
    throw new Error(`Invalid decision. Must be one of: ${DECISIONS.join(', ')}`);
  }

  const prospectId = Number(params.prospect_id);
  if (!Number.isFinite(prospectId) || prospectId <= 0) {
    throw new Error('prospect_id is required.');
  }

  const reason = String(params.reason ?? '').trim() || null;

  // Enforced by a CHECK in migration 238 as well. Checked here too so the
  // operator gets a sentence instead of a constraint name.
  if (decision === 'dismissed' && !reason) {
    throw new Error(
      'Dismissing an account needs a reason. Six weeks from now, a considered ' +
      '"not our market" and a mis-click look identical without one.',
    );
  }

  let snoozeUntil: string | null = null;
  if (decision === 'snoozed') {
    if (params.snooze_until) {
      const t = new Date(params.snooze_until);
      if (Number.isNaN(t.getTime())) throw new Error('snooze_until is not a date.');
      if (t.getTime() <= Date.now()) {
        throw new Error('snooze_until must be in the future — a snooze into the past is a no-op.');
      }
      snoozeUntil = t.toISOString();
    } else {
      const days = Number.isFinite(Number(params.snooze_days))
        ? Math.floor(Number(params.snooze_days))
        : ATTENTION_CONFIG.snooze_default_days;
      if (days < 1) throw new Error('snooze_days must be at least 1.');
      snoozeUntil = new Date(Date.now() + days * 86_400_000).toISOString();
    }
  } else if (params.snooze_until || params.snooze_days !== undefined) {
    // The CHECK would reject it; failing here says why.
    throw new Error(`A snooze date only applies to decision = 'snoozed'.`);
  }

  const res = await ctx.db.transaction((tx) =>
    tx.query<{ id: string; prospect_id: string; decision: string; created_at: string }>(
      INSERT_DECISION_SQL,
      {
        $tenant_id:    ctx.tenant_id,
        $is_live:      ctx.is_live,
        $prospect_id:  prospectId,
        $decision:     decision,
        $reason:       reason,
        $snooze_until: snoozeUntil,
        $shown:        JSON.stringify(narrowShown(params.shown)),
        $decided_by:   ctx.user_id || null,
      },
    ));

  // Zero rows means the INSERT … SELECT matched no prospect in this tenant
  // and environment. See insert-decision.sql for why that is the ownership
  // check rather than a separate lookup.
  if (!res.rows[0]) {
    throw new Error('No such account in this environment.');
  }

  return { decision: res.rows[0], recipe: 'attention-decision' as const };
}
