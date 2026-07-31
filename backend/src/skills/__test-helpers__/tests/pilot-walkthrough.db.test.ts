/**
 * The pilot cycle, walked end to end against the REAL schema.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * Three production bugs in three days, all from test schemas that lied
 * about production. This test is the smoke test I wish had existed
 * before. It calls every skill function the pilot UI touches, in the
 * order the human would click, and asserts each next call would succeed
 * against what the previous one wrote. If it passes, the drawer works
 * end to end.
 *
 * ── WHAT IT COVERS ─────────────────────────────────────────────────
 *
 *   1. list_journeys → the board
 *   2. get_journey   → the drawer
 *   3. get_briefs { prospect_id } → the brief section
 *   4. list_brief_contacts → the person section
 *   5. promote_from_brief(confirm_addressed) → journey moves to addressed
 *   6. get_prospect_contacts → the confirmed person + channels
 *   7. create_story → the compose surface
 *   8. approve_story → journey moves to ready
 *   9. reserve_touch → the governor grants a slot
 *  10. log_touch → journey moves to waiting, story goes 'sent'
 *  11. set_touch_outcome → journey moves to answered
 *
 * Skips without a database.
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import { bootstrapSchema, cleanBetweenTests } from '../schema';
import { createTenantDb } from '../../../db';
import { list_journeys } from '../../journey-skill/functions/list-journeys';
import { get_journey } from '../../journey-skill/functions/get-journey';
import { get_briefs } from '../../research-skill/functions/get-briefs';
import { list_brief_contacts } from '../../contact-skill/functions/list-brief-contacts';
import { promote_from_brief } from '../../contact-skill/functions/promote-from-brief';
import { add_contact_manually } from '../../contact-skill/functions/add-contact-manually';
import { get_prospect_contacts } from '../../contact-skill/functions/get-prospect-contacts';
import { create_story } from '../../story-skill/functions/create-story';
import { recommend_topic } from '../../story-skill/functions/recommend-topic';
import { approve_story } from '../../story-skill/functions/approve-story';
import { reserve_touch } from '../../cadence-skill/functions/reserve-touch';
import { log_touch } from '../../research-skill/functions/log-touch';
import { set_touch_outcome } from '../../research-skill/functions/set-touch-outcome';
import { ensureJourney, moveByProspect } from '../../journey-skill/journey.service';

const available = (() => {
  try { execSync(`pg_isready -h /tmp -p 55432`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

let pool: Pool;
let A: string;

async function seed(): Promise<{ prospect: number; brief: number; journeyId: number }> {
  // A qualified journey with a rich brief — the shape the pilot's four
  // decided companies are in when the reviewer first opens the drawer.
  const p = await pool.query(
    `INSERT INTO gt_prospects (tenant_id, is_live, name, city, industry_raw)
     VALUES ($1, false, 'Sriveda Lifesciences', 'Hyderabad', 'API manufacturing')
     RETURNING id`, [A]);
  const prospect = Number(p.rows[0].id);
  const evidence = [
    { claim: 'Two formulation units, Jeedimetla and Bollaram', url: 'sriveda.example/about' },
    { claim: 'Hiring a QA documentation lead', url: 'sriveda.example/careers' },
    { claim: 'WHO-GMP and EU-GMP certified', url: 'sriveda.example/quality' },
  ];
  const b = await pool.query(
    `INSERT INTO gt_account_briefs
       (tenant_id, is_live, prospect_id, domain, status, hook, raw_evidence,
        named_contacts, recommended_offer, human_offer, decided_at, decided_by, facts_at)
     VALUES ($1, false, $2, 'sriveda.example', 'approved',
             'Two units and a QA hire — batch records are the obvious first cut.',
             $3::jsonb, $4::jsonb, 'ai-automations', 'caio-as-a-service',
             now(), $5::uuid, now())
     RETURNING id`,
    [A, prospect, JSON.stringify(evidence), JSON.stringify([
      { name: 'R. Menon', title: 'Head of Digital', email: 'r.menon@sriveda.example' },
    ]), A]);

  // Journey exists at qualified — the state the human puts it in when
  // they approve the brief.
  const db = createTenantDb(pool, A);
  const scope = { tenant_id: A, is_live: false };
  await ensureJourney(db, scope, prospect);
  await moveByProspect(db, scope, prospect, 'qualified',
    { actor: 'human', actor_id: A, offer: 'caio-as-a-service' });
  const j = (await pool.query(
    `SELECT id FROM gt_journeys WHERE prospect_id = $1`, [prospect])).rows[0];

  return { prospect, brief: Number(b.rows[0].id), journeyId: Number(j.id) };
}

const ctx = () => ({
  tenant_id: A, is_live: false, user_id: A, is_admin: false,
  db: createTenantDb(pool, A),
});

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: '/tmp', port: 55432, user: 'postgres', database: 'postgres' });
  await admin.query('DROP DATABASE IF EXISTS pilot_walk_test');
  await admin.query('CREATE DATABASE pilot_walk_test');
  await admin.end();
  pool = new Pool({ host: '/tmp', port: 55432, user: 'postgres', database: 'pilot_walk_test' });
  const t = await bootstrapSchema(pool);
  A = t.A;
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });
beforeEach(async () => { if (available) await cleanBetweenTests(pool); });

const d = available ? describe : describe.skip;

d('the pilot cycle', () => {
  it('walks one company from qualified to answered with every skill call succeeding', async () => {
    const { prospect, brief, journeyId } = await seed();
    const c = ctx();

    // 1. The board sees the journey and reports the debt.
    const board = await list_journeys({}, c);
    expect(board.journeys).toHaveLength(1);
    expect(board.journeys[0]).toMatchObject({ prospect_id: prospect, state: 'qualified' });
    expect((board.journeys[0] as { owed: string }).owed).toBe('Find the person');

    // 2. The drawer opens: state + ledger + moves the state machine allows.
    const drawer = await get_journey({ prospect_id: prospect }, c);
    expect(drawer.events.length).toBeGreaterThan(0);
    expect(drawer.moves.map((m) => m.to)).toContain('addressed');

    // 3. The brief comes back for THIS prospect, not the tenant's first one.
    const briefs = await get_briefs({ prospect_id: prospect, limit: 1 }, c);
    expect(briefs.briefs).toHaveLength(1);
    expect((briefs.briefs[0] as { id: number }).id).toBe(brief);

    // 4. The named_contacts entry is promotable — has name AND channel.
    const bc = await list_brief_contacts({ brief_id: brief }, c);
    expect(bc.entries).toHaveLength(1);
    expect(bc.entries[0]).toMatchObject({ has_name: true, has_channel: true, addressable: true });

    // 5. Promote WITH confirm_addressed. The whole reason this test exists —
    //    the transaction must commit, the channel row must land WITHOUT any
    //    updated_at column being written, and the journey must move.
    const promoted = await promote_from_brief(
      { brief_id: brief, named_index: 0, confirm_addressed: true }, c);
    expect(promoted.journey_state).toBe('addressed');
    expect(promoted.channels_written).toHaveLength(1);
    expect(promoted.channels_written[0].source_url).toBe('https://sriveda.example');

    // 6. The drawer's "the person" section reads through.
    const people = await get_prospect_contacts({ prospect_id: prospect }, c);
    expect(people.contacts).toHaveLength(1);
    const contact = people.contacts[0] as Record<string, unknown>;
    expect(contact.name).toBe('R. Menon');
    expect((contact.channels as unknown[])).toHaveLength(1);

    // 7. Write a story. R-S1 clears (all sentences trace or are "about us").
    const story = await create_story({
      journey_id: journeyId,
      subject: 'Two units and a QA hire',
      body: 'Two formulation units, Jeedimetla and Bollaram, and a QA documentation '
        + 'lead posting — the batch-record work is the obvious first cut. '
        + 'Worth fifteen minutes?',
    }, c);
    expect(story.status).toBe('draft');
    expect(story.trace.ok).toBe(true);
    expect(story.trace.evidence_refs.length).toBeGreaterThan(0);

    // 8. Approve. Journey moves to ready.
    const approved = await approve_story({ story_id: story.story_id }, c);
    expect(approved.journey_state).toBe('ready');

    // 9. Reserve a slot. The governor grants it (empty calendar).
    const contactId = Number(contact.id);
    const reserved = await reserve_touch({
      contact_id: contactId, channel: 'email',
      prospect_id: prospect, journey_id: journeyId,
    }, c);
    expect(reserved.reservation_id).not.toBeNull();

    // 10. Log the send. Story flips to sent, journey moves to waiting.
    const sent = await log_touch({
      prospect_id: prospect, contact_id: contactId,
      story_id: story.story_id, channel: 'email',
    }, c);
    expect(sent.journey_state).toBe('waiting');
    expect(sent.story_id).toBe(story.story_id);
    expect(sent.reservation_consumed).toBe(reserved.reservation_id);

    const storyRow = await pool.query(
      `SELECT status FROM gt_journey_stories WHERE id = $1`, [story.story_id]);
    expect(storyRow.rows[0].status).toBe('sent');

    // 11. An answer lands. Journey moves to answered — the stage decision
    //     is now owed on the board.
    const outcome = await set_touch_outcome({
      touch_id: sent.touch_id, outcome: 'replied',
    }, c);
    expect(outcome.journey_state).toBe('answered');

    // Board reflects the whole trip in the ledger.
    const finalDrawer = await get_journey({ prospect_id: prospect }, c);
    const states = finalDrawer.events.map((e) => (e as { to_state: string }).to_state);
    expect(states).toContain('addressed');
    expect(states).toContain('ready');
    expect(states).toContain('waiting');
    expect(states).toContain('answered');
  }, 30000);

  it('rejects promote_from_brief cleanly when the brief named nobody', async () => {
    // R-C1 check — the drawer's error note is what the reviewer sees.
    const p = await pool.query(
      `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1, false, 'X') RETURNING id`, [A]);
    const b = await pool.query(
      `INSERT INTO gt_account_briefs
         (tenant_id, is_live, prospect_id, status, named_contacts, facts_at)
       VALUES ($1, false, $2, 'drafted', '[]'::jsonb, now()) RETURNING id`,
      [A, Number(p.rows[0].id)]);
    await expect(promote_from_brief({
      brief_id: Number(b.rows[0].id), named_index: 0,
    }, ctx())).rejects.toThrow(/named nobody/i);
  });

  it('unsticks a brief-with-no-contact by adding a person manually', async () => {
    // The exact case that stopped 3 of the pilot's 4 companies. The brief
    // has no named_contacts, so promote refuses. add_contact_manually
    // takes over: source='manual' (not 'research'), still gates R-C2.
    const p = await pool.query(
      `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1, false, 'Nallamala') RETURNING id`, [A]);
    const prospect = Number(p.rows[0].id);
    await pool.query(
      `INSERT INTO gt_account_briefs
         (tenant_id, is_live, prospect_id, status, named_contacts, raw_evidence, facts_at)
       VALUES ($1, false, $2, 'approved', '[]'::jsonb, '[]'::jsonb, now())`, [A, prospect]);
    const c = ctx();
    // Journey has to be at qualified for addressed to be a legal move.
    await moveByProspect(createTenantDb(pool, A), { tenant_id: A, is_live: false },
      prospect, 'qualified', { actor: 'human' });

    // No channel → R-C2 refuses.
    await expect(add_contact_manually({
      prospect_id: prospect, name: 'S. Rao', confirm_addressed: true,
    }, c)).rejects.toThrow(/R-C2/i);

    // With a channel → journey moves.
    const added = await add_contact_manually({
      prospect_id: prospect, name: 'S. Rao', job_title: 'Plant Head',
      email: 's.rao@nallamala.example', confirm_addressed: true,
    }, c);
    expect(added.journey_state).toBe('addressed');

    // And its source is 'manual', not 'research' — the two provenances
    // stay honestly separate.
    const src = await pool.query(
      `SELECT source FROM gt_contacts WHERE id = $1`, [added.contact_id]);
    expect(src.rows[0].source).toBe('manual');
  });

  it('recommends a topic the human can write against', async () => {
    // The other blocker: "write a story" with no shell. Recommender picks
    // an opener, an offer angle, an ask, and lists what NOT to repeat.
    const { journeyId } = await seed();
    const r = await recommend_topic({ journey_id: journeyId }, ctx());
    expect(r.ready).toBe(true);
    expect(r.headline).toBeTruthy();
    expect(r.headline_url).toMatch(/sriveda\.example/);
    // Offer angle written for the offer this brief was approved on.
    expect(r.angle).toMatch(/CAIO/i);
    // Nothing to avoid on story 1.
    expect(r.already_said).toHaveLength(0);
    expect(r.story_seq).toBe(1);
  });

  it('recommends against repeating an earlier story\'s argument', async () => {
    const { prospect, journeyId } = await seed();
    const c = ctx();
    // Walk the journey to ready with story 1 approved.
    await moveByProspect(createTenantDb(pool, A), { tenant_id: A, is_live: false },
      prospect, 'addressed', { actor: 'human' });
    const s1 = await create_story({
      journey_id: journeyId,
      body: 'Hiring a QA documentation lead — the batch-record work is '
        + 'the obvious first cut. Worth fifteen minutes?',
    }, c);
    // Approve so it counts against the "already said" bag.
    await (await import('../../story-skill/functions/approve-story')).approve_story(
      { story_id: s1.story_id }, c);

    const r = await recommend_topic({ journey_id: journeyId }, c);
    expect(r.ready).toBe(true);
    expect(r.story_seq).toBe(2);
    expect(r.already_said).toHaveLength(1);
    // The recommender should have picked a DIFFERENT opener the second time —
    // ideally not the "QA documentation lead" line story 1 already used.
    expect(r.headline).not.toMatch(/QA documentation/i);
  });

  it('refuses to recommend when the journey has no evidence', async () => {
    // Same edge as create_story — a story with nothing to trace to is a
    // template with a name on it. The recommender returns ready:false with
    // a reason so the compose UI shows the empty-brief message.
    const p = await pool.query(
      `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1, false, 'Empty') RETURNING id`, [A]);
    const prospect = Number(p.rows[0].id);
    // Journey exists but no brief.
    await (await import('../../journey-skill/journey.service')).ensureJourney(
      createTenantDb(pool, A), { tenant_id: A, is_live: false }, prospect);
    const jid = Number((await pool.query(
      `SELECT id FROM gt_journeys WHERE prospect_id = $1`, [prospect])).rows[0].id);

    const r = await recommend_topic({ journey_id: jid }, ctx());
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/no evidence/i);
  });
});
