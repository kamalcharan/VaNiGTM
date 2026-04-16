/**
 * KI: delete_asset_assignment — Soft-delete an investment plan.
 *
 * Sets is_active = false. The record is retained for historical tracking
 * and can be restored manually if needed. Portfolio history is unaffected.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface DeleteParams {
  assignment_id: number;
  client_id:     number;
}

interface DeleteResult {
  assignment_id: number;
  recipe: 'asset-assignment-deleted';
}

interface ReturnRow {
  assignment_id: number;
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/delete-asset-assignment.sql'),
  'utf-8'
);

export async function delete_asset_assignment(
  params: DeleteParams,
  ctx: SkillContext
): Promise<DeleteResult> {
  const { assignment_id, client_id } = params;

  let result!: { rows: ReturnRow[] };

  await ctx.db.transaction(async (tx) => {
    result = await tx.query<ReturnRow>(QUERY, {
      $assignment_id: assignment_id,
      $tenant_id:     ctx.tenant_id,
      $is_live:       ctx.is_live,
      $client_id:     client_id,
    });
  });

  const row = result.rows[0];
  if (!row) {
    throw new Error('Asset assignment not found or access denied');
  }

  return {
    assignment_id: row.assignment_id,
    recipe: 'asset-assignment-deleted',
  };
}
