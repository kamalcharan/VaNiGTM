/**
 * icp-skill: create_persona
 * Create a new persona for a campaign. All writes in a single transaction.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const INSERT_PERSONA_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-persona.sql'), 'utf-8'
);

const VALID_SENIORITY = ['c-suite', 'vp', 'director', 'manager', 'individual-contributor'] as const;

interface CreatePersonaParams {
  campaign_id: number;
  title: string;
  emoji?: string;
  description?: string;
  tags?: string[];
  company_size_min?: number;
  company_size_max?: number;
  seniority_level?: string;
}

interface CreatePersonaResult {
  persona: {
    id: number;
    title: string;
    emoji: string;
    tags: string[];
    sort_order: number;
    created_at: string;
  };
  recipe: 'persona-card';
}

export async function create_persona(
  params: CreatePersonaParams,
  ctx: SkillContext
): Promise<CreatePersonaResult> {
  if (!params.campaign_id) throw new Error('campaign_id is required');
  if (!params.title?.trim()) throw new Error('Persona title is required');

  if (params.seniority_level && !VALID_SENIORITY.includes(params.seniority_level as typeof VALID_SENIORITY[number])) {
    throw new Error(`Invalid seniority_level. Must be one of: ${VALID_SENIORITY.join(', ')}`);
  }

  const result = await ctx.db.transaction(async (tx) => {
    // Verify campaign exists and belongs to tenant
    const check = await tx.query<{ id: number }>(
      `SELECT id FROM gt_campaigns
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $campaign_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $campaign_id: params.campaign_id }
    );
    if (!check.rows[0]) throw new Error('Campaign not found');

    const res = await tx.query<{
      id: number; title: string; emoji: string; tags: string[]; sort_order: number; created_at: string;
    }>(INSERT_PERSONA_SQL, {
      $campaign_id:      params.campaign_id,
      $tenant_id:        ctx.tenant_id,
      $is_live:          ctx.is_live,
      $title:            params.title.trim(),
      $emoji:            params.emoji || '👤',
      $description:      params.description?.trim() || null,
      $tags:             JSON.stringify(params.tags ?? []),
      $company_size_min: params.company_size_min ?? null,
      $company_size_max: params.company_size_max ?? null,
      $seniority_level:  params.seniority_level || null,
    });

    return res.rows[0];
  });

  return { persona: result, recipe: 'persona-card' };
}
