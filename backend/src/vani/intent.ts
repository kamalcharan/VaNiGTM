/**
 * Intent routing — free text from a stranger on someone else's website, to
 * one thing a live agent can actually do.
 *
 * ── Three bands, and none of them is a silent fallback ───────────────────
 *
 *   score >= HIGH, clear of the runner-up      ROUTE         act on it
 *   LOW <= score < HIGH, or too close to call  DISAMBIGUATE  "did you mean"
 *   score <  LOW                               CATCH-ALL     say what I can do
 *
 * Every band is a VISIBLE state the visitor can see and act on, which is what
 * separates this from the thing rule 12 forbids. A router that quietly picked
 * its best guess below the threshold would look identical to a confident one
 * and be wrong a fraction of the time nobody could measure.
 *
 * ── Embeddings, not an LLM, and not because it is cheaper ────────────────
 * It IS cheaper — an order of magnitude per message — but the argument is
 * shape: nearest-neighbour over a small labelled set is exactly what intent
 * selection is. An LLM asked to pick from a list can invent a fourth option,
 * and then the catch layer never learns the question was a miss.
 *
 * Disambiguation rather than a model second opinion, for the same reason: the
 * visitor is right there, one click is free, and they know what they meant
 * better than a model guessing on their behalf. The click also produces a
 * cleaner training signal than any confidence score.
 *
 * ── Tier 1 is a click, and it needs none of this ─────────────────────────
 * Boot returns the live agents' visitor intents as chips. A click IS the
 * routing — no embedding, no model, `actor_type='rule'`. This module is tier
 * 2, for when someone types instead. Most visitors will never reach it.
 *
 * ── What is written, and what is never written ───────────────────────────
 * Every resolution writes a vani_intent_match row BEFORE returning — the
 * invariant migration 246 states, applied to routing: a similarity that
 * influences an outcome must be evidence first. The row carries the query
 * EMBEDDING (what clustering needs) and a REDACTED form (so a human can name
 * a cluster the machine found). Never the raw message: the person typing is a
 * stranger on a third party's site who has consented to nothing.
 */

import type { Pool, PoolClient } from 'pg';
import { embedText, toVectorLiteral } from './embed';

/** Confident enough to act without asking. */
const HIGH = parseFloat(process.env.VANI_INTENT_HIGH ?? '0.72');
/** Below this, we do not offer a guess at all. */
const LOW = parseFloat(process.env.VANI_INTENT_LOW ?? '0.45');
/**
 * How far clear of the runner-up a top match must be to route without asking.
 * Two intents scoring 0.80 and 0.78 is not confidence, it is a coin flip with
 * a high number on it — so the margin overrides HIGH, never the other way.
 */
const MARGIN = parseFloat(process.env.VANI_INTENT_MARGIN ?? '0.05');
/** How long a routing record lives. Explicit beats "someday". */
const RETENTION_DAYS = parseInt(process.env.VANI_INTENT_RETENTION_DAYS ?? '90', 10);

/** Longest redacted query we keep. A cluster label needs a phrase, not an essay. */
const REDACTED_MAX = 500;

export class IntentRouterError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'IntentRouterError';
  }
}

export interface IntentOption {
  id: string;
  agent_code: string;
  code: string;
  label: string;
  description: string;
  score?: number;
}

export type IntentResolution =
  | { outcome: 'routed'; intent: IntentOption; score: number }
  | { outcome: 'disambiguated'; options: IntentOption[] }
  | { outcome: 'unmatched'; options: IntentOption[] };

/**
 * The ONE definition of what an intent's embedding is computed from. The
 * backfill uses it; anything that ever re-embeds must use it too. Change this
 * and every stored vector describes text composed under the old rule, so a
 * change here means a full re-run, not a redeploy.
 */
export function intentEmbedText(i: { label: string; description: string; examples: string[] }): string {
  return [i.label, i.description, ...i.examples]
    .map((p) => p?.trim().replace(/[.!?]+$/, ''))
    .filter(Boolean)
    .join('. ');
}

/**
 * Strip the identifiers a visitor volunteers without being asked. Order
 * matters: emails and links are removed before handles, because both contain
 * the patterns the later rules look for.
 *
 * This is not a claim to catch everything — a name typed as a name survives
 * it, and no regex fixes that. It is why the RAW text is never stored at all
 * and why retain_until exists: redaction reduces the exposure, retention
 * bounds it.
 */
export function redactQuery(raw: string): string {
  return raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\bhttps?:\/\/\S+/gi, '[link]')
    // No \b before the optional '+': a word boundary cannot precede '+', so
    // anchoring there left the country code sitting outside the redaction and
    // '+91 98765 43210' came out as '+[phone]'.
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[phone]')
    .replace(/(^|\s)@\w+/g, '$1[handle]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, REDACTED_MAX);
}

/**
 * Every visitor intent reachable in this workspace right now: live agents
 * only, visitor surface only, active only.
 *
 * Used for the catch-all list (which needs no embedding — a chip is a click)
 * and, when embedded, as the router's candidate set.
 */
export async function liveVisitorIntents(pool: Pool, tenantId: string): Promise<IntentOption[]> {
  const r = await pool.query(
    `SELECT i.id, a.code AS agent_code, i.code, i.label, i.description
       FROM vani_tenant_agent ta
       JOIN vani_agent a        ON a.id = ta.agent_id
       JOIN vani_agent_intent i ON i.agent_id = a.id
      WHERE ta.tenant_id = $1
        AND ta.status = 'live'
        AND i.surface = 'visitor'
        AND i.status  = 'active'
      ORDER BY i.sort_order, i.label`,
    [tenantId],
  );
  return r.rows as IntentOption[];
}

interface ResolveArgs {
  pool: Pool;
  /** vani_tenant.id, from the visitor session token — never a request body. */
  tenantId: string;
  /** The widget session. Opaque, and never a person. */
  sessionRef?: string | null;
  query: string;
}

export async function resolveIntent(args: ResolveArgs): Promise<IntentResolution> {
  const { pool, tenantId, sessionRef = null, query } = args;

  if (!query || !query.trim()) {
    throw new IntentRouterError('EMPTY_QUERY', 'resolveIntent called with empty text');
  }

  const all = await liveVisitorIntents(pool, tenantId);

  // Zero visitor intents is a legitimate product state, not a fault: an agent
  // whose whole job is done FOR the tenant declares none, and Nova is expected
  // to be exactly that. Nothing to route to, nothing to log against — the
  // widget says what it can do, which is nothing, and says it plainly.
  if (!all.length) return { outcome: 'unmatched', options: [] };

  const embedded = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM vani_tenant_agent ta
       JOIN vani_agent a        ON a.id = ta.agent_id
       JOIN vani_agent_intent i ON i.agent_id = a.id
      WHERE ta.tenant_id = $1 AND ta.status = 'live'
        AND i.surface = 'visitor' AND i.status = 'active'
        AND i.embedding IS NOT NULL`,
    [tenantId],
  );

  // Intents exist but none is embedded: a deployment fault, not a miss. Saying
  // "I did not understand" here would blame the visitor for an unpulled model,
  // and matching against whichever subset happened to be embedded would be the
  // silent-degradation rule 12 exists to forbid.
  if (embedded.rows[0].n === '0') {
    throw new IntentRouterError(
      'ROUTER_NOT_EMBEDDED',
      `No live visitor intent has an embedding for tenant ${tenantId}. Run \`npm run intents:embed\`.`,
    );
  }

  const vec = toVectorLiteral(await embedText(query));

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // Cosine similarity, 1.0 = identical. Intents without an embedding are
    // excluded rather than scored as zero — a NULL is "not reachable by text
    // yet", which is not the same claim as "nothing like what you asked".
    const top = await client.query(
      `SELECT i.id, a.code AS agent_code, i.code, i.label, i.description,
              1 - (i.embedding <=> $2::vector) AS score
         FROM vani_tenant_agent ta
         JOIN vani_agent a        ON a.id = ta.agent_id
         JOIN vani_agent_intent i ON i.agent_id = a.id
        WHERE ta.tenant_id = $1 AND ta.status = 'live'
          AND i.surface = 'visitor' AND i.status = 'active'
          AND i.embedding IS NOT NULL
        ORDER BY i.embedding <=> $2::vector
        LIMIT 3`,
      [tenantId, vec],
    );

    const rows = top.rows as (IntentOption & { score: number })[];
    const first = rows[0];
    const second = rows[1];

    let resolution: IntentResolution;
    if (first && first.score >= HIGH && (!second || first.score - second.score >= MARGIN)) {
      resolution = { outcome: 'routed', intent: first, score: first.score };
    } else if (first && first.score >= LOW) {
      resolution = { outcome: 'disambiguated', options: rows.filter((r) => r.score >= LOW).slice(0, 3) };
    } else {
      // Catch-all shows EVERYTHING, not the near misses: below LOW the ranking
      // carries no information, and an ordered list of bad guesses reads as a
      // recommendation. Rule 9b — the empty state names the next action.
      resolution = { outcome: 'unmatched', options: all };
    }

    // Before the outcome leaves this function, per the vara_match_log rule.
    await client.query(
      `INSERT INTO vani_intent_match
         (tenant_id, session_ref, outcome, matched_intent, score,
          runner_up_intent, runner_up_score, query_embedding, query_redacted, retain_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, (now() + ($10 || ' days')::interval)::date)`,
      [
        tenantId,
        sessionRef,
        resolution.outcome,
        resolution.outcome === 'routed' ? first.id : null,
        first ? first.score : null,
        second ? second.id : null,
        second ? second.score : null,
        vec,
        redactQuery(query),
        String(RETENTION_DAYS),
      ],
    );

    await client.query('COMMIT');
    return resolution;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
