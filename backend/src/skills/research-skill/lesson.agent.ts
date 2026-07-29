/**
 * Fit Lesson Agent — the Learning Graph, write side.
 *
 * Reads everything a reviewer has ruled on and proposes the RULES behind those
 * rulings, each carrying the companies and the reviewer's own words it was
 * inferred from. A human then accepts, edits or rejects each one, and only the
 * accepted rules reach the fit prompt.
 *
 *   1. gather   — every decided brief for this tenant and environment
 *   2. propose  — one LLM call: decisions → candidate rules with evidence
 *   3. dedupe   — drop anything already proposed, accepted or REJECTED
 *   4. write    — gt_fit_lessons, status='proposed'
 *
 * ── AGENT PROPOSES, HUMAN CONFIRMS ────────────────────────────────────
 *
 * The agent never ratifies its own inference. A model that derives a rule
 * from its own corrected mistakes and then obeys it — with nobody in between
 * — is how a system drifts into a policy nobody chose, and it does so
 * confidently and invisibly. So a proposal sits at `proposed` until a human
 * presses accept, and the fit prompt cannot see it before then.
 *
 * ── WHY THE EVIDENCE IS MANDATORY ─────────────────────────────────────
 *
 * Every proposal must name the companies it came from. A rule nobody can
 * trace back to real decisions cannot be checked, and an unfalsifiable rule
 * is exactly what should not be allowed to decide who gets contacted. A
 * proposal whose cited companies are not in the decision history is dropped
 * as invented — the same gate the account agent applies to evidence excerpts
 * (CLAUDE.md rule 12).
 *
 * ── WHY REJECTED LESSONS ARE KEPT ─────────────────────────────────────
 *
 * Deleting them means the agent proposes the same thing again next week and
 * the reviewer re-reads and re-rejects it forever. A rejection is itself a
 * decision, and it is remembered.
 */

import type { Pool } from 'pg';
import { z } from 'zod';
import { createTenantDb } from '../../db';
import { appendStep, setStatus } from '../../agent-core/agent.runner';
import { callLLMValidated } from '../../agent-core/llm.client';
import { loadPrompt } from '../../agent-core/prompt.store';
import { lessonKey, isLessonKind, LESSON_KINDS, type LessonKind } from './lessons';
import { readOffers } from './offer-catalogue';

export const FIT_LESSON_AGENT_NAME = 'FIT_LESSONS_REQUESTED';

/**
 * Below this there is nothing to generalise from — three rejections are three
 * rejections, not a rule. Proposing anyway would produce a confident policy
 * built on a Tuesday afternoon, and the reviewer would have no way to tell.
 */
export const MIN_DECISIONS = 6;

/** More than this and the prompt stops fitting; the most recent win. */
const MAX_DECISIONS_READ = 60;

const ProposalSchema = z.object({
  lessons: z.array(z.object({
    lesson: z.string(),
    kind: z.string(),
    applies_to: z.string().nullable().optional(),
    /** Company names, exactly as given. Checked against the history. */
    from_companies: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })),
});

interface DecisionRow {
  company: string;
  what_they_make: string | null;
  scale_signals: string | null;
  digital_maturity: string | null;
  agent_offer: string | null;
  human_offer: string | null;
  decision: string;
  note: string | null;
}

export class FitLessonAgent {
  static async run(
    pool: Pool,
    tenantId: string,
    payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const db = createTenantDb(pool, tenantId);
    const isLive = payload.is_live === true;

    // 1. GATHER
    const decisions = await db.query<DecisionRow>(
      `SELECT p.name               AS company,
              b.what_they_make, b.scale_signals, b.digital_maturity,
              b.recommended_offer  AS agent_offer,
              b.human_offer,
              b.status             AS decision,
              b.decision_note      AS note
         FROM gt_account_briefs b
         JOIN gt_prospects p
               ON p.id        = b.prospect_id
              AND p.tenant_id = $tenant_id
              AND p.is_live   = $is_live
        WHERE b.tenant_id  = $tenant_id
          AND b.is_live    = $is_live
          AND b.decided_at IS NOT NULL
          -- A ruling on a company whose site we could not read is a ruling
          -- about our pipeline. There is no lesson about them in it.
          AND b.status NOT IN ('unreadable','extract_failed')
        ORDER BY b.decided_at DESC
        LIMIT $limit`,
      { tenant_id: tenantId, is_live: isLive, limit: MAX_DECISIONS_READ },
    );

    const rows = decisions.rows;

    await appendStep(pool, runId, {
      step_name: 'gather_decisions',
      action: 'Read every brief you have ruled on',
      output_summary: `${rows.length} decision(s)`,
      status: 'ok',
    });

    // Not enough to generalise from — said plainly rather than answered with
    // a rule invented out of four data points.
    if (rows.length < MIN_DECISIONS) {
      await setStatus(pool, runId, 'completed', {
        output: {
          proposed: 0,
          decisions: rows.length,
          message: `Only ${rows.length} decision(s) so far. `
            + `Lessons are proposed from ${MIN_DECISIONS} or more — below that a `
            + '"rule" is just a description of a handful of companies.',
        },
      });
      return;
    }

    // Rules already ruled on, so the agent is not asked to re-propose things
    // the reviewer has already accepted OR rejected.
    const known = await db.query<{ lesson_key: string; status: string }>(
      `SELECT lesson_key, status FROM gt_fit_lessons
        WHERE tenant_id = $tenant_id AND is_live = $is_live`,
      { tenant_id: tenantId, is_live: isLive },
    );
    const knownKeys = new Map(known.rows.map((r) => [r.lesson_key, r.status]));

    const offers = await readOffers(db, tenantId);
    const offerNames = new Map(offers.map((o) => [o.id, o.name]));
    const validOffers = new Set(offers.map((o) => o.id));

    const history = rows.map((d) => {
      const said = d.agent_offer ? (offerNames.get(d.agent_offer) ?? d.agent_offer) : 'no fit';
      const settled = d.human_offer ?? d.agent_offer;
      const did = d.decision === 'approved'
        ? `APPROVED under ${settled ? (offerNames.get(settled) ?? settled) : 'no offer'}`
        : (d.decision === 'no_contact' ? 'RULED OUT — do not contact' : 'REJECTED');
      return [
        `Company: ${d.company}`,
        `  makes: ${d.what_they_make ?? 'not stated'}`,
        `  scale: ${d.scale_signals ?? 'not stated'}`,
        `  digital: ${d.digital_maturity ?? 'not stated'}`,
        `  agent proposed: ${said}`,
        `  reviewer: ${did}`,
        d.note ? `  reviewer's words: "${d.note}"` : '  reviewer gave no reason',
      ].join('\n');
    }).join('\n\n');

    const catalogue = offers
      .map((o) => `- ${o.id} — ${o.name} (${o.commitment}): ${o.one_line}`)
      .join('\n');

    const alreadyRuled = [...knownKeys.keys()].length;

    // 2. PROPOSE
    const proposal = await callLLMValidated(
      {
        pool, tenantId, runId,
        system: await loadPrompt(pool, 'research-skill.fit_lessons', tenantId),
        messages: [{
          role: 'user',
          content: `OUR OFFERS:\n${catalogue}\n\n`
            + `DECISIONS (${rows.length}, most recent first):\n\n${history}`,
        }],
        maxTokens: 1_500,
      },
      ProposalSchema,
    );

    // 3. DEDUPE + VERIFY
    const companies = new Set(rows.map((r) => r.company.toLowerCase()));
    const candidates: {
      lesson: string; kind: LessonKind; applies_to: string | null;
      evidence: { company: string; decision: string; note: string | null; offer: string | null }[];
      key: string;
    }[] = [];

    let invented = 0;
    let duplicates = 0;

    for (const p of proposal.lessons ?? []) {
      const text = String(p.lesson ?? '').trim();
      // A one-clause "rule" is a mood, not something a brief can be tested
      // against.
      if (text.length < 20) continue;

      const key = lessonKey(text);
      if (knownKeys.has(key)) { duplicates++; continue; }
      if (candidates.some((c) => c.key === key)) { duplicates++; continue; }

      // The evidence gate. A rule citing companies that were never decided on
      // was inferred from nothing we can show the reviewer.
      const cited = (p.from_companies ?? [])
        .map((c) => String(c).trim())
        .filter((c) => companies.has(c.toLowerCase()));
      if (cited.length === 0) { invented++; continue; }

      const evidence = cited.map((name) => {
        const row = rows.find((r) => r.company.toLowerCase() === name.toLowerCase())!;
        return {
          company: row.company,
          decision: row.decision,
          note: row.note,
          offer: row.human_offer ?? row.agent_offer,
        };
      });

      const appliesTo = p.applies_to && validOffers.has(p.applies_to) ? p.applies_to : null;

      candidates.push({
        lesson: text,
        kind: isLessonKind(p.kind) ? p.kind : 'preference',
        applies_to: appliesTo,
        evidence,
        key,
      });
    }

    await appendStep(pool, runId, {
      step_name: 'propose_lessons',
      action: `Inferred rules from ${rows.length} decision(s)`,
      output_summary: `${candidates.length} new proposal(s)`
        + (duplicates > 0 ? ` · ${duplicates} already ruled on` : '')
        + (invented > 0
          ? ` · ${invented} dropped — cited companies you never decided on`
          : ''),
      status: invented > 0 ? 'error' : 'ok',
    });

    // 4. WRITE
    for (const c of candidates) {
      await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO gt_fit_lessons
             (tenant_id, is_live, lesson, kind, applies_to, evidence,
              lesson_key, run_id, status)
           VALUES
             ($tenant_id, $is_live, $lesson, $kind, $applies_to, $evidence::jsonb,
              $lesson_key, $run_id, 'proposed')
           -- A proposal that reappears on a later run keeps its id and its
           -- place in the queue; only the evidence behind it grows.
           ON CONFLICT (tenant_id, is_live, lesson_key) DO UPDATE SET
              evidence   = EXCLUDED.evidence,
              updated_at = now()
            WHERE gt_fit_lessons.status = 'proposed'`,
          {
            tenant_id: tenantId, is_live: isLive,
            lesson: c.lesson, kind: c.kind, applies_to: c.applies_to,
            evidence: JSON.stringify(c.evidence),
            lesson_key: c.key, run_id: Number(runId),
          },
        );
      });
    }

    await setStatus(pool, runId, 'completed', {
      output: {
        proposed: candidates.length,
        decisions: rows.length,
        already_ruled_on: alreadyRuled,
        dropped_unevidenced: invented,
        message: candidates.length === 0
          ? 'Nothing new to propose — your decisions are already covered by the '
            + 'rules you have accepted or rejected.'
          : `${candidates.length} rule(s) proposed. None of them affects scoring `
            + 'until you accept it.',
      },
    });
  }
}

export { LESSON_KINDS };
