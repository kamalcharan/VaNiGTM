/**
 * campaign-skill: update_status
 * Transition campaign lifecycle status.
 * Valid transitions: draft→active, active→paused, paused→active, active→completed, completed→archived.
 */

import { SkillContext } from '../../../shared/types';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:     ['active'],
  active:    ['paused', 'completed'],
  paused:    ['active'],
  completed: ['archived'],
};

interface UpdateStatusParams {
  campaign_id: number;
  status: string;
}

interface UpdateStatusResult {
  campaign: {
    id: number;
    campaign_no: string;
    status: string;
    launched_at: string | null;
    completed_at: string | null;
  };
  recipe: 'campaign-card';
}

export async function update_status(
  params: UpdateStatusParams,
  ctx: SkillContext
): Promise<UpdateStatusResult> {
  if (!params.campaign_id) throw new Error('campaign_id is required');
  if (!params.status) throw new Error('status is required');

  const result = await ctx.db.transaction(async (tx) => {
    const check = await tx.query<{ id: number; campaign_no: string; status: string }>(
      `SELECT id, campaign_no, status FROM gt_campaigns
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $campaign_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $campaign_id: params.campaign_id }
    );

    if (!check.rows[0]) throw new Error('Campaign not found');

    const current = check.rows[0].status;
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(params.status)) {
      throw new Error(`Cannot transition from "${current}" to "${params.status}". Allowed: ${(allowed || []).join(', ') || 'none'}`);
    }

    // Set timestamps for key transitions
    const extras: string[] = [];
    if (params.status === 'active' && current === 'draft') {
      extras.push('launched_at = now()');
    }
    if (params.status === 'completed') {
      extras.push('completed_at = now()');
    }

    const setClauses = [`status = $status`, 'updated_at = now()', ...extras].join(', ');

    const res = await tx.query<{
      id: number; campaign_no: string; status: string; launched_at: string | null; completed_at: string | null;
    }>(
      `UPDATE gt_campaigns SET ${setClauses}
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $campaign_id
       RETURNING id, campaign_no, status, launched_at, completed_at`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $campaign_id: params.campaign_id, $status: params.status }
    );

    return res.rows[0];
  });

  return { campaign: result, recipe: 'campaign-card' };
}
