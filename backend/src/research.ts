/**
 * VaNi GTM — Account research CLI
 *
 * Step 2 of documents/POA-manufacturing-pilot.md: run the account research
 * agent over a tagged cohort.
 *
 *   npx tsx src/research.ts --tenant=<uuid> --live --tag="Pilot Pharma" --limit=10
 *   npx tsx src/research.ts --tenant=<uuid> --live --tag="Pilot Pharma" --queue
 *   npx tsx src/research.ts --tenant=<uuid> --live --show
 *
 * ── TWO MODES, AND WHY ────────────────────────────────────────────────
 *
 * Default runs the agent HERE and prints each brief as it lands. That is
 * what a first batch of ten wants: immediate output you can read, with no
 * worker to keep alive and no wondering whether the event was picked up.
 *
 * --queue emits ACCOUNT_RESEARCH_REQUESTED instead and lets the worker take
 * it. That is what a batch of two hundred wants — it survives this terminal
 * closing, and the run appears in the normal agent feed.
 *
 * --show prints briefs already written, so the first ten can be read
 * carefully before another ninety are researched.
 *
 * ── READ THE FIRST TEN ────────────────────────────────────────────────
 *
 * The pilot's qualitative gate is whether a brief says something a template
 * could not. That is a judgement only a human makes, and it is cheaper to
 * make it after ten accounts than after a hundred. Hence --limit, and hence
 * the default being loud rather than quiet.
 */

import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';
import { AccountResearchAgent } from './skills/research-skill/account.agent';
import { loadOfferCatalogue } from './skills/research-skill/offer-catalogue';
import { createRun, setStatus, getRun } from './agent-core/agent.runner';
import { emitEvent } from './agent-core/event.store';

/* ── Args ───────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1).replace(/^["']|["']$/g, '');
};
const has = (name: string) => flag(name) !== undefined;

function createPool(): Pool {
  const connectionString = process.env.DB_PRIMARY;
  if (!connectionString) {
    console.error('[Research] DB_PRIMARY is required. Run from backend/ with a .env present.');
    process.exit(1);
  }
  return new Pool({
    connectionString,
    ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 4,
    connectionTimeoutMillis: 10_000,
  });
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const wrap = (s: string, indent = 6): string =>
  (s ?? '').replace(/\s+/g, ' ').trim()
    .replace(new RegExp(`(.{1,${86 - indent}})(\\s|$)`, 'g'), `${' '.repeat(indent)}$1\n`)
    .trimEnd();

/* ── Printing a brief ───────────────────────────────────────────────── */

interface BriefRow {
  name: string; domain: string | null; status: string;
  what_they_make: string | null; scale_signals: string | null;
  service_signals: string | null; digital_maturity: string | null;
  recommended_offer: string | null; fit_reason: string | null;
  hook: string | null; error: string | null;
  pages_read: number; raw_evidence: { claim: string; url: string; excerpt: string }[];
  named_contacts: { name?: string; title?: string; email?: string }[];
  fit: Record<string, { score: number; reason: string }>;
}

function printBrief(b: BriefRow, verbose: boolean) {
  console.log(`\n${'─'.repeat(88)}`);
  console.log(`  ${b.name}   ${b.domain ?? ''}`);

  if (b.status === 'unreadable') {
    console.log(`  UNREADABLE — no brief was invented for this one.`);
    console.log(wrap(b.error ?? 'no reason recorded'));
    return;
  }

  console.log(`  ${b.pages_read} page(s) read`);
  const field = (label: string, value: string | null) => {
    if (!value) return;
    console.log(`\n  ${label}`);
    console.log(wrap(value));
  };
  field('MAKES', b.what_they_make);
  field('SCALE', b.scale_signals);
  field('SERVICE', b.service_signals);
  field('DIGITAL', b.digital_maturity);

  if (b.named_contacts?.length) {
    console.log('\n  CONTACTS');
    for (const c of b.named_contacts.slice(0, 5)) {
      console.log(`      ${[c.name, c.title, c.email].filter(Boolean).join(' · ')}`);
    }
  }

  console.log(`\n  FIT   ${b.recommended_offer ?? 'no fit — do not contact'}`);
  if (b.fit_reason) console.log(wrap(b.fit_reason));
  if (verbose && b.fit) {
    for (const [id, s] of Object.entries(b.fit)) {
      console.log(`      ${pad(s.score.toFixed(2), 5)}  ${id} — ${s.reason}`);
    }
  }

  if (b.hook) {
    console.log('\n  HOOK');
    console.log(wrap(b.hook));
  }

  // The claim/evidence pairing is the thing to actually check on the first
  // ten: a brief whose claims are not in the excerpts is not usable.
  console.log(`\n  EVIDENCE  (${b.raw_evidence?.length ?? 0} claim(s) verified against pages we read)`);
  if (verbose) {
    for (const e of b.raw_evidence ?? []) {
      console.log(`      • ${e.claim}`);
      console.log(`        ${e.url}`);
      console.log(`        "${e.excerpt.slice(0, 140)}"`);
    }
  }
}

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
  const pool = createPool();

  try {
    const tenantId = flag('tenant');
    if (!tenantId) {
      console.error('[Research] --tenant=<uuid> is required.');
      console.error('           npx tsx src/cohort.ts --list-tenants   to find it.');
      process.exit(1);
    }
    const isLive = has('live');
    const verbose = !has('brief');
    const catalogueSlug = flag('catalogue') || 'vikuna';

    /* --show: read what is already written, research nothing. */
    if (has('show')) {
      const { rows } = await pool.query<BriefRow>(
        `SELECT p.name, b.* FROM gt_account_briefs b
         JOIN   gt_prospects p ON p.id = b.prospect_id
         WHERE  b.tenant_id = $1 AND b.is_live = $2
         ORDER  BY (b.recommended_offer IS NULL), b.updated_at DESC
         LIMIT  $3`,
        [tenantId, isLive, Number(flag('limit')) || 20]);
      if (rows.length === 0) {
        console.log('\n  No briefs yet for this tenant and environment.\n');
        return;
      }
      for (const b of rows) printBrief(b, verbose);
      summarise(rows);
      return;
    }

    /* The catalogue, before anything else — the agent checks it too, but
       failing here costs no run row. */
    try {
      const cat = loadOfferCatalogue(catalogueSlug);
      console.log(`\n  Offers: ${cat.offers.map((o) => o.name).join(' · ')}`);
    } catch (err) {
      console.error(`\n${(err as Error).message}\n`);
      process.exit(1);
    }

    /* The cohort: a tag by label is friendlier than an id. */
    const tagLabel = flag('tag');
    let tagId: number | undefined;
    if (tagLabel) {
      const { rows } = await pool.query<{ id: number; label: string }>(
        `SELECT id, label FROM gt_tags
         WHERE  is_active AND (tenant_id = $1 OR tenant_id IS NULL)
           AND  label ILIKE $2`, [tenantId, tagLabel]);
      if (rows.length === 0) {
        console.error(`[Research] No tag matching "${tagLabel}" for this tenant.`);
        console.error('           Build the cohort first: npx tsx src/cohort.ts --help');
        process.exit(1);
      }
      if (rows.length > 1) {
        console.error(`[Research] "${tagLabel}" matches ${rows.length} tags — name it exactly:`);
        for (const r of rows) console.error(`             ${r.id}  ${r.label}`);
        process.exit(1);
      }
      tagId = Number(rows[0].id);
      console.log(`  Cohort: ${rows[0].label} (tag ${tagId})`);
    }
    const explicit = (flag('prospects') ?? '').split(',').map(Number).filter(Number.isFinite);
    if (!tagId && explicit.length === 0) {
      console.error('[Research] --tag="<label>" or --prospects=1,2,3 is required.');
      process.exit(1);
    }

    const limit = Number(flag('limit')) || 10;
    const payload: Record<string, unknown> = {
      offer_catalogue: catalogueSlug,
      is_live: isLive,
      limit,
      ...(tagId ? { tag_id: tagId } : {}),
      ...(explicit.length ? { prospect_ids: explicit } : {}),
      ...(flag('resume') ? { resume_run_id: flag('resume') } : {}),
    };

    /* --queue: hand it to the worker and stop. */
    if (has('queue')) {
      const eventId = await emitEvent(pool, tenantId, 'ACCOUNT_RESEARCH_REQUESTED', 'human', payload);
      console.log(`\n  Queued as event ${eventId}. The worker picks it up within ~3s.`);
      console.log('  Make sure it is running:  npm run worker');
      console.log(`  Read the briefs after:    npx tsx src/research.ts --tenant=${tenantId}${isLive ? ' --live' : ''} --show\n`);
      return;
    }

    /* Default: run it here, loudly. */
    const runId = await createRun(pool, tenantId, 'ACCOUNT_RESEARCH_REQUESTED');
    await setStatus(pool, runId, 'running');
    console.log(`  Run ${runId} — researching up to ${limit} account(s). This is not fast:`);
    console.log('  each account is a crawl plus three LLM calls, ~2-4 min on a local model.\n');

    try {
      await AccountResearchAgent.run(pool, tenantId, payload, runId);
    } catch (err) {
      await setStatus(pool, runId, 'failed', { error_trace: (err as Error).message });
      console.error(`\n[Research] FAILED: ${(err as Error).message}\n`);
      console.error(`  Nothing researched so far is lost — resume with --resume=${runId}\n`);
      process.exitCode = 1;
      return;
    }

    const run = await getRun(pool, runId);
    const { rows } = await pool.query<BriefRow>(
      `SELECT p.name, b.* FROM gt_account_briefs b
       JOIN   gt_prospects p ON p.id = b.prospect_id
       WHERE  b.run_id = $1 ORDER BY (b.recommended_offer IS NULL), p.name`,
      [runId]);

    for (const b of rows) printBrief(b, verbose);
    summarise(rows);
    console.log(`  Run output: ${JSON.stringify(run?.output ?? {})}\n`);
  } catch (err) {
    console.error('\n[Research] FAILED:', err instanceof Error ? err.message : String(err), '\n');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

function summarise(rows: BriefRow[]) {
  const unreadable = rows.filter((r) => r.status === 'unreadable').length;
  const fitted = rows.filter((r) => r.recommended_offer).length;
  const noHook = rows.filter((r) => r.recommended_offer && !r.hook).length;
  const noEvidence = rows.filter((r) => r.status !== 'unreadable' && (r.raw_evidence?.length ?? 0) === 0).length;

  console.log(`\n${'═'.repeat(88)}`);
  console.log(`  ${pad(rows.length, 4)}  briefs`);
  console.log(`  ${pad(unreadable, 4)}  unreadable — a recorded gap, not a guess`);
  console.log(`  ${pad(fitted, 4)}  with a recommended offer`);
  console.log(`  ${pad(rows.length - unreadable - fitted, 4)}  no fit — do not contact`);
  if (noHook) console.log(`  ${pad(noHook, 4)}  fitted but no hook — too thin to say anything specific`);
  if (noEvidence) {
    console.log(`  ${pad(noEvidence, 4)}  WITH NO VERIFIED EVIDENCE — read these first, the model`);
    console.log('        asserted things it could not point at on the page.');
  }
  console.log('');
  console.log('  Now read them. The question is not "did it run" — it is whether any of');
  console.log('  this says something a template could not. If the briefs read generic,');
  console.log('  the prompts need work before another ninety accounts are crawled.');
  console.log('');
}

main();
