/**
 * contact-skill: get_asset_types
 * Returns global asset type master data for dropdown population.
 * No tenant filter — shared reference data.
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
