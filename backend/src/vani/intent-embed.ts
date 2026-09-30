/**
 * Backfill: give every declared intent an embedding.
 *
 *   npm run intents:embed          fill the ones that are NULL
 *   npm run intents:embed -- --all re-embed everything
 *
 * ── Why this is a script and not part of the migration ───────────────────
 * A migration may not assume the LLM host is reachable or that
 * `nomic-embed-text` has been pulled. If it did, applying schema on a box
 * without the model would either fail the migration or — far worse — leave
 * half the intents embedded and the router quietly matching against that
 * half. So intents seed with NULL and this fills them, loudly, on demand.
 *
 * ── Why it is safe to run any time ───────────────────────────────────────
 * Idempotent by default: NULL rows only. `--all` exists for the one case
 * that needs it — intentEmbedText() changing composition, which makes every
 * stored vector describe text composed under the old rule. That is a full
 * re-run, not a redeploy, and this is the flag that does it.
 *
 * Failures are per-row and reported per-row. One unembeddable intent does not
 * stop the rest, and the exit code is non-zero if any failed — so a CI step or
 * a deploy hook notices rather than a person having to read the output.
 */

import { getPool, closePool } from '../db/pool';
import { embedText, toVectorLiteral, EmbedError } from './embed';
import { intentEmbedText } from './intent';

async function main(): Promise<void> {
  const all = process.argv.includes('--all');
  const pool = getPool();

  const { rows } = await pool.query<{
    id: string; agent_code: string; code: string; label: string; description: string; examples: string[];
  }>(
    `SELECT i.id, a.code AS agent_code, i.code, i.label, i.description, i.examples
       FROM vani_agent_intent i
       JOIN vani_agent a ON a.id = i.agent_id
      WHERE i.status = 'active' ${all ? '' : 'AND i.embedding IS NULL'}
      ORDER BY a.code, i.sort_order`,
  );

  if (!rows.length) {
    console.log(all ? 'No active intents to embed.' : 'Every active intent already has an embedding.');
    return;
  }

  console.log(`[intents:embed] ${rows.length} intent(s) to embed${all ? ' (--all: re-embedding)' : ''}`);

  let failed = 0;
  for (const r of rows) {
    const name = `${r.agent_code}.${r.code}`;
    try {
      const vec = await embedText(intentEmbedText(r));
      await pool.query(`UPDATE vani_agent_intent SET embedding = $2::vector WHERE id = $1`, [
        r.id,
        toVectorLiteral(vec),
      ]);
      console.log(`  ok    ${name}`);
    } catch (err) {
      failed++;
      const detail = err instanceof EmbedError ? `${err.code}: ${err.message}` : (err as Error).message;
      console.error(`  FAIL  ${name} — ${detail}`);
    }
  }

  console.log(`[intents:embed] ${rows.length - failed} embedded, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[intents:embed] aborted:', err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
