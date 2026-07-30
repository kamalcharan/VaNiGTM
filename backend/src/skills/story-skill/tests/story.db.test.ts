/**
 * Story writes against a real database.
 *
 * trace.test.ts covers the rule; here we guard everything the rule needs
 * to be true of storage:
 *
 *  1. A story cannot be written without a brief to trace against.
 *  2. seq is monotonic per journey — even under parallel writers.
 *  3. Approval re-runs the trace, so a body edited after draft is judged
 *     as it will actually go out.
 *  4. Approval moves the journey to ready in the SAME transaction.
 *  5. log_touch marks the story sent and refuses drafts / cross-journey.
 *  6. Tenant isolation (3-check).
 *
 * Skips without a database.
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const A = '11111111-1111-1111-1111-111111111111';
const B = '33333333-3333-3333-3333-333333333333';
const MIGRATIONS = path.resolve(__dirname, '../../../../migrations');

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

import { createTenantDb } from '../../../db';
import { create_story } from '../functions/create-story';
import { approve_story } from '../functions/approve-story';
import { list_stories } from '../functions/list-stories';
import { list_kinds } from '../functions/list-kinds';
import { log_touch } from '../../research-skill/functions/log-touch';
import {
  ensureJourney, findJourney, moveByProspect,
} from '../../journey-skill/journey.service';

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));

CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  ref VARCHAR(32), name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255),
  website VARCHAR(500), city VARCHAR(120), industry_raw TEXT, completeness NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE gt_contacts (
  id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, name VARCHAR(300) NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'manual', raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  prospect_id BIGINT REFERENCES gt_prospects(id) ON DELETE SET NULL);

CREATE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
  BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
`;

let pool: Pool;
const ctxFor = (tenant: string) => ({
  tenant_id: tenant, is_live: false, user_id: A, is_admin: false,
  db: createTenantDb(pool, tenant),
});
const scope = { tenant_id: A, is_live: false };

const EVIDENCE = [
  { claim: 'Unit-3 commissioned this month, capacity up 40%', url: 'sriveda.example/news',   excerpt: '' },
  { claim: 'Hiring a QA documentation lead in Jeedimetla',    url: 'sriveda.example/careers',excerpt: '' },
];

async function seedJourneyWithBrief(tenant = A) {
  const p = await pool.query(
    `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1,false,'Sriveda') RETURNING id`,
    [tenant]);
  const prospect = Number(p.rows[0].id);
  const b = await pool.query(
    `INSERT INTO gt_account_briefs
       (tenant_id, is_live, prospect_id, status, domain, raw_evidence, recommended_offer, facts_at)
     VALUES ($1, false, $2, 'approved', 'sriveda.example', $3::jsonb, 'caio-as-a-service', now())
     RETURNING id`,
    [tenant, prospect, JSON.stringify(EVIDENCE)]);
  const db = createTenantDb(pool, tenant);
  const journey = await ensureJourney(db, { tenant_id: tenant, is_live: false }, prospect);
  return { prospect, brief: Number(b.rows[0].id), journey_id: journey.id };
}

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS story_test');
  await admin.query('CREATE DATABASE story_test');
  await admin.end();
  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'story_test' });
  await pool.query(BASE);
  await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'us'),($2,'them')`, [A, B]);
  for (const m of ['207_gt_account_briefs.sql', '210_brief_extract_failed.sql',
                   '211_brief_facts_and_judgement.sql', '213_brief_human_offer.sql',
                   '221_gt_touch_log.sql', '222_gt_journeys.sql',
                   '223_gt_cadence_governor.sql', '225_gt_journey_stories.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  await pool.query('DELETE FROM gt_journey_stories');
  await pool.query('DELETE FROM gt_touch_reservations');
  await pool.query('DELETE FROM gt_touch_log');
  await pool.query('DELETE FROM gt_journey_events');
  await pool.query('DELETE FROM gt_journeys');
  await pool.query('DELETE FROM gt_account_briefs');
  await pool.query('DELETE FROM gt_prospects');
  await pool.query('DELETE FROM gt_contacts');
});

const d = available ? describe : describe.skip;

/* ── R-S1 at the door ─────────────────────────────────────────────────── */

d('a story cannot be written without evidence', () => {
  it('refuses when the journey has no brief', async () => {
    // R-S1 against an empty evidence set trivially passes, so refusing at
    // the door is what stops a template with a name on it sneaking past.
    const p = await pool.query(
      `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1,false,'X') RETURNING id`, [A]);
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, Number(p.rows[0].id));
    await expect(create_story({
      journey_id: j.id, body: 'Hi. I put together a short note. Worth fifteen minutes?',
    }, ctxFor(A))).rejects.toThrow(/no evidence yet/i);
  });

  it('refuses an unknown kind_key rather than defaulting silently', async () => {
    const { journey_id } = await seedJourneyWithBrief();
    await expect(create_story({
      journey_id, body: 'Unit-3 commissioned. Worth a chat?', kind_key: 'telegram',
    }, ctxFor(A))).rejects.toThrow(/No such content kind/i);
  });
});

/* ── The happy path ───────────────────────────────────────────────────── */

d('a well-evidenced story', () => {
  it('saves as a draft carrying only the URLs the trace actually cited', async () => {
    const { journey_id } = await seedJourneyWithBrief();
    const r = await create_story({
      journey_id,
      subject: 'Unit-3 and what comes after it',
      body: 'Unit-3 commissioned this month, capacity up 40%. '
        + 'We put a fractional CAIO alongside teams in exactly that position. '
        + 'Worth fifteen minutes?',
    }, ctxFor(A));
    expect(r.status).toBe('draft');
    expect(r.trace.ok).toBe(true);
    expect(r.trace.evidence_refs).toContain('sriveda.example/news');
    // Only the URL that traced — not both evidence URLs.
    expect(r.trace.evidence_refs).not.toContain('sriveda.example/careers');
    const row = await pool.query(
      `SELECT evidence_refs, offer FROM gt_journey_stories WHERE id=$1`, [r.story_id]);
    expect(row.rows[0].evidence_refs).toEqual(['sriveda.example/news']);
    // Offer defaults to the journey's — which came from the brief.
    expect(row.rows[0].offer).toBe('caio-as-a-service');
  });

  it('assigns seq monotonically per journey, even from parallel writers', async () => {
    const { journey_id } = await seedJourneyWithBrief();
    const body = 'QA documentation lead in Jeedimetla. Worth a chat with our CAIO?';
    // Concurrent writes are the real case (a reviewer with two tabs open).
    // The transactional SELECT MAX+1 pattern makes them serial per journey.
    const results = await Promise.all([
      create_story({ journey_id, body }, ctxFor(A)),
      create_story({ journey_id, body: body.replace('CAIO', 'principal') }, ctxFor(A)),
      create_story({ journey_id, body: body.replace('Jeedimetla', 'Bollaram') }, ctxFor(A)),
    ]);
    const seqs = results.map((r) => r.seq).sort();
    expect(seqs).toEqual([1, 2, 3]);
  });
});

/* ── R-S1 refusals ────────────────────────────────────────────────────── */

d('R-S1 refusals', () => {
  it('flags unsupported claims in a draft trace, but still saves it', async () => {
    // Drafts save. The reviewer needs to see WHAT was unsupported to fix
    // it — refusing the write would just make them lose the text.
    const { journey_id } = await seedJourneyWithBrief();
    const r = await create_story({
      journey_id,
      body: 'You run six plants across Gujarat and export mostly to Brazil. '
        + 'We help teams like yours.',
    }, ctxFor(A));
    expect(r.status).toBe('draft');
    expect(r.trace.ok).toBe(false);
    expect(r.trace.unsupported).toBeGreaterThan(0);
  });

  it('refuses to APPROVE an unsupported draft', async () => {
    // The gate. Approval is the moment the story must be true.
    const { journey_id } = await seedJourneyWithBrief();
    const r = await create_story({
      journey_id,
      body: 'You have six plants and 400 workers. We can help.',
    }, ctxFor(A));
    await expect(approve_story({ story_id: r.story_id }, ctxFor(A)))
      .rejects.toThrow(/R-S1|cannot support/i);
  });

  it('refuses a template with nothing about them', async () => {
    const { journey_id } = await seedJourneyWithBrief();
    const r = await create_story({
      journey_id,
      body: 'We help scale-ups move faster. I would love fifteen minutes.',
    }, ctxFor(A));
    await expect(approve_story({ story_id: r.story_id }, ctxFor(A)))
      .rejects.toThrow(/template with a name/i);
  });
});

/* ── R-S2 ─────────────────────────────────────────────────────────────── */

d('R-S2 — a new angle each time', () => {
  it('warns on a near-duplicate draft', async () => {
    const { journey_id } = await seedJourneyWithBrief();
    const body = 'QA documentation lead in Jeedimetla. Worth a chat about batch records?';
    await create_story({ journey_id, body }, ctxFor(A));
    const dup = await create_story({ journey_id, body: body.replace('batch', 'audit') }, ctxFor(A));
    expect(dup.repeats_earlier).not.toBeNull();
  });

  it('refuses APPROVAL of a duplicate story', async () => {
    const { journey_id } = await seedJourneyWithBrief();
    const s1 = await create_story({
      journey_id,
      body: 'QA documentation lead in Jeedimetla. Worth a chat about batch records?',
    }, ctxFor(A));
    await approve_story({ story_id: s1.story_id }, ctxFor(A));

    const s2 = await create_story({
      journey_id,
      body: 'QA documentation lead in Jeedimetla. Worth a chat about audit records?',
    }, ctxFor(A));
    await expect(approve_story({ story_id: s2.story_id }, ctxFor(A)))
      .rejects.toThrow(/R-S2|similar/i);
  });

  it('allows override with a reason, recorded on the journey event', async () => {
    // A bypass with no trace is a bypass people take without thinking.
    // The override string ends up in payload.override on the journey event.
    const { journey_id, prospect } = await seedJourneyWithBrief();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, prospect, 'addressed');

    const s1 = await create_story({
      journey_id,
      body: 'QA documentation lead in Jeedimetla. Worth a chat about batch records?',
    }, ctxFor(A));
    await approve_story({ story_id: s1.story_id }, ctxFor(A));

    const s2 = await create_story({
      journey_id,
      body: 'QA documentation lead in Jeedimetla. Worth a chat about audit records?',
    }, ctxFor(A));
    const r = await approve_story({
      story_id: s2.story_id, allow_similar: true, override_note: 'Same person, different angle',
    }, ctxFor(A));
    expect(r.override).toMatch(/Same person/);

    // Recorded on the artifact — the row survives even when the approval
    // does not move the journey (story N on an already-ready account
    // writes no event, and the reason must survive that).
    const row = await pool.query(
      `SELECT notes FROM gt_journey_stories WHERE id=$1`, [s2.story_id]);
    expect(row.rows[0].notes).toMatch(/similarity to story 1/i);
    expect(row.rows[0].notes).toMatch(/Same person/);
  });
});

/* ── Approval moves the journey ───────────────────────────────────────── */

d('approval', () => {
  it('signs the row and moves the journey to ready', async () => {
    const { journey_id, prospect } = await seedJourneyWithBrief();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, prospect, 'addressed');

    const s = await create_story({
      journey_id,
      body: 'Unit-3 commissioned this month, capacity up 40%. Worth a chat about the ramp?',
    }, ctxFor(A));
    const r = await approve_story({ story_id: s.story_id }, ctxFor(A));
    expect(r.journey_state).toBe('ready');
    expect(r.journey_moved).toBe(true);

    const row = await pool.query(
      `SELECT status, approved_by, approved_at FROM gt_journey_stories WHERE id=$1`, [s.story_id]);
    expect(row.rows[0].status).toBe('approved');
    expect(row.rows[0].approved_by).toBe(A);
    expect(row.rows[0].approved_at).not.toBeNull();
  });

  it('re-runs the trace on the CURRENT body, not the one saved to draft', async () => {
    // A reviewer might edit the row before approving. The rule that
    // matters is R-S1 at approval time — a draft that traced once must
    // not carry an untraced sentence past this gate.
    const { journey_id } = await seedJourneyWithBrief();
    const s = await create_story({
      journey_id,
      body: 'Unit-3 commissioned this month, capacity up 40%. Worth fifteen minutes?',
    }, ctxFor(A));
    // Slip in an invented claim after draft.
    await pool.query(
      `UPDATE gt_journey_stories
          SET body = body || ' You have six plants across Gujarat.' WHERE id=$1`, [s.story_id]);
    await expect(approve_story({ story_id: s.story_id }, ctxFor(A)))
      .rejects.toThrow(/R-S1/);
  });

  it('is a no-op on the journey when it is already ready', async () => {
    // A second approved story on an account already ready is normal —
    // stories accumulate. The journey should not move away from ready.
    const { journey_id, prospect } = await seedJourneyWithBrief();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, prospect, 'addressed');

    const s1 = await create_story({
      journey_id,
      body: 'Unit-3 commissioned. capacity up 40%. Worth a chat about the ramp?',
    }, ctxFor(A));
    await approve_story({ story_id: s1.story_id }, ctxFor(A));

    const s2 = await create_story({
      journey_id,
      body: 'QA documentation lead in Jeedimetla. Different angle — the CAIO helps.',
    }, ctxFor(A));
    const r2 = await approve_story({ story_id: s2.story_id }, ctxFor(A));
    expect(r2.journey_state).toBe('ready');

    const j = await findJourney(db, scope, prospect);
    expect(j!.story_count).toBe(2);
  });

  it('refuses to re-approve a story already approved', async () => {
    const { journey_id, prospect } = await seedJourneyWithBrief();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, prospect, 'addressed');
    const s = await create_story({
      journey_id,
      body: 'Unit-3 commissioned. capacity up 40%. Worth a chat?',
    }, ctxFor(A));
    await approve_story({ story_id: s.story_id }, ctxFor(A));
    await expect(approve_story({ story_id: s.story_id }, ctxFor(A)))
      .rejects.toThrow(/No draft story/i);
  });
});

/* ── log_touch consumes the story ─────────────────────────────────────── */

d('log_touch and the story', () => {
  it('marks the story sent and links the touch', async () => {
    const { journey_id, prospect } = await seedJourneyWithBrief();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, prospect, 'addressed');
    const s = await create_story({
      journey_id,
      body: 'Unit-3 commissioned this month, capacity up 40%. Worth a chat?',
    }, ctxFor(A));
    await approve_story({ story_id: s.story_id }, ctxFor(A));

    const t = await log_touch({
      prospect_id: prospect, channel: 'email', story_id: s.story_id,
    }, ctxFor(A));
    expect(t.story_id).toBe(s.story_id);

    const row = await pool.query(
      `SELECT status, sent_as_touch::text, sent_at FROM gt_journey_stories WHERE id=$1`,
      [s.story_id]);
    expect(row.rows[0].status).toBe('sent');
    expect(Number(row.rows[0].sent_as_touch)).toBe(t.touch_id);
    expect(row.rows[0].sent_at).not.toBeNull();

    const tl = await pool.query(
      `SELECT story_id::text FROM gt_touch_log WHERE id=$1`, [t.touch_id]);
    expect(Number(tl.rows[0].story_id)).toBe(s.story_id);
  });

  it('refuses a draft story', async () => {
    const { journey_id, prospect } = await seedJourneyWithBrief();
    const s = await create_story({
      journey_id,
      body: 'Unit-3 commissioned. capacity up 40%. Worth a chat?',
    }, ctxFor(A));
    await expect(log_touch({
      prospect_id: prospect, channel: 'email', story_id: s.story_id,
    }, ctxFor(A))).rejects.toThrow(/not approved/i);
  });

  it('refuses a story that belongs to a different journey', async () => {
    // The exact confusion the check exists to catch. Two journeys, each
    // with its own approved story; sending story A on journey B would
    // silently attribute the wrong text to the wrong account.
    const mine = await seedJourneyWithBrief();
    const other = await seedJourneyWithBrief();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, mine.prospect, 'addressed');
    const s = await create_story({
      journey_id: mine.journey_id,
      body: 'Unit-3 commissioned. capacity up 40%. Worth a chat?',
    }, ctxFor(A));
    await approve_story({ story_id: s.story_id }, ctxFor(A));
    await expect(log_touch({
      prospect_id: other.prospect, channel: 'email', story_id: s.story_id,
    }, ctxFor(A))).rejects.toThrow(/does not belong/i);
  });
});

/* ── The registry ────────────────────────────────────────────────────── */

d('gt_content_kinds', () => {
  it('is seeded with the D7 kinds, visible to every tenant', async () => {
    const a = await list_kinds({}, ctxFor(A));
    const b = await list_kinds({}, ctxFor(B));
    const keys = a.kinds.map((k) => k.kind_key).sort();
    expect(keys).toContain('email');
    expect(keys).toContain('deck');
    expect(a.kinds).toEqual(b.kinds);
  });

  it('filters by scope, stage, and arc', async () => {
    // The nurture map: "which kinds serve `addressed` on the acquisition arc"
    // is the query the story-compose UI opens with.
    const r = await list_kinds({ scope: 'move', stage: 'addressed' }, ctxFor(A));
    expect(r.kinds.every((k) => k.scope === 'move')).toBe(true);
    expect(r.kinds.some((k) => k.kind_key === 'email')).toBe(true);
    expect(r.kinds.some((k) => k.kind_key === 'gyan')).toBe(false);
  });
});

/* ── The 3-check pattern ──────────────────────────────────────────────── */

d('tenant isolation', () => {
  it('valid data: own journey stories come back', async () => {
    const { journey_id } = await seedJourneyWithBrief();
    await create_story({
      journey_id, body: 'Unit-3 commissioned. capacity up 40%. Worth a chat?',
    }, ctxFor(A));
    const r = await list_stories({ journey_id }, ctxFor(A));
    expect(r.stories).toHaveLength(1);
  });

  it('empty: unknown journey gets zero rows', async () => {
    const r = await list_stories({ journey_id: 9_999_999 }, ctxFor(A));
    expect(r.stories).toHaveLength(0);
  });

  it('wrong tenant: another tenant story is invisible AND unapprovable', async () => {
    const mine = await seedJourneyWithBrief(A);
    const created = await create_story({
      journey_id: mine.journey_id,
      body: 'Unit-3 commissioned this month, capacity up 40%. Worth a chat?',
    }, ctxFor(A));

    const theirs = await list_stories({ journey_id: mine.journey_id }, ctxFor(B));
    expect(theirs.stories).toHaveLength(0);
    await expect(create_story({
      journey_id: mine.journey_id,
      body: 'Unit-3 commissioned this month, capacity up 40%. Worth a chat?',
    }, ctxFor(B))).rejects.toThrow(/No such journey/i);
    await expect(approve_story({ story_id: created.story_id }, ctxFor(B)))
      .rejects.toThrow(/No draft story/i);
  });
});
