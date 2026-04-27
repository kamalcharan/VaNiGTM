/**
 * icp-skill: get_personas
 * List all personas for a campaign, ordered by sort_order.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_PERSONAS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-personas.sql'), 'utf-8'
);

interface GetPersonasParams {
  campaign_id: number;
}

interface PersonaListItem {
  id: number;
  title: string;
  emoji: string;
  description: string | null;
  tags: string[];
  company_size_min: number | null;
  company_size_max: number | null;
  seniority_level: string | null;
  sort_order: number;
  signal_count: number;
  created_at: string;
}

interface GetPersonasResult {
  personas: PersonaListItem[];
  recipe: 'persona-list';
}

export async function get_personas(
  params: GetPersonasParams,
  ctx: SkillContext
): Promise<GetPersonasResult> {
  if (!params.campaign_id) {
    throw new Error('campaign_id is required');
  }

  const res = await ctx.db.query<PersonaListItem>(GET_PERSONAS_SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id,
  });

  return { personas: res.rows, recipe: 'persona-list' };
}
