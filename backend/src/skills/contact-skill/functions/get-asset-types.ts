/**
 * contact-skill: get_asset_types
 * Returns global asset type master data for dropdown population.
 * No tenant filter — shared reference data.
 * [2026-04-10: query now uses is_liquid_default column (migration 023); FD set liquid by migration 026]
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_ASSET_TYPES_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-asset-types.sql'), 'utf-8'
);

export async function get_asset_types(
  _params: Record<string, never>,
  _ctx: SkillContext
): Promise<{ asset_types: Record<string, unknown>[]; recipe: 'master-data' }> {
  const res = await _ctx.db.query(GET_ASSET_TYPES_SQL, {});
  return { asset_types: res.rows, recipe: 'master-data' };
}
