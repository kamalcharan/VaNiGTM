/**
 * client-skill: remove_bookmark
 * Soft-delete the requesting user's bookmark on a client.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const REMOVE_BOOKMARK_SQL = fs.readFileSync(path.join(__dirname, '../queries/remove-bookmark.sql'), 'utf-8');

interface RemoveBookmarkParams {
  client_id: number;
}

interface RemoveBookmarkResult {
  removed: true;
  client_id: number;
  recipe: 'confirmation';
}

export async function remove_bookmark(
  params: RemoveBookmarkParams,
  ctx: SkillContext
): Promise<RemoveBookmarkResult> {
  const { client_id } = params;

  const res = await ctx.db.query<{ id: number }>(REMOVE_BOOKMARK_SQL, {
    $client_id: client_id,
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $user_id:   ctx.user_id,
  });

  if (!res.rows[0]) {
    throw new Error(`No active bookmark found for client ${client_id}`);
  }

  return { removed: true, client_id, recipe: 'confirmation' };
}
