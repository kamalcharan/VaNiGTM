/**
 * VaNi GTM — Cohort builder CLI
 *
 * Step 1 of documents/POA-manufacturing-pilot.md, without an HTTP round trip.
 *
 *   npx tsx src/cohort.ts --list-tenants
 *   npx tsx src/cohort.ts --tenant=<uuid>                  (dry run)
 *   npx tsx src/cohort.ts --tenant=<uuid> "--tag=Pilot Manufacturing"
 *   npx tsx src/cohort.ts --tenant-name=ftcci --live
 *
 * ── WHY A CLI AND NOT CURL ────────────────────────────────────────────
 *
 * The same function is already exposed at
 * POST /api/v1/skills/prospect-skill/build_cohort and that stays the API.
 * But running it needs a JWT, a running server, and — on PowerShell — JSON
 * that survives the shell, which CLAUDE.md lesson 9 says it does not. This
 * is a maintenance action run a handful of times, so it gets the same
 * treatment as db:migrate and db:seed: a script that reads DB_PRIMARY and
 * calls the real function. There is no second copy of the rules.
 *
 * DRY RUN IS THE DEFAULT. Writing requires --tag, because the only reason to
 * write is to apply the tag, and a rule this new should be read before it is
 * applied.
 */

import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';
import { build_cohort } from './skills/prospect-skill/functions/build-cohort';
import { clusterNames } from './etl/industry-normalizer';

/* ── Args ───────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1).replace(/^["']|["']$/g, '');
};
const has = (name: string) => flag(name) !== undefined;

/* ── Pool (standalone, matching migrate.ts) ─────────── */

function createPool(): Pool {
  const connectionString = process.env.DB_PRIMARY;
  if (!connectionString) {
    console.error('[Cohort] DB_PRIMARY is required. Run from backend/ with a .env present.');
    process.exit(1);
  }
  return new Pool({
    connectionString,
    ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 4,
    connectionTimeoutMillis: 10_000,
  });
}

/**
 * The named-param translation db/query.ts does, so build_cohort runs against
 * exactly the SQL it will run in the API.
 */
function translate(sql: string, params: Record<string, unknown>) {
  const order: string[] = [];
  const text = sql.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name) => {
    if (!(`$${name}` in params)) throw new Error(`Missing param $${name}`);
    let i = order.indexOf(name);
    if (i === -1) { order.push(name); i = order.length - 1; }
    return `$${i + 1}`;
  });
  return { text, values: order.map((n) => params[`$${n}`]) };
}

function ctxFor(pool: Pool, tenantId: string, isLive: boolean, userId: string) {
  const run = (c: Pool | PoolClient) => (sql: string, params: Record<string, unknown> = {}) => {
    const { text, values } = translate(sql, params);
    return c.query(text, values);
  };
  return {
    tenant_id: tenantId,
    is_live: isLive,
    user_id: userId,
    is_admin: false,
    db: {
      query: run(pool),
      transaction: async (fn: (tx: any) => Promise<any>) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          // Same GUC the API sets — it only survives inside the transaction
          // (CLAUDE.md lesson 1), which is why it goes here and not before.
          await c.query('SELECT set_tenant_context($1)', [tenantId]);
          const out = await fn({ query: run(c) });
          await c.query('COMMIT');
          return out;
        } catch (e) { await c.query('ROLLBACK'); throw e; }
        finally { c.release(); }
      },
    },
  } as any;
}

/* ── Reporting ──────────────────────────────────────── */

const pad = (s: string | number, n: number) => String(s).padStart(n);

function printReport(r: any, isLive: boolean) {
  console.log('');
  console.log(`  cluster        ${r.cluster}`);
  console.log(`  environment    ${isLive ? 'LIVE' : 'sandbox'}`);
  console.log(`  mode           ${r.dry_run ? 'DRY RUN — nothing written' : 'APPLIED'}`);
  console.log('');
  console.log(`  scanned        ${pad(r.scanned, 6)}   active records in this environment`);
  console.log(`  matched        ${pad(r.matched, 6)}`);
  console.log(`  excluded       ${pad(r.excluded, 6)}   matched the cluster, ruled out`);
  console.log(`  no rule        ${pad(r.no_rule, 6)}   an industry no cluster claims`);
  console.log(`  no industry    ${pad(r.no_industry, 6)}   blank in the source file`);
  console.log('');
  console.log(`  with domain    ${pad(r.with_domain, 6)}   <- the number the pilot is sized on`);
  console.log(`  no domain      ${pad(r.without_domain, 6)}   cannot be researched`);

  if (r.variants.length) {
    console.log('\n  Collapsed onto the canonical value:');
    for (const v of r.variants) console.log(`    ${pad(v.rows, 6)}  ${v.industry_raw}`);
  }

  if (r.excluded_samples.length) {
    console.log('\n  Excluded — READ THIS. Anything here that is a real manufacturer');
    console.log('  means the rule is wrong and must be fixed before researching:');
    for (const e of r.excluded_samples) {
      console.log(`    ${pad(e.rows, 6)}  ${e.industry_raw}   (on "${e.excluded_by}")`);
    }
  }

  if (r.tag) {
    console.log(`\n  tag            ${r.tag.label} (id ${r.tag.id})`);
    console.log(`  tagged         ${pad(r.tagged, 6)}   newly tagged this run`);
    if (r.tagged_no_longer_matching > 0) {
      console.log(`  stale          ${pad(r.tagged_no_longer_matching, 6)}   tagged but no longer matching —`);
      console.log('                        NOT removed. A tag is a human assertion;');
      console.log('                        untag them yourself if the rule is right.');
    }
  }

  if (r.scanned === 0) {
    console.log('\n  Nothing scanned. Either the tenant id is wrong, or the data is in the');
    console.log(`  other environment — this run looked at ${isLive ? 'LIVE' : 'sandbox'}.`);
    console.log(`  Try ${isLive ? 'without --live' : 'with --live'}.`);
  }
  console.log('');
}

/* ── Main ───────────────────────────────────────────── */

async function main() {
  const pool = createPool();

  try {
    if (has('list-tenants')) {
      const { rows } = await pool.query(
        `SELECT t.id, t.name, t.is_admin,
                (SELECT count(*) FROM gt_prospects p
                  WHERE p.tenant_id = t.id AND p.is_active) AS prospects
         FROM   vn_tenants t ORDER BY prospects DESC, t.name`);
      console.log('\n  prospects  admin  tenant_id                             name');
      for (const r of rows) {
        console.log(`  ${pad(r.prospects, 9)}  ${r.is_admin ? '  y  ' : '     '}  ${r.id}  ${r.name}`);
      }
      console.log('');
      return;
    }

    const cluster = flag('cluster') || 'manufacturing';
    if (!clusterNames().includes(cluster)) {
      console.error(`[Cohort] Unknown cluster "${cluster}". Defined: ${clusterNames().join(', ')}`);
      process.exit(1);
    }

    let tenantId = flag('tenant');
    const tenantName = flag('tenant-name');

    if (!tenantId && tenantName) {
      const { rows } = await pool.query(
        `SELECT id, name FROM vn_tenants WHERE name ILIKE $1`, [`%${tenantName}%`]);
      if (rows.length === 0) {
        console.error(`[Cohort] No tenant matching "${tenantName}". Try --list-tenants.`);
        process.exit(1);
      }
      if (rows.length > 1) {
        console.error(`[Cohort] "${tenantName}" matches ${rows.length} tenants — name them exactly, or use --tenant=<uuid>:`);
        for (const r of rows) console.error(`  ${r.id}  ${r.name}`);
        process.exit(1);
      }
      tenantId = rows[0].id;
      console.log(`[Cohort] ${rows[0].name} (${tenantId})`);
    }

    if (!tenantId) {
      console.error('[Cohort] --tenant=<uuid> or --tenant-name=<substring> is required.');
      console.error('         npx tsx src/cohort.ts --list-tenants   to see them.');
      process.exit(1);
    }

    const isLive = has('live');
    const tag = flag('tag');
    // Audit trail: created_by on the tag and the tag links. A CLI has no
    // logged-in user, so it records the tenant rather than inventing one.
    const ctx = ctxFor(pool, tenantId, isLive, tenantId);

    const result = await build_cohort(
      { cluster, tag_label: tag || undefined, dry_run: !tag },
      ctx,
    );
    printReport(result, isLive);

    if (!tag) {
      console.log('  Dry run. To write the canonical value and apply the tag:');
      console.log(`    npx tsx src/cohort.ts --tenant=${tenantId}${isLive ? ' --live' : ''} "--tag=Pilot Manufacturing"`);
      console.log('');
    }
  } catch (err) {
    // Loud, with the real cause (CLAUDE.md rule 12).
    console.error('\n[Cohort] FAILED:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
