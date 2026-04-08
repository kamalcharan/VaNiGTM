/**
 * contact-skill: get_snapshot
 * Get the skimmed financial snapshot for a contact.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_SNAPSHOT_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-snapshot.sql'), 'utf-8'
);

interface GetSnapshotParams {
  contact_id: number;
}

interface GetSnapshotResult {
  snapshot: Record<string, unknown> | null;
  recipe: 'snapshot-view';
}

export async function get_snapshot(
  params: GetSnapshotParams,
  ctx: SkillContext
): Promise<GetSnapshotResult> {
  const res = await ctx.db.query(GET_SNAPSHOT_SQL, {
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
    $contact_id: params.contact_id,
  });

  return {
    snapshot: res.rows[0] ?? null,
    recipe:   'snapshot-view',
  };
}
