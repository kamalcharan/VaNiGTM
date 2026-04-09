/**
 * contact-skill: get_liability_types
 * Returns global liability type master data for dropdown population.
 * No tenant filter — shared reference data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_LIABILITY_TYPES_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-liability-types.sql'), 'utf-8'
);

export async function get_liability_types(
  _params: Record<string, never>,
  _ctx: SkillContext
): Promise<{ liability_types: Record<string, unknown>[]; recipe: 'master-data' }> {
  const res = await _ctx.db.query(GET_LIABILITY_TYPES_SQL, {});
  return { liability_types: res.rows, recipe: 'master-data' };
}
