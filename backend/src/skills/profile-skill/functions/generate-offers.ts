/**
 * profile-skill: generate_offers — draft 1–3 offers from the profile and the
 * cached ingestion text (no re-crawl), as a visible agent run. Drafts land
 * unconfirmed; only confirm_offer counts one toward the score.
 */
import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db';
import { createRun, setStatus } from '../../../agent-core/agent.runner';
import { generateOfferDrafts } from '../offer-draft.service';

export async function generate_offers(_params: Record<string, unknown>, ctx: SkillContext) {
  const pool = getPool();
  const runId = await createRun(pool, ctx.tenant_id, 'profile-skill.offers.generate');
  try {
    await setStatus(pool, runId, 'running');
    const drafted = await generateOfferDrafts(pool, ctx.tenant_id, runId);
    await setStatus(pool, runId, 'completed');
    return { drafted, run_id: runId, recipe: 'offer-list' };
  } catch (err) {
    await setStatus(pool, runId, 'failed', { error_trace: err instanceof Error ? err.message : String(err) }).catch(() => {});
    throw err;
  }
}
