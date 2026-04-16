/**
 * KI: get_asset_types — Returns all active asset types for the Add Investment form.
 * Global table (no tenant filter) — same for all tenants.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface AssetTypeRow {
  id:                      number;
  asset_type_code:         string;
  asset_type_name:         string;
  category:                string;
  default_assumption_rate: string;
  display_order:           number;
  description:             string | null;
}

export interface AssetTypeItem {
  id:                      number;
  asset_type_code:         string;
  asset_type_name:         string;
  category:                string;
  default_assumption_rate: number;
  display_order:           number;
  description:             string | null;
}

interface GetAssetTypesResult {
  asset_types: AssetTypeItem[];
  recipe: 'asset-types';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/get-asset-types.sql'),
  'utf-8'
);

export async function get_asset_types(
  _params: Record<string, unknown>,
  ctx: SkillContext
): Promise<GetAssetTypesResult> {
  const result = await ctx.db.query<AssetTypeRow>(QUERY, {});

  return {
    asset_types: result.rows.map(r => ({
      id:                      r.id,
      asset_type_code:         r.asset_type_code,
      asset_type_name:         r.asset_type_name,
      category:                r.category,
      default_assumption_rate: Number(r.default_assumption_rate),
      display_order:           r.display_order,
      description:             r.description,
    })),
    recipe: 'asset-types',
  };
}
