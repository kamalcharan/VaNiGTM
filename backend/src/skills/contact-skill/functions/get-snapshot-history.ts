/**
 * contact-skill: get_snapshot_history
 * List all snapshot versions for a contact, newest first.
 * Used by the history view in the snapshot tab.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_HISTORY_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-snapshot-history.sql'), 'utf-8'
);

interface GetSnapshotHistoryParams {
  contact_id: number;
}

export async function get_snapshot_history(
  params: GetSnapshotHistoryParams,
  ctx: SkillContext
): Promise<{ history: Record<string, unknown>[]; recipe: 'snapshot-history' }> {
  const res = await ctx.db.query(GET_HISTORY_SQL, {
    $tenant_id:  ctx.tenant_id,
    $contact_id: params.contact_id,
    $is_live:    ctx.is_live,
  });

  return { history: res.rows, recipe: 'snapshot-history' };
}
