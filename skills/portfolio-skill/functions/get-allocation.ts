/**
 * KI-25: get_allocation — Returns asset allocation breakdown by category.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface AllocationRow {
  category: string;
  value: number;
  percentage: number;
  scheme_count: number;
}

interface AllocationItem {
  category: string;
  value: number;
  percentage: number;
  scheme_count: number;
}

interface GetAllocationResult {
  allocation: AllocationItem[];
  total_value: number;
  recipe: 'allocation-ring';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/allocation-breakdown.sql'),
  'utf-8'
);

export async function get_allocation(
  params: { client_id: number },
  ctx: SkillContext
): Promise<GetAllocationResult> {
  const { client_id } = params;

  const result = await ctx.db.query<AllocationRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
  });

  const allocation: AllocationItem[] = result.rows.map((r) => ({
    category: r.category,
    value: Number(r.value),
    percentage: Number(r.percentage),
    scheme_count: Number(r.scheme_count),
  }));

  const total_value = allocation.reduce((sum, a) => sum + a.value, 0);

  return {
    allocation,
    total_value,
    recipe: 'allocation-ring',
  };
}
