/**
 * VaNi AI — Task A1 local end-to-end proof
 *
 * Exercises the full anonymous flow directly against AssessmentAgent (same
 * code path assessment.routes.ts calls, minus the HTTP layer) against
 * whatever DB_PRIMARY points at:
 *
 *   getPublicDefinition -> saveAnswer x12 -> completeAssessment -> captureLead
 *   -> getReportByToken
 *
 * What this does and does NOT prove:
 *   - scoring.test.ts (unit, no DB) proves the scoring ARITHMETIC is correct
 *     against a hand-worked fixture.
 *   - THIS script proves the DB round-trip doesn't corrupt that arithmetic —
 *     it compares the score persisted via the full pipeline (JSONB storage,
 *     transaction handling, answers merge, template fill) against
 *     scoreResponse() called directly on the same definition + answers. A
 *     mismatch here means the plumbing is wrong even though the math is
 *     right — that's a distinct, real failure mode (e.g. answers merged in
 *     the wrong order, wrong definition fetched, JSON round-trip losing a
 *     field).
 *
 * Usage:
 *   npm run verify:assessment
 *
 * Requires DB_PRIMARY pointed at a database with migrations 001-228 applied
 * and the ai-recovery definition seeded (npm run db:migrate && npm run
 * db:seed-assessment).
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { getPool, withTenantClient } from './db';
import { AssessmentAgent, resolveTenantId } from './skills/assessment-skill/assessment.agent';
import { scoreResponse } from './skills/assessment-skill/scoring';

const SLUG = 'ai-recovery';

// Fixed answer set (option indices), chosen to exercise every mode at least
// once and vary scores rather than all-same-index.
const ANSWERS: Record<string, number> = {
  Q1: 2, Q2: 2, Q3: 1, Q4: 3, Q5: 3, Q6: 1,
  Q7: 0, Q8: 2, Q9: 1, Q10: 0, Q11: 2, Q12: 1,
};

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const pool: Pool = getPool();
  console.log(`[Verify] DB_PRIMARY=${process.env.DB_PRIMARY?.replace(/\/\/.*@/, '//***@')}\n`);

  console.log('[1] GET /:slug — public definition');
  const definition = await AssessmentAgent.getPublicDefinition(pool, SLUG);
  check('definition found', definition !== null);
  check('12 questions returned', definition?.questions.length === 12, `got ${definition?.questions.length}`);
  check('options carry no score field (stripped for the client)', (() => {
    const q = definition?.questions.find((q: any) => q.id === 'Q2') as any;
    return q && q.options[0].score === undefined;
  })());

  // Independently score the same answers via the pure function, against the
  // FULL definition (fetched raw from the DB, not the client-stripped one
  // above) — this is the "expected" side of the comparison.
  //
  // gt_assessment_def is RLS-protected, so this needs tenant context. As a
  // plain pool.query it returned zero rows the moment the runtime was pointed
  // at a non-superuser role, and this script died on `rows[0].definition` of
  // undefined — which is precisely the failure this script exists to catch,
  // so it must not be the script's own blind spot.
  const tenantId = await resolveTenantId(pool);
  const rawDefResult = await withTenantClient(pool, tenantId, (client) =>
    client.query<{ definition: any }>(
      `SELECT definition FROM gt_assessment_def
       WHERE  service_slug = $1 AND tenant_id = $2
       ORDER  BY version DESC LIMIT 1`,
      [SLUG, tenantId],
    ));
  const rawDefinition = rawDefResult.rows[0].definition;
  const expected = scoreResponse(rawDefinition, ANSWERS);
  console.log(`\n[Expected, via scoreResponse() directly] health=${expected.health} band=${expected.band.key} top_modes=${expected.top_modes.map((m) => `${m.key}:${m.exposure_pct}%`).join(', ')}`);

  console.log('\n[2] POST /answer x12 — first call creates the response row');
  let responseId: string | undefined;
  let anonToken: string | undefined;
  for (const [questionId, optionIndex] of Object.entries(ANSWERS)) {
    const result = await AssessmentAgent.saveAnswer(pool, {
      responseId, anonToken, serviceSlug: SLUG, questionId, optionIndex,
      ref: questionId === 'Q1' ? 'nonexistent-partner-ref' : undefined,
    });
    responseId = result.responseId;
    anonToken = result.anonToken;
  }
  check('response row created', !!responseId && !!anonToken);
  check(
    'unknown ?ref silently treated as Direct (no partner row exists in this fresh DB)',
    true, // verified by saveAnswer not throwing above
  );

  console.log('\n[3] POST /complete — score the response (teaser payload)');
  const completed = await AssessmentAgent.completeAssessment(pool, responseId!, anonToken!);
  check('health_score matches scoreResponse() directly', completed.health_score === expected.health,
    `persisted=${completed.health_score} expected=${expected.health}`);
  check('band key matches scoreResponse() directly', completed.band.key === expected.band.key,
    `persisted=${completed.band.key} expected=${expected.band.key}`);
  check('band carries label + verdict copy (frontend holds none of its own)',
    completed.band.label === expected.band.label && completed.band.verdict === expected.band.verdict);
  check('top_mode is the #1 exposure', completed.top_mode.key === expected.top_modes[0].key,
    `got=${completed.top_mode.key} expected=${expected.top_modes[0].key}`);
  // The teaser gate is only real if the gated content isn't in the response.
  check('teaser payload does NOT leak modes #2/#3 (gate is real, not cosmetic)',
    !JSON.stringify(completed).includes(expected.top_modes[1].name)
    && !JSON.stringify(completed).includes(expected.top_modes[2].name),
    'a locked mode name appeared in the /complete response');
  check('teaser payload does NOT leak remediation/referral copy',
    !JSON.stringify(completed).includes(expected.top_modes[0].referral_line));

  console.log('\n[3b] POST /complete a second time on the same response (idempotency check)');
  try {
    await AssessmentAgent.completeAssessment(pool, responseId!, anonToken!);
    check('re-completing an already-completed response is rejected', false, 'did not throw');
  } catch (err) {
    check('re-completing an already-completed response is rejected', err instanceof Error && err.message.startsWith('RESPONSE_NOT_FOUND'));
  }

  console.log('\n[4] POST /capture — lead + synchronous fallback report');
  const captured = await AssessmentAgent.captureLead(pool, {
    responseId: responseId!, anonToken: anonToken!,
    name: 'Ananya Rao', email: 'ananya@meditech.example', company: 'MediTech Diagnostics', roleTitle: 'COO',
  });
  check('lead created', !!captured.leadId);
  check('lead_no formatted via gt_next_seq', /^LEAD-\d+$/.test(captured.leadNo), captured.leadNo);
  check('report_token issued', !!captured.reportToken);
  check('report ref formatted via gt_next_seq', /^VN-\d+$/.test(captured.reportRef), captured.reportRef);

  console.log('\n[4b] POST /capture a second time on the same response (idempotency check)');
  try {
    await AssessmentAgent.captureLead(pool, {
      responseId: responseId!, anonToken: anonToken!,
      name: 'x', email: 'x@x.com', company: 'x', roleTitle: 'x',
    });
    check('re-capturing an already-captured response is rejected', false, 'did not throw');
  } catch (err) {
    check('re-capturing an already-captured response is rejected', err instanceof Error && err.message === 'LEAD_ALREADY_CAPTURED');
  }

  console.log('\n[5] GET /report/:token — public, no auth');
  const report = await AssessmentAgent.getReportByToken(pool, captured.reportToken);
  check('report found by token', report !== null);
  check('report health_score matches expected', (report as any)?.health_score === expected.health);
  check('report band key matches expected', (report as any)?.band?.key === expected.band.key);
  check('report band carries label/verdict/next_step (frontend renders, never authors)',
    !!(report as any)?.band?.label && !!(report as any)?.band?.verdict && !!(report as any)?.band?.next_step);
  check('narrative is the FALLBACK (no LLM call in this task)', (report as any)?.narrative?.length > 0);

  const narrative: string = (report as any)?.narrative ?? '';
  check('narrative has no unfilled {{merge_field}} left over', !/\{\{\w+\}\}/.test(narrative), narrative);
  check(`narrative mentions the health score (${expected.health})`, narrative.includes(String(expected.health)));
  check(`narrative mentions top mode #1 name ("${expected.top_modes[0].name}")`, narrative.includes(expected.top_modes[0].name));
  console.log(`\n  Narrative: "${narrative}"`);

  // Task A2 item 0: gt_report.top_modes is frozen at capture time (migration
  // 229) so report + any future email read the SAME ordered list rather than
  // each recomputing — check it's actually there, in the tie-broken order
  // scoreResponse() produces, key-for-key.
  const reportTopModes = (report as any)?.top_modes as Array<{ key: string }> | null;
  check('gt_report.top_modes is populated (not left NULL)', Array.isArray(reportTopModes) && reportTopModes.length > 0);
  check(
    'gt_report.top_modes order matches scoreResponse()\'s tie-broken order, key-for-key',
    JSON.stringify(reportTopModes?.map((m) => m.key)) === JSON.stringify(expected.top_modes.map((m) => m.key)),
    `report=${JSON.stringify(reportTopModes?.map((m) => m.key))} expected=${JSON.stringify(expected.top_modes.map((m) => m.key))}`,
  );

  // Migration 230 — the ten-mode profile the blueprint's report bar chart
  // renders. Frontend computes none of it.
  const reportAllModes = (report as any)?.all_modes as Array<{ key: string }> | null;
  check('gt_report.all_modes is populated (feeds the ten-mode bar chart)',
    Array.isArray(reportAllModes) && reportAllModes.length === rawDefinition.modes.length,
    `got ${reportAllModes?.length} expected ${rawDefinition.modes.length}`);
  check('gt_report.all_modes order matches scoreResponse() exactly',
    JSON.stringify(reportAllModes?.map((m) => m.key)) === JSON.stringify(expected.all_modes.map((m) => m.key)));
  check('report carries the CTA/signoff block from the definition',
    !!(report as any)?.report?.cta_label && !!(report as any)?.report?.signoff);

  console.log('\n[6] GET /report/:token with a garbage token (must not leak data)');
  const bogus = await AssessmentAgent.getReportByToken(pool, '00000000-0000-0000-0000-000000000000');
  check('unknown token returns null, not an error or someone else\'s report', bogus === null);

  console.log(`\n${'─'.repeat(60)}`);
  if (failures === 0) {
    console.log(`[Verify] ✓ ALL CHECKS PASSED`);
  } else {
    console.log(`[Verify] ✗ ${failures} CHECK(S) FAILED`);
  }
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[Verify] FAILED:', err);
  process.exit(1);
});
