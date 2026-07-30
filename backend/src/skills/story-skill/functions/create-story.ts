/**
 * story-skill: create_story
 *
 * Write a new story on a journey. Draft status; human-written; deliberately
 * no LLM in the Phase-3 build.
 *
 * seq is assigned server-side. The next number is claimed atomically inside
 * the transaction so two reviewers in two tabs cannot both write "story 1"
 * for the same journey — the unique index would catch it, but the writer
 * should not race the database.
 *
 * The response INCLUDES the trace verdict against R-S1 and the R-S2
 * similarity to earlier stories, even though this is a draft — the compose
 * screen asks for this as-you-type, and the same function serves both draft
 * and "check what you have" without a second endpoint.
 */

import { SkillContext } from '../../../shared/types';
import { traceStory, tooSimilar } from '../trace';
import { briefEvidenceFor, earlierStoriesFor, kindExists } from '../story.service';

interface CreateStoryParams {
  journey_id: number;
  body: string;
  subject?: string;
  kind_key?: string;
  offer?: string;
  asset_ids?: number[];
}

export async function create_story(params: CreateStoryParams, ctx: SkillContext) {
  const journeyId = Number(params.journey_id);
  if (!Number.isFinite(journeyId)) throw new Error('journey_id is required');

  const body = String(params.body ?? '').trim();
  if (body.length < 20) {
    // Twenty characters is not a length policy, it is the minimum needed
    // to say anything at all — below that R-S1 is judging noise, and the
    // reviewer is better served by an honest error than a mysterious pass.
    throw new Error('body is too short to be a story yet.');
  }
  const subject = String(params.subject ?? '').trim() || null;
  const kindKey = String(params.kind_key ?? 'email').trim();

  const scope = { tenant_id: ctx.tenant_id, is_live: ctx.is_live };

  return ctx.db.transaction(async (tx) => {
    if (!(await kindExists(tx, scope, kindKey))) {
      throw new Error(`No such content kind: "${kindKey}". See list_kinds.`);
    }

    // The journey must be ours. tenant_id in the WHERE is the authorisation.
    // SELECT FOR UPDATE takes a row lock — the seq assignment below reads
    // MAX(seq) and writes MAX+1, and without this lock two BEGINs would
    // both see the same MAX and both write the same seq. The unique index
    // would catch it and one caller would get a violation, but making the
    // writers serial per journey is cheaper and clearer.
    const lock = await tx.query<{ id: string }>(
      `SELECT id::text FROM gt_journeys
        WHERE id = $journey_id AND tenant_id = $tenant_id AND is_live = $is_live
        FOR UPDATE`,
      { journey_id: journeyId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (!lock.rows[0]) throw new Error('No such journey.');

    const bev = await briefEvidenceFor(tx, scope, journeyId);
    if (!bev) throw new Error('No such journey.');
    if (bev.evidence.length === 0) {
      // R-S1 without a brief has nothing to check against. Refuse rather
      // than let a story through unchecked — the whole point of research
      // was so a story could be evidenced. Say WHY, not just that it failed.
      throw new Error(
        'This journey carries no evidence yet. Research the company first; '
        + 'a story with nothing to trace to is a template with a name on it.',
      );
    }

    const trace = traceStory(subject, body, bev.evidence);
    const earlier = await earlierStoriesFor(tx, scope, journeyId);
    const repeat = tooSimilar(body, earlier);

    // Claim the next seq atomically. Same pattern as gt_next_seq — READ the
    // max inside the transaction that will INSERT, so two writers cannot
    // both read 2 and both try to write 3.
    const nextSeq = await tx.query<{ n: number }>(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM gt_journey_stories
        WHERE journey_id = $journey_id AND tenant_id = $tenant_id AND is_live = $is_live`,
      { journey_id: journeyId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    const seq = Number(nextSeq.rows[0].n);

    const ins = await tx.query<{ id: string; seq: number }>(
      `INSERT INTO gt_journey_stories
         (tenant_id, is_live, journey_id, seq, kind_key, author, author_id,
          offer, subject, body, evidence_refs, asset_ids, status, created_by)
       VALUES
         ($tenant_id, $is_live, $journey_id, $seq, $kind_key, 'human',
          $author_id::uuid, $offer, $subject, $body,
          $refs::text[], $assets::bigint[], 'draft', $author_id::uuid)
       RETURNING id::text, seq`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        journey_id: journeyId, seq, kind_key: kindKey,
        author_id: ctx.user_id,
        offer: String(params.offer ?? '').trim() || bev.offer,
        subject, body,
        // evidence_refs is what the trace ACTUALLY cited — not a
        // caller-provided list. The reviewer's approval later re-runs the
        // trace, so this stays a snapshot of the moment.
        refs: trace.evidence_refs,
        assets: Array.isArray(params.asset_ids) ? params.asset_ids : [],
      },
    );

    return {
      story_id: Number(ins.rows[0].id),
      journey_id: journeyId,
      seq: Number(ins.rows[0].seq),
      status: 'draft',
      trace,
      // R-S2 as advice, not enforcement — a draft that repeats earlier
      // work should be visible to the writer, but the approval gate is
      // where it becomes fatal.
      repeats_earlier: repeat ? { similarity: Number(repeat.sim.toFixed(2)), against_seq: repeat.against + 1 } : null,
      recipe: 'story-detail' as const,
    };
  });
}
