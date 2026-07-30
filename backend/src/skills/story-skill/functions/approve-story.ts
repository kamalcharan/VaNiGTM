/**
 * story-skill: approve_story
 *
 * The hard gate. The story becomes `approved`, is signed with the
 * approver, and the journey moves to `ready`.
 *
 * ── WHAT APPROVAL ACTUALLY CHECKS ─────────────────────────────────────
 *
 * R-S1 — every claim traces to evidence. Re-run at approval time (not at
 * draft) because the body may have been edited between drafts, and R-S1
 * is a rule about the text that GOES OUT, not the text that was first
 * saved. If the trace fails, approval is refused.
 *
 * R-S2 — cannot repeat an earlier story on the same journey. Same reason:
 * it must be checked against the current body of every earlier story, at
 * the moment approval is asked for.
 *
 * R-S3 — the human approves the text. There is no auto-approve flag on
 * this function. Approval is what the reviewer's click IS.
 *
 * ── WHY THE JOURNEY MOVES IN THE SAME TRANSACTION ─────────────────────
 *
 * A story approved with no journey move would leave the ledger saying
 * `addressed` while a real approval sat behind it, and the campaign run
 * would then not find a ready journey to carry it. Same discipline as
 * every other move: both writes commit, or neither does.
 *
 * `moveIfAt(['addressed', 'ready'])` — from `ready` the approval is a
 * no-op on the journey (a second approved story on an already-ready
 * account is normal), from `addressed` it advances, from anywhere else
 * it refuses.
 */

import { SkillContext } from '../../../shared/types';
import { traceStory, tooSimilar } from '../trace';
import { briefEvidenceFor, earlierStoriesFor } from '../story.service';
import { moveIfAt, findJourney } from '../../journey-skill/journey.service';

interface ApproveStoryParams {
  story_id: number;
  /** Override the R-S2 similarity check. Requires a reason, and the reason
   *  is written onto the row — a bypass that leaves no trace is a bypass
   *  people take without thinking. */
  allow_similar?: boolean;
  override_note?: string;
}

export async function approve_story(params: ApproveStoryParams, ctx: SkillContext) {
  const storyId = Number(params.story_id);
  if (!Number.isFinite(storyId)) throw new Error('story_id is required');

  return ctx.db.transaction(async (tx) => {
    // The story must be ours AND a draft. tenant_id in the WHERE is the
    // authorisation; status filters guarantee this is not a re-approval
    // of a story that already went out.
    const row = await tx.query<{
      id: string; journey_id: string; seq: number;
      subject: string | null; body: string; kind_key: string;
    }>(
      `SELECT id::text, journey_id::text, seq, subject, body, kind_key
         FROM gt_journey_stories
        WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live
          AND status = 'draft'
        FOR UPDATE`,
      { id: storyId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (!row.rows[0]) throw new Error('No draft story with that id.');
    const story = row.rows[0];
    const journeyId = Number(story.journey_id);

    // Re-fetch evidence and earlier stories. Both are computed against the
    // world as it is NOW, not as it was when the draft was saved.
    const scope = { tenant_id: ctx.tenant_id, is_live: ctx.is_live };
    const bev = await briefEvidenceFor(tx, scope, journeyId);
    if (!bev) throw new Error('The journey has vanished.');
    const trace = traceStory(story.subject, story.body, bev.evidence);

    if (!trace.ok) {
      // R-S1 with teeth. The reason is passed through so the reviewer's
      // UI can point at the sentence that failed — the trace already lists
      // it verdict-by-verdict.
      throw new Error(`R-S1 refuses this story: ${trace.reason}`);
    }

    const earlier = await earlierStoriesFor(tx, scope, journeyId, storyId);
    const repeat = tooSimilar(story.body, earlier);
    if (repeat && !params.allow_similar) {
      throw new Error(
        `R-S2 refuses this story: it is ${Math.round(repeat.sim * 100)}% similar to `
        + `story ${repeat.against + 1} on the same journey. Pick a different angle, `
        + 'or pass allow_similar with a reason if this repetition is intentional.',
      );
    }
    const override = repeat && params.allow_similar
      ? `Override — approved despite ${Math.round(repeat.sim * 100)}% similarity to story ${repeat.against + 1}. `
        + `Reason: ${String(params.override_note ?? '').trim() || '(no reason given)'}`
      : null;

    // Approve. evidence_refs is REFRESHED at approval time — a draft
    // saved before an evidence edit could have cited a URL that has
    // since changed, and the row that goes out should carry the URLs
    // the approver actually saw.
    const upd = await tx.query<{ id: string }>(
      `UPDATE gt_journey_stories
          SET status = 'approved',
              approved_by = $user_id::uuid,
              approved_at = now(),
              evidence_refs = $refs::text[],
              notes = COALESCE(NULLIF($notes, ''), notes),
              updated_at = now()
        WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live
        RETURNING id::text`,
      {
        id: storyId, user_id: ctx.user_id,
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        refs: trace.evidence_refs,
        notes: override ?? '',
      },
    );

    // Move the journey. moveIfAt: from addressed it advances, from ready
    // it is a no-op (a second approved story is normal), from anywhere
    // else it refuses.
    //
    // Fetch the CURRENT state after the move so the response says the
    // truth — a null journey from moveIfAt means "already there", and the
    // caller wants "ready", not null, in that case.
    const before = await findJourney(tx, scope, bev.prospect_id);
    const journey = await moveIfAt(
      tx, scope, bev.prospect_id, ['addressed', 'ready'], 'ready',
      {
        actor: 'human',
        actor_id: ctx.user_id,
        incrementStories: true,
        payload: {
          story_id: storyId, seq: story.seq, kind_key: story.kind_key,
          ...(override ? { override } : {}),
        },
      },
    );

    // Count the story regardless of whether the state changed — story 3
    // on a journey already at ready still bumps story_count.
    if (!journey && before?.state === 'ready') {
      await tx.query(
        `UPDATE gt_journeys SET story_count = story_count + 1, updated_at = now()
          WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live`,
        { id: before.id, tenant_id: ctx.tenant_id, is_live: ctx.is_live });
    }

    return {
      story_id: Number(upd.rows[0].id),
      seq: story.seq,
      journey_state: journey?.state ?? before?.state ?? null,
      journey_moved: journey !== null,
      override,
      trace,
      recipe: 'story-detail' as const,
    };
  });
}
