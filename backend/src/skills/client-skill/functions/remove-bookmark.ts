/**
 * client-skill: remove_bookmark
 * Soft-delete the requesting user's bookmark on a client.
 */

import { SkillContext } from '../../../shared/types';

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

  const res = await ctx.db.query<{ id: number }>(
    `UPDATE ki_client_bookmarks
     SET is_active = false, updated_at = now()
     WHERE client_id = $client_id AND tenant_id = $tenant_id
       AND is_live = $is_live AND user_id = $user_id AND is_active = true
     RETURNING id`,
    { $client_id: client_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $user_id: ctx.user_id }
  );

  if (!res.rows[0]) {
    throw new Error(`No active bookmark found for client ${client_id}`);
  }

  return { removed: true, client_id, recipe: 'confirmation' };
}
