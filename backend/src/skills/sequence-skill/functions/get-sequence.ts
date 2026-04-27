/**
 * sequence-skill: get_sequence
 * Single sequence with all steps and templates.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SEQ_SQL   = fs.readFileSync(path.join(__dirname, '../queries/get-sequence.sql'), 'utf-8');
const STEPS_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-steps.sql'), 'utf-8');

export async function get_sequence(params: { sequence_id: number }, ctx: SkillContext) {
  if (!params.sequence_id) throw new Error('sequence_id is required');

  const qp = { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $sequence_id: params.sequence_id };

  const [seqRes, stepsRes] = await Promise.all([
    ctx.db.query(SEQ_SQL, qp),
    ctx.db.query(STEPS_SQL, qp),
  ]);

  if (!seqRes.rows[0]) throw new Error('Sequence not found');

  return {
    sequence: { ...seqRes.rows[0], steps: stepsRes.rows },
    recipe: 'sequence-detail' as const,
  };
}
