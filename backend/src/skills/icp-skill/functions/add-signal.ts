/**
 * icp-skill: add_signal
 * Add a buying signal to a persona.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const INSERT_SIGNAL_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-signal.sql'), 'utf-8'
);

const VALID_SIGNAL_TYPES = ['behavior', 'firmographic', 'technographic', 'intent'] as const;

interface AddSignalParams {
  persona_id: number;
  signal_type: string;
  label: string;
  description?: string;
  weight?: number;
}

interface AddSignalResult {
  signal: {
    id: number;
    signal_type: string;
    label: string;
    weight: number;
    created_at: string;
  };
  recipe: 'inline-item';
}

export async function add_signal(
  params: AddSignalParams,
  ctx: SkillContext
): Promise<AddSignalResult> {
  if (!params.persona_id) throw new Error('persona_id is required');
  if (!params.label?.trim()) throw new Error('Signal label is required');

  if (!VALID_SIGNAL_TYPES.includes(params.signal_type as typeof VALID_SIGNAL_TYPES[number])) {
    throw new Error(`Invalid signal_type. Must be one of: ${VALID_SIGNAL_TYPES.join(', ')}`);
  }

  const weight = params.weight ?? 1;
  if (weight < 1 || weight > 10) {
    throw new Error('Weight must be between 1 and 10');
  }

  const result = await ctx.db.transaction(async (tx) => {
    // Verify persona exists
    const check = await tx.query<{ id: number }>(
      `SELECT id FROM gt_personas
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $persona_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $persona_id: params.persona_id }
    );
    if (!check.rows[0]) throw new Error('Persona not found');

    const res = await tx.query<{
      id: number; signal_type: string; label: string; weight: number; created_at: string;
    }>(INSERT_SIGNAL_SQL, {
      $persona_id:   params.persona_id,
      $tenant_id:    ctx.tenant_id,
      $is_live:      ctx.is_live,
      $signal_type:  params.signal_type,
      $label:        params.label.trim(),
      $description:  params.description?.trim() || null,
      $weight:       weight,
    });

    return res.rows[0];
  });

  return { signal: result, recipe: 'inline-item' };
}
