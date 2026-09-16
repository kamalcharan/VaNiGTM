/**
 * Review and publish researched domain packs. An OPERATOR tool, run on a box
 * with database access:
 *
 *   npm run packs                     # what is waiting for review
 *   npm run packs -- --show <runId>   # read one draft in full
 *   npm run packs -- --publish <runId>
 *   npm run packs -- --reject <runId> "reason"
 *
 * WHY A CLI AND NOT A SCREEN
 * A domain pack is PLATFORM data — every tenant in the industry inherits it.
 * The JWT's `is_admin` is a TENANT admin, so exposing publish behind it would
 * let any tenant's admin write a row every one of their competitors reads.
 * Until there is a real platform-operator role, the safe surface is one that
 * needs database access, not a token. That is a deliberate limitation, not an
 * oversight: it is the difference between "not built yet" and "built wrong".
 *
 * Publishing is ONE transaction — every family of a draft lands together or
 * none does. A half-published industry would show a tenant three of five role
 * families with nothing saying the rest were missing.
 *
 * Packs are append-only (V-14): publishing NEVER overwrites, it inserts at
 * max(version)+1 for the code. Re-publishing a corrected draft is a new
 * version and the old one stays readable.
 */

import 'dotenv/config';
import { Pool } from 'pg';

interface DraftPack {
  code: string;
  domain: string;
  payload: Record<string, any>;
}

interface Draft {
  kind: string;
  domain: string;
  industry: string;
  researched_at: string;
  prompt_version: number;
  packs: DraftPack[];
}

const pool = new Pool({
  connectionString: process.env.DB_PRIMARY,
  ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

/* ── Read ───────────────────────────────────────────────────────────────── */

async function list(): Promise<void> {
  // Cross-tenant on purpose: packs are platform data and an operator is
  // reviewing all of them, not one tenant's.
  const r = await pool.query(
    `SELECT id, tenant_id, started_at, awaiting_input
       FROM gt_agent_runs
      WHERE agent_name = 'DOMAIN_ENRICHMENT_REQUESTED'
        AND status = 'awaiting'
      ORDER BY started_at DESC`,
  );

  if (!r.rows.length) {
    console.log('\nNothing awaiting review.\n');
    return;
  }

  console.log(`\n${r.rows.length} draft(s) awaiting review:\n`);
  for (const row of r.rows) {
    const d: Draft = row.awaiting_input;
    const families = (d.packs ?? []).map((p) => p.payload.family_name).join(', ');
    console.log(`  run ${row.id}  ${d.domain}`);
    console.log(`    industry as typed : ${d.industry}`);
    console.log(`    researched        : ${d.researched_at}`);
    console.log(`    families (${(d.packs ?? []).length})     : ${families}`);
    console.log('');
  }
  console.log(`Read one:  npm run packs -- --show <runId>\n`);
}

async function show(runId: string): Promise<void> {
  const d = await readDraft(runId);
  console.log(`\n${d.domain}  —  "${d.industry}"`);
  console.log(`researched ${d.researched_at} with prompt v${d.prompt_version}\n`);

  for (const p of d.packs) {
    const s = p.payload.vara.starter;
    console.log(`  ${p.payload.family_name}   [${p.code}]`);
    if (p.payload.hint) console.log(`    ${p.payload.hint}`);
    console.log(`    titles     : ${(p.payload.suggested_titles ?? []).join(', ') || '—'}`);
    console.log(`    threshold  : ${s.threshold}`);
    const total = s.musthaves.reduce((n: number, m: any) => n + m.weight, 0);
    console.log(`    musthaves  : (weights total ${total})`);
    for (const m of s.musthaves) {
      const years = m.years ? `, ${m.years}y` : '';
      console.log(`       ${String(m.weight).padStart(3)}%${years}  ${m.name}`);
      if (m.why) console.log(`              ↳ ${m.why}`);
    }
    console.log(`    knockouts  :`);
    for (const k of s.knockouts) console.log(`       ${k.label}: ${k.rule}`);
    console.log('');
  }
  console.log(`Publish:  npm run packs -- --publish ${runId}\n`);
}

async function readDraft(runId: string): Promise<Draft> {
  const r = await pool.query(
    `SELECT awaiting_input, status FROM gt_agent_runs WHERE id = $1`, [runId]);
  if (!r.rows.length) throw new Error(`No run ${runId}`);
  if (r.rows[0].status !== 'awaiting') {
    throw new Error(`Run ${runId} is '${r.rows[0].status}', not 'awaiting' — already handled?`);
  }
  const d: Draft = r.rows[0].awaiting_input;
  if (d?.kind !== 'domain_pack_review') {
    throw new Error(`Run ${runId} is not a domain-pack review`);
  }
  return d;
}

/* ── Write ──────────────────────────────────────────────────────────────── */

export async function publish(runId: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-read inside the transaction. The status check is the idempotency
    // guard: a second --publish finds 'completed' and refuses rather than
    // inserting a duplicate version.
    const r = await client.query(
      `SELECT awaiting_input, status FROM gt_agent_runs WHERE id = $1 FOR UPDATE`, [runId]);
    if (!r.rows.length) throw new Error(`No run ${runId}`);
    if (r.rows[0].status !== 'awaiting') {
      throw new Error(`Run ${runId} is '${r.rows[0].status}' — nothing to publish`);
    }
    const draft: Draft = r.rows[0].awaiting_input;

    const published: string[] = [];
    for (const p of draft.packs) {
      // Append-only: never UPDATE an existing pack. A correction is a new
      // version, and the previous one stays readable for anything that
      // recorded which version it used.
      const v = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM vani_domain_pack WHERE code = $1`,
        [p.code],
      );
      await client.query(
        `INSERT INTO vani_domain_pack (code, version, domain, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [p.code, v.rows[0].next, p.domain, JSON.stringify(p.payload)],
      );
      published.push(`${p.code} v${v.rows[0].next}`);
    }

    await client.query(
      `UPDATE gt_agent_runs
          SET status = 'completed', completed_at = now(), awaiting_input = NULL,
              output = COALESCE(output, '{}'::jsonb)
                       || jsonb_build_object('published', $2::jsonb,
                                             'published_at', now()::text)
        WHERE id = $1`,
      [runId, JSON.stringify(published)],
    );

    // All families or none. A partially published industry is worse than an
    // unpublished one — a tenant would see three of five role families with
    // nothing telling them the rest exist.
    await client.query('COMMIT');
    return published;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function reject(runId: string, reason: string): Promise<void> {
  // 'failed' rather than 'completed', and the reason is kept. The claim's
  // in-progress check ignores both, so rejecting an industry frees it for a
  // fresh attempt — which is the point: a bad draft should be re-researchable,
  // not a permanent block.
  const r = await pool.query(
    `UPDATE gt_agent_runs
        SET status = 'failed', completed_at = now(), awaiting_input = NULL,
            error_trace = $2
      WHERE id = $1 AND status = 'awaiting'`,
    [runId, `Rejected at review: ${reason}`],
  );
  if (!r.rowCount) throw new Error(`Run ${runId} is not awaiting review`);
}

/** Release the pool. Exported so a test can close it without process.exit. */
export async function close(): Promise<void> {
  await pool.end();
}

/* ── CLI ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? null : args[i + 1] ?? '';
  };

  const showId = flag('--show');
  const publishId = flag('--publish');
  const rejectId = flag('--reject');

  if (showId) {
    await show(showId);
  } else if (publishId) {
    const rows = await publish(publishId);
    console.log(`\nPublished ${rows.length} pack(s):`);
    for (const p of rows) console.log(`  ${p}`);
    console.log('');
  } else if (rejectId) {
    const reason = args[args.indexOf('--reject') + 2] ?? 'no reason given';
    await reject(rejectId, reason);
    console.log(`\nRejected run ${rejectId}. The industry is free to be researched again.\n`);
  } else {
    await list();
  }
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(`\n[packs] ${err.message}\n`);
      await pool.end();
      process.exit(1);
    });
}
