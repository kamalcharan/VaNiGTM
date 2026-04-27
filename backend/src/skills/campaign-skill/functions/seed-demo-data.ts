/**
 * campaign-skill: seed_demo_data
 * Populates all GTM tables with realistic demo data for the TEST environment.
 * Idempotent: clears previous demo data (tagged with source='demo') then re-inserts.
 * ONLY works when is_live = false (test mode). Throws in live mode.
 */

import { SkillContext } from '../../../shared/types';

/* ── Seed data ───────────────────────────────────────── */

const CONTACTS = [
  { prefix: 'Mr',  name: 'Rahul Mehta',       age: 42, city: 'Mumbai',    marital_status: 'married' },
  { prefix: 'Mrs', name: 'Priya Sharma',       age: 35, city: 'Delhi',     marital_status: 'married' },
  { prefix: 'Mr',  name: 'Vikram Patel',       age: 50, city: 'Ahmedabad', marital_status: 'married' },
  { prefix: 'Ms',  name: 'Ananya Reddy',       age: 28, city: 'Hyderabad', marital_status: 'single' },
  { prefix: 'Mr',  name: 'Suresh Nair',        age: 45, city: 'Kochi',     marital_status: 'married' },
  { prefix: 'Dr',  name: 'Kavita Joshi',       age: 38, city: 'Pune',      marital_status: 'married' },
  { prefix: 'Mr',  name: 'Arun Kumar',         age: 55, city: 'Chennai',   marital_status: 'married' },
  { prefix: 'Mrs', name: 'Deepa Venkatesh',    age: 40, city: 'Bangalore', marital_status: 'married' },
  { prefix: 'Mr',  name: 'Rajesh Gupta',       age: 48, city: 'Kolkata',   marital_status: 'married' },
  { prefix: 'Ms',  name: 'Sneha Iyer',         age: 32, city: 'Mumbai',    marital_status: 'single' },
  { prefix: 'Mr',  name: 'Manoj Tiwari',       age: 36, city: 'Lucknow',   marital_status: 'married' },
  { prefix: 'Mrs', name: 'Sunita Desai',       age: 44, city: 'Surat',     marital_status: 'married' },
  { prefix: 'Mr',  name: 'Amit Chopra',        age: 39, city: 'Chandigarh', marital_status: 'married' },
  { prefix: 'Ms',  name: 'Ritu Malhotra',      age: 30, city: 'Jaipur',    marital_status: 'single' },
  { prefix: 'Mr',  name: 'Sanjay Bhat',        age: 52, city: 'Mangalore', marital_status: 'married' },
  { prefix: 'Dr',  name: 'Nisha Rao',          age: 41, city: 'Mysore',    marital_status: 'married' },
  { prefix: 'Mr',  name: 'Karthik Subramani',  age: 34, city: 'Coimbatore', marital_status: 'single' },
  { prefix: 'Mrs', name: 'Lakshmi Pillai',     age: 47, city: 'Trivandrum', marital_status: 'married' },
  { prefix: 'Mr',  name: 'Dinesh Agarwal',     age: 43, city: 'Indore',    marital_status: 'married' },
  { prefix: 'Ms',  name: 'Pooja Saxena',       age: 29, city: 'Noida',     marital_status: 'single' },
  { prefix: 'Mr',  name: 'Harish Menon',       age: 51, city: 'Thrissur',  marital_status: 'married' },
  { prefix: 'Mrs', name: 'Gayatri Deshpande',  age: 37, city: 'Nagpur',    marital_status: 'married' },
  { prefix: 'Mr',  name: 'Nitin Kulkarni',     age: 46, city: 'Pune',      marital_status: 'married' },
  { prefix: 'Ms',  name: 'Divya Kapoor',       age: 33, city: 'Delhi',     marital_status: 'single' },
  { prefix: 'Mr',  name: 'Prasad Hegde',       age: 49, city: 'Hubli',     marital_status: 'married' },
];

const CAMPAIGNS = [
  {
    name: 'Q2 MFD Growth Outreach',
    description: 'Target high-net-worth MFDs in tier-1 cities for ProKey onboarding. Focus on portfolio management pain points.',
    product_name: 'ProKey',
    product_url: 'https://prokey.in',
    target_industries: ['Financial Services', 'Wealth Management', 'Insurance'],
    sender_name: 'Kamal Charan',
    sender_email: 'kamal@prokey.in',
    status: 'active',
  },
  {
    name: 'NPS Awareness Campaign',
    description: 'Educate existing MFDs about NPS integration capabilities. Upsell to Professional tier.',
    product_name: 'ProKey NPS',
    product_url: 'https://prokey.in/nps',
    target_industries: ['Financial Services', 'Banking'],
    sender_name: 'Kamal Charan',
    sender_email: 'kamal@prokey.in',
    status: 'active',
  },
  {
    name: 'Insurance MFD Pilot',
    description: 'Pilot campaign targeting insurance-focused MFDs in South India.',
    product_name: 'ProKey',
    product_url: 'https://prokey.in',
    target_industries: ['Insurance', 'Financial Services'],
    sender_name: 'Kamal Charan',
    sender_email: 'kamal@prokey.in',
    status: 'draft',
  },
];

const PERSONAS_BY_CAMPAIGN = [
  // Campaign 0 — Q2 MFD Growth
  [
    { title: 'Senior MFD', emoji: '🏦', description: 'Experienced distributor with 100+ clients and 10cr+ AUM', tags: ['Budget holder', 'Decision maker', 'Tech-savvy'], seniority: 'director', size_min: 1, size_max: 50 },
    { title: 'Growing MFD', emoji: '📈', description: 'Ambitious distributor scaling from 20-50 clients', tags: ['Growth-oriented', 'Cost-conscious', 'Process-driven'], seniority: 'manager', size_min: 1, size_max: 10 },
    { title: 'Wealth Advisor', emoji: '💎', description: 'HNI-focused advisor managing family wealth', tags: ['Premium segment', 'Relationship-driven', 'High AUM'], seniority: 'vp', size_min: 1, size_max: 20 },
  ],
  // Campaign 1 — NPS Awareness
  [
    { title: 'NPS-curious MFD', emoji: '🎯', description: 'MFD looking to add NPS to their product offering', tags: ['Cross-sell ready', 'Compliance-aware'], seniority: 'manager', size_min: 1, size_max: 30 },
    { title: 'Corporate NPS Handler', emoji: '🏢', description: 'Handles corporate NPS accounts for employers', tags: ['B2B focus', 'Volume player', 'Employer relationships'], seniority: 'director', size_min: 10, size_max: 100 },
  ],
  // Campaign 2 — Insurance Pilot
  [
    { title: 'Insurance MFD', emoji: '🛡️', description: 'Primarily insurance but exploring mutual funds', tags: ['Insurance background', 'New to MF', 'Cross-sell potential'], seniority: 'manager', size_min: 1, size_max: 20 },
    { title: 'POSP Agent', emoji: '📋', description: 'Point of Sales Person with insurance + MF license', tags: ['Multi-product', 'Field agent', 'Tech adoption needed'], seniority: 'individual-contributor', size_min: 1, size_max: 5 },
    { title: 'Agency Head', emoji: '👔', description: 'Runs a team of insurance agents, exploring MF distribution', tags: ['Team leader', 'Budget holder', 'Scale-oriented'], seniority: 'vp', size_min: 5, size_max: 50 },
  ],
];

const CHANNELS = [
  { channel_type: 'email',    name: 'Primary Email',     status: 'connected', sent: 342, replies: 47 },
  { channel_type: 'whatsapp', name: 'Business WhatsApp',  status: 'connected', sent: 189, replies: 62 },
  { channel_type: 'linkedin', name: 'LinkedIn Outreach',  status: 'pending',   sent: 78,  replies: 12 },
];

const SEQUENCES = [
  // Campaign 0
  {
    campaign_idx: 0, name: 'Cold Outreach v1', description: 'Initial outreach to new MFD prospects', status: 'live',
    contacts_count: 15, avg_open: 42.5, avg_reply: 8.3,
    steps: [
      { type: 'email',    title: 'Introduction Email',     day: 0,  subject: 'Simplify your MFD workflow with ProKey', body: 'Hi {{first_name}},\n\nI noticed you manage a growing MFD practice in {{city}}. Many distributors like you spend hours on portfolio tracking and client reporting.\n\nProKey automates this — CAS import, XIRR calculation, and branded reports in minutes.\n\nWould 15 minutes next week work for a quick demo?\n\nBest,\n{{sender_name}}' },
      { type: 'wait',     title: 'Wait 2 days',            day: 2,  wait_hours: 48 },
      { type: 'email',    title: 'Follow-up with value',   day: 2,  subject: 'Re: Quick question about your portfolio tracking', body: 'Hi {{first_name}},\n\nJust following up — I wanted to share that MFDs using ProKey report saving 5+ hours/week on portfolio management.\n\nHere\'s a 2-min walkthrough: https://prokey.in/demo\n\nHappy to answer any questions.\n\n{{sender_name}}' },
      { type: 'whatsapp', title: 'WhatsApp nudge',         day: 4,  body: 'Hi {{first_name}}, sent you an email about ProKey for MFDs — did you get a chance to look? Happy to do a quick WhatsApp call if easier.' },
      { type: 'condition', title: 'Check: Replied?',        day: 5,  condition: 'replied' },
      { type: 'linkedin', title: 'LinkedIn connect',        day: 7,  body: 'Hi {{first_name}}, I work with MFDs to streamline portfolio management. Would love to connect and share how ProKey can help your practice.' },
    ],
  },
  {
    campaign_idx: 0, name: 'Warm Re-engagement', description: 'Re-engage leads who showed initial interest', status: 'draft',
    contacts_count: 8, avg_open: 55.0, avg_reply: 15.2,
    steps: [
      { type: 'email', title: 'Check-in email', day: 0, subject: 'Still exploring portfolio tools, {{first_name}}?', body: 'Hi {{first_name}},\n\nWe spoke a few weeks ago about ProKey. Wanted to check if you\'re still exploring portfolio management solutions.\n\nWe\'ve added some new features since then — including automated NPS tracking.\n\nWould you like an updated demo?\n\n{{sender_name}}' },
      { type: 'wait', title: 'Wait 3 days', day: 3, wait_hours: 72 },
      { type: 'whatsapp', title: 'Personal follow-up', day: 3, body: 'Hi {{first_name}}, just checking in about ProKey. Happy to answer any questions you might have.' },
    ],
  },
  // Campaign 1
  {
    campaign_idx: 1, name: 'NPS Education Drip', description: 'Multi-touch NPS awareness and education', status: 'live',
    contacts_count: 12, avg_open: 38.0, avg_reply: 6.5,
    steps: [
      { type: 'email', title: 'NPS opportunity intro', day: 0, subject: 'Add NPS to your MFD practice — here\'s how', body: 'Hi {{first_name}},\n\nDid you know NPS AUM crossed ₹13 lakh crore? Many MFDs are adding NPS to offer clients a complete retirement solution.\n\nProKey now supports NPS tracking alongside your MF portfolios — one dashboard, complete visibility.\n\nInterested in learning more?\n\n{{sender_name}}' },
      { type: 'wait', title: 'Wait 4 days', day: 4, wait_hours: 96 },
      { type: 'email', title: 'Case study email', day: 4, subject: 'How an MFD added ₹2cr NPS AUM in 3 months', body: 'Hi {{first_name}},\n\nQuick case study: One of our MFD partners added NPS to their practice using ProKey and onboarded 45 NPS accounts in 3 months.\n\nKey insight: most of their existing MF clients were interested but didn\'t know their MFD offered NPS.\n\nWant to see how this could work for your practice?\n\n{{sender_name}}' },
    ],
  },
];

const STAGES = ['identified', 'contacted', 'engaged', 'interested', 'qualified', 'converted', 'lost'] as const;
const STAGE_WEIGHTS = [8, 7, 6, 4, 3, 1, 1]; // Distribution bias

const AGENT_TYPES = ['orchestrator', 'outreach', 'prospecting', 'conversion', 'aeo', 'feedback'] as const;
const AGENT_ACTIONS = [
  { type: 'orchestrator', name: 'GTM Orchestrator',        actions: ['Evaluated 3 campaigns — all healthy', 'Paused Insurance Pilot — low engagement', 'Triggered re-scoring for Q2 campaign contacts'] },
  { type: 'outreach',     name: 'Outreach Agent',          actions: ['Sent 12 emails for Cold Outreach v1', 'Sent 8 WhatsApp messages for NPS Drip', 'Scheduled 5 LinkedIn connects'] },
  { type: 'prospecting',  name: 'Lead Scoring Agent',      actions: ['Scored 25 contacts — 8 upgraded to "interested"', 'Identified 5 new high-fit prospects', 'Flagged 3 contacts as lost — no response after 4 touches'] },
  { type: 'conversion',   name: 'Meeting Scheduler Agent', actions: ['Booked 2 demo meetings for next week', 'Sent calendar invites to 3 qualified leads', 'Follow-up reminder sent to 4 no-shows'] },
  { type: 'aeo',          name: 'AEO Visibility Agent',    actions: ['Updated search rankings — ProKey now #3 for "MFD portfolio tool"', 'Published content cluster: NPS for MFDs', 'AEO score +2 on Google, +1 on LinkedIn'] },
  { type: 'feedback',     name: 'Campaign Optimizer',      actions: ['Recommended subject line change — open rate below threshold', 'Suggested WhatsApp timing shift to 10am IST', 'Flagged sequence step 3 — 0% reply rate, needs revision'] },
];

const EVENT_TYPES = [
  'email_sent', 'email_opened', 'email_replied', 'email_clicked',
  'whatsapp_sent', 'whatsapp_replied',
  'linkedin_sent', 'linkedin_visit',
  'stage_change', 'agent_action', 'meeting_booked',
  'contact_assigned', 'sequence_started',
] as const;

/* ── Helpers ─────────────────────────────────────────── */

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }

function weightedStage(): string {
  const total = STAGE_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < STAGES.length; i++) {
    r -= STAGE_WEIGHTS[i];
    if (r <= 0) return STAGES[i];
  }
  return 'identified';
}

/* ── Main ────────────────────────────────────────────── */

export async function seed_demo_data(
  _params: Record<string, never>,
  ctx: SkillContext
) {
  if (ctx.is_live) {
    throw new Error('Demo data can only be seeded in TEST mode. Switch to Test environment first.');
  }

  const counts = { contacts: 0, campaigns: 0, personas: 0, channels: 0, sequences: 0, steps: 0, templates: 0, assignments: 0, agent_runs: 0, events: 0, metrics: 0 };

  await ctx.db.transaction(async (tx) => {

    // ── 1. Clear previous demo data ───────────────────
    // Delete in reverse dependency order
    await tx.query(`DELETE FROM gt_activity_feed    WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_agent_runs       WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_campaign_metrics  WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_stage_log         WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_contact_assignments WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_step_templates    WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_sequence_steps    WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_sequences         WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_channels          WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_persona_signals   WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_personas          WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });
    await tx.query(`DELETE FROM gt_campaigns         WHERE tenant_id = $tenant_id AND is_live = false`, { $tenant_id: ctx.tenant_id });

    // ── 2. Seed contacts (if not enough exist) ────────
    const existingContacts = await tx.query<{ id: number }>(
      `SELECT id FROM ki_contacts WHERE tenant_id = $tenant_id AND is_live = false AND is_active = true ORDER BY id LIMIT 25`,
      { $tenant_id: ctx.tenant_id }
    );

    const contactIds: number[] = existingContacts.rows.map(r => r.id);

    if (contactIds.length < 25) {
      for (let i = contactIds.length; i < CONTACTS.length; i++) {
        const c = CONTACTS[i];
        const res = await tx.query<{ id: number }>(
          `INSERT INTO ki_contacts (tenant_id, is_live, prefix, name, contact_no, created_by, age, city, marital_status)
           VALUES ($tenant_id, false, $prefix, $name, ki_next_seq($tenant_id::uuid, 'contact'), $created_by, $age, $city, $marital_status)
           RETURNING id`,
          { $tenant_id: ctx.tenant_id, $prefix: c.prefix, $name: c.name, $created_by: ctx.user_id,
            $age: c.age, $city: c.city, $marital_status: c.marital_status }
        );
        contactIds.push(res.rows[0].id);
        counts.contacts++;

        // Add channels for each contact
        if (i % 2 === 0 || i < 15) {
          await tx.query(
            `INSERT INTO ki_contact_channels (contact_id, tenant_id, is_live, channel_type, channel_value, is_primary)
             VALUES ($cid, $tenant_id, false, 'mobile', $val, true)
             ON CONFLICT DO NOTHING`,
            { $cid: res.rows[0].id, $tenant_id: ctx.tenant_id, $val: `+91${9800000000 + i * 111}` }
          );
        }
        if (i % 3 === 0 || i < 10) {
          await tx.query(
            `INSERT INTO ki_contact_channels (contact_id, tenant_id, is_live, channel_type, channel_value, is_primary)
             VALUES ($cid, $tenant_id, false, 'email', $val, $primary)
             ON CONFLICT DO NOTHING`,
            { $cid: res.rows[0].id, $tenant_id: ctx.tenant_id, $val: `${c.name.toLowerCase().replace(/\s+/g, '.')}@example.com`, $primary: i >= 15 }
          );
        }
      }
    }

    // ── 3. Seed campaigns ─────────────────────────────
    const campaignIds: number[] = [];
    for (const camp of CAMPAIGNS) {
      const res = await tx.query<{ id: number }>(
        `INSERT INTO gt_campaigns (tenant_id, is_live, campaign_no, name, description, product_name, product_url, target_industries, sender_name, sender_email, status, created_by, launched_at)
         VALUES ($tenant_id, false, ki_next_seq($tenant_id::uuid, 'campaign'), $name, $desc, $product, $url, $industries::jsonb, $sender_name, $sender_email, $status, $user_id,
                 CASE WHEN $status = 'active' THEN now() - interval '14 days' ELSE NULL END)
         RETURNING id`,
        { $tenant_id: ctx.tenant_id, $name: camp.name, $desc: camp.description, $product: camp.product_name,
          $url: camp.product_url, $industries: JSON.stringify(camp.target_industries),
          $sender_name: camp.sender_name, $sender_email: camp.sender_email, $status: camp.status, $user_id: ctx.user_id }
      );
      campaignIds.push(res.rows[0].id);
      counts.campaigns++;
    }

    // ── 4. Seed personas + signals ────────────────────
    for (let ci = 0; ci < PERSONAS_BY_CAMPAIGN.length; ci++) {
      for (const p of PERSONAS_BY_CAMPAIGN[ci]) {
        const res = await tx.query<{ id: number }>(
          `INSERT INTO gt_personas (campaign_id, tenant_id, is_live, title, emoji, description, tags, company_size_min, company_size_max, seniority_level)
           VALUES ($cid, $tenant_id, false, $title, $emoji, $desc, $tags::jsonb, $min, $max, $seniority)
           RETURNING id`,
          { $cid: campaignIds[ci], $tenant_id: ctx.tenant_id, $title: p.title, $emoji: p.emoji, $desc: p.description,
            $tags: JSON.stringify(p.tags), $min: p.size_min, $max: p.size_max, $seniority: p.seniority }
        );
        counts.personas++;

        // Add 2-3 signals per persona
        const signalTypes = ['behavior', 'firmographic', 'intent'] as const;
        const signalLabels = ['Active on LinkedIn', 'Attended industry webinar', 'Company growing 20%+ YoY', 'Searched for MFD tools', 'Recently changed role'];
        for (let si = 0; si < randInt(2, 3); si++) {
          await tx.query(
            `INSERT INTO gt_persona_signals (persona_id, tenant_id, is_live, signal_type, label, weight)
             VALUES ($pid, $tenant_id, false, $type, $label, $weight)`,
            { $pid: res.rows[0].id, $tenant_id: ctx.tenant_id, $type: signalTypes[si % signalTypes.length],
              $label: signalLabels[(ci * 3 + si) % signalLabels.length], $weight: randInt(3, 8) }
          );
        }
      }
    }

    // ── 5. Seed channels ──────────────────────────────
    const channelIds: Record<string, number> = {};
    for (const ch of CHANNELS) {
      const res = await tx.query<{ id: number }>(
        `INSERT INTO gt_channels (tenant_id, is_live, channel_type, name, status, total_sent, total_replies, created_by, last_tested_at)
         VALUES ($tenant_id, false, $type, $name, $status, $sent, $replies, $user_id, now() - interval '2 days')
         RETURNING id`,
        { $tenant_id: ctx.tenant_id, $type: ch.channel_type, $name: ch.name, $status: ch.status,
          $sent: ch.sent, $replies: ch.replies, $user_id: ctx.user_id }
      );
      channelIds[ch.channel_type] = res.rows[0].id;
      counts.channels++;
    }

    // ── 6. Seed sequences + steps + templates ─────────
    const sequenceIds: number[] = [];
    for (const seq of SEQUENCES) {
      const cid = campaignIds[seq.campaign_idx];
      const res = await tx.query<{ id: number }>(
        `INSERT INTO gt_sequences (campaign_id, tenant_id, is_live, name, description, status, contacts_count, avg_open_rate, avg_reply_rate, created_by)
         VALUES ($cid, $tenant_id, false, $name, $desc, $status, $contacts, $open, $reply, $user_id)
         RETURNING id`,
        { $cid: cid, $tenant_id: ctx.tenant_id, $name: seq.name, $desc: seq.description, $status: seq.status,
          $contacts: seq.contacts_count, $open: seq.avg_open, $reply: seq.avg_reply, $user_id: ctx.user_id }
      );
      sequenceIds.push(res.rows[0].id);
      counts.sequences++;

      for (let si = 0; si < seq.steps.length; si++) {
        const step = seq.steps[si];
        const chId = step.type === 'wait' || step.type === 'condition' ? null : (channelIds[step.type] ?? null);
        const stepRes = await tx.query<{ id: number }>(
          `INSERT INTO gt_sequence_steps (sequence_id, tenant_id, is_live, step_type, title, day_offset, wait_duration_hours, condition_type, channel_id, sort_order, total_sent, open_rate, reply_rate)
           VALUES ($sid, $tenant_id, false, $type, $title, $day, $wait, $cond, $ch_id, $sort, $sent, $open, $reply)
           RETURNING id`,
          { $sid: res.rows[0].id, $tenant_id: ctx.tenant_id, $type: step.type, $title: step.title,
            $day: step.day, $wait: step.wait_hours ?? null, $cond: step.condition ?? null,
            $ch_id: chId, $sort: si,
            $sent: step.type === 'wait' || step.type === 'condition' ? 0 : randInt(5, 20),
            $open: step.type === 'email' ? randInt(25, 60) : 0,
            $reply: ['email', 'whatsapp', 'linkedin'].includes(step.type) ? randInt(3, 18) : 0 }
        );
        counts.steps++;

        // Add template for message steps
        if (step.body) {
          await tx.query(
            `INSERT INTO gt_step_templates (step_id, tenant_id, is_live, variant_label, subject, body)
             VALUES ($step_id, $tenant_id, false, 'A', $subject, $body)`,
            { $step_id: stepRes.rows[0].id, $tenant_id: ctx.tenant_id,
              $subject: step.subject ?? null, $body: step.body }
          );
          counts.templates++;

          // Add B variant for first email of each sequence
          if (si === 0 && step.type === 'email') {
            await tx.query(
              `INSERT INTO gt_step_templates (step_id, tenant_id, is_live, variant_label, subject, body)
               VALUES ($step_id, $tenant_id, false, 'B', $subject, $body)`,
              { $step_id: stepRes.rows[0].id, $tenant_id: ctx.tenant_id,
                $subject: `Quick question about your MFD practice, {{first_name}}`,
                $body: `Hi {{first_name}},\n\nI help MFDs in {{city}} save 5+ hours/week on portfolio management.\n\nOne quick question: what\'s your biggest time sink right now — client reporting, NAV tracking, or CAS imports?\n\nI might be able to help.\n\n{{sender_name}}` }
            );
            counts.templates++;
          }
        }
      }
    }

    // ── 7. Seed contact assignments across pipeline ───
    const assignmentIds: number[] = [];
    for (let i = 0; i < Math.min(contactIds.length, 25); i++) {
      const cid = contactIds[i];
      const campIdx = i < 15 ? 0 : (i < 20 ? 1 : 2);
      const stage = weightedStage();
      const score = stage === 'identified' ? randInt(0, 20) :
                    stage === 'contacted'  ? randInt(15, 40) :
                    stage === 'engaged'    ? randInt(35, 60) :
                    stage === 'interested' ? randInt(55, 75) :
                    stage === 'qualified'  ? randInt(70, 90) :
                    stage === 'converted'  ? randInt(85, 100) : 0;

      const res = await tx.query<{ id: number }>(
        `INSERT INTO gt_contact_assignments (contact_id, campaign_id, tenant_id, is_live, stage, score, sequence_id, first_contacted_at, last_activity_at)
         VALUES ($contact_id, $campaign_id, $tenant_id, false, $stage, $score, $seq_id,
                 CASE WHEN $stage != 'identified' THEN now() - ($days || ' days')::interval ELSE NULL END,
                 now() - ($recent || ' hours')::interval)
         ON CONFLICT (contact_id, campaign_id, is_live) DO NOTHING
         RETURNING id`,
        { $contact_id: cid, $campaign_id: campaignIds[campIdx], $tenant_id: ctx.tenant_id,
          $stage: stage, $score: score,
          $seq_id: sequenceIds[campIdx < 2 ? campIdx : 0] ?? null,
          $days: randInt(1, 14), $recent: randInt(1, 72) }
      );
      if (res.rows[0]) {
        assignmentIds.push(res.rows[0].id);
        counts.assignments++;

        // Stage log entry
        await tx.query(
          `INSERT INTO gt_stage_log (assignment_id, tenant_id, is_live, to_stage, trigger_type, created_by)
           VALUES ($aid, $tenant_id, false, $stage, 'manual', $user_id)`,
          { $aid: res.rows[0].id, $tenant_id: ctx.tenant_id, $stage: stage, $user_id: ctx.user_id }
        );
      }
    }

    // ── 8. Seed agent runs ────────────────────────────
    for (let i = 0; i < 20; i++) {
      const agentDef = AGENT_ACTIONS[i % AGENT_ACTIONS.length];
      const action = agentDef.actions[i % agentDef.actions.length];
      const status = i < 15 ? 'success' : (i < 18 ? 'partial' : 'error');
      const durationMs = randInt(200, 4500);

      await tx.query(
        `INSERT INTO gt_agent_runs (tenant_id, is_live, agent_type, agent_name, campaign_id, action, status, duration_ms, started_at, completed_at, inputs, outputs, error_message)
         VALUES ($tenant_id, false, $type, $name, $cid, $action, $status, $duration,
                 now() - ($hours || ' hours')::interval,
                 now() - ($hours || ' hours')::interval + ($duration || ' milliseconds')::interval,
                 $inputs::jsonb, $outputs::jsonb, $error)`,
        { $tenant_id: ctx.tenant_id, $type: agentDef.type, $name: agentDef.name,
          $cid: campaignIds[i % campaignIds.length], $action: action, $status: status,
          $duration: durationMs, $hours: i * 3 + randInt(0, 2),
          $inputs: JSON.stringify({ contacts_evaluated: randInt(5, 50), threshold: 0.7 }),
          $outputs: JSON.stringify({ actions_taken: randInt(1, 12), stage_changes: randInt(0, 5) }),
          $error: status === 'error' ? 'Rate limit exceeded — retrying in 60s' : null }
      );
      counts.agent_runs++;
    }

    // ── 9. Seed activity feed ─────────────────────────
    const feedSummaries: Record<string, string[]> = {
      email_sent:        ['Email sent to Rahul Mehta', 'Email sent to Priya Sharma', 'Email sent to Vikram Patel', 'Batch: 5 emails sent for Cold Outreach v1'],
      email_opened:      ['Rahul Mehta opened "Simplify your MFD workflow"', 'Priya Sharma opened intro email', 'Vikram Patel opened follow-up'],
      email_replied:     ['Priya Sharma replied — interested in demo', 'Suresh Nair replied — asked for pricing'],
      email_clicked:     ['Ananya Reddy clicked demo link', 'Kavita Joshi clicked walkthrough video'],
      whatsapp_sent:     ['WhatsApp sent to Rahul Mehta', 'WhatsApp nudge to Arun Kumar'],
      whatsapp_replied:  ['Deepa Venkatesh replied on WhatsApp — schedule call', 'Rajesh Gupta: "Send more details"'],
      linkedin_sent:     ['LinkedIn connect request to Sneha Iyer', 'LinkedIn message to Manoj Tiwari'],
      linkedin_visit:    ['Sunita Desai visited LinkedIn profile', 'Amit Chopra viewed company page'],
      stage_change:      ['Priya Sharma moved to "interested"', 'Vikram Patel qualified — high score', 'Suresh Nair converted — meeting booked'],
      agent_action:      ['Orchestrator: evaluated 3 campaigns', 'Outreach Agent: sent 12 emails', 'Lead Scoring: upgraded 5 contacts'],
      meeting_booked:    ['Demo meeting booked with Priya Sharma — Thu 10am', 'Meeting booked: Vikram Patel — Fri 3pm'],
      contact_assigned:  ['5 contacts assigned to Q2 MFD Growth', '3 contacts assigned to NPS Campaign'],
      sequence_started:  ['Cold Outreach v1 started for 15 contacts', 'NPS Education Drip started for 12 contacts'],
    };

    for (let i = 0; i < 50; i++) {
      const eventType = EVENT_TYPES[i % EVENT_TYPES.length];
      const summaries = feedSummaries[eventType] ?? ['Activity event'];
      const summary = summaries[i % summaries.length];

      await tx.query(
        `INSERT INTO gt_activity_feed (tenant_id, is_live, event_type, campaign_id, summary, created_at)
         VALUES ($tenant_id, false, $type, $cid, $summary, now() - ($mins || ' minutes')::interval)`,
        { $tenant_id: ctx.tenant_id, $type: eventType,
          $cid: campaignIds[i % campaignIds.length], $summary: summary,
          $mins: i * 25 + randInt(0, 20) }
      );
      counts.events++;
    }

    // ── 10. Seed campaign metrics (14 days) ───────────
    for (const cid of campaignIds.slice(0, 2)) {
      for (let d = 13; d >= 0; d--) {
        const base = 14 - d; // grows over time
        await tx.query(
          `INSERT INTO gt_campaign_metrics
             (campaign_id, tenant_id, is_live, period, period_start,
              total_contacts, stage_identified, stage_contacted, stage_engaged, stage_interested, stage_qualified, stage_converted, stage_lost,
              emails_sent, emails_opened, emails_replied, emails_clicked,
              whatsapp_sent, whatsapp_replied, linkedin_sent, linkedin_replied,
              open_rate, reply_rate, click_rate, meetings_booked)
           VALUES ($cid, $tenant_id, false, 'daily', (now() - ($d || ' days')::interval)::date,
              $total, $ident, $contact, $engage, $interest, $qual, $conv, $lost,
              $em_sent, $em_open, $em_reply, $em_click,
              $wa_sent, $wa_reply, $li_sent, $li_reply,
              $open_rate, $reply_rate, $click_rate, $meetings)
           ON CONFLICT (campaign_id, is_live, period, period_start) DO NOTHING`,
          { $cid: cid, $tenant_id: ctx.tenant_id, $d: d,
            $total: base * 2 + randInt(0, 3),
            $ident: Math.max(base - randInt(0, 3), 1), $contact: Math.max(base - 2 - randInt(0, 2), 0),
            $engage: Math.max(base - 4 - randInt(0, 2), 0), $interest: Math.max(base - 6 - randInt(0, 2), 0),
            $qual: Math.max(base - 8 - randInt(0, 1), 0), $conv: Math.max(base - 11, 0), $lost: randInt(0, 1),
            $em_sent: randInt(3, 12), $em_open: randInt(1, 8), $em_reply: randInt(0, 3), $em_click: randInt(0, 2),
            $wa_sent: randInt(1, 6), $wa_reply: randInt(0, 3), $li_sent: randInt(0, 4), $li_reply: randInt(0, 1),
            $open_rate: randInt(25, 55), $reply_rate: randInt(4, 18), $click_rate: randInt(2, 12),
            $meetings: d < 5 ? randInt(0, 2) : 0 }
        );
        counts.metrics++;
      }
    }
  });

  return {
    seeded: true,
    counts,
    message: `Demo data created: ${counts.campaigns} campaigns, ${counts.personas} personas, ${counts.channels} channels, ${counts.sequences} sequences, ${counts.steps} steps, ${counts.templates} templates, ${counts.assignments} contact assignments, ${counts.agent_runs} agent runs, ${counts.events} feed events, ${counts.metrics} metric snapshots${counts.contacts > 0 ? `, ${counts.contacts} new contacts` : ''}`,
    recipe: 'confirmation' as const,
  };
}
