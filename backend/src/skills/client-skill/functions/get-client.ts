/**
 * client-skill: get_client
 * Single client with full profile — channels, addresses, family, bookmark.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CLIENT_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-client.sql'), 'utf-8'
);

interface GetClientParams {
  client_id: number;
}

interface GetClientResult {
  client: Record<string, unknown> | null;
  recipe: 'client-profile';
}

export async function get_client(
  params: GetClientParams,
  ctx: SkillContext
): Promise<GetClientResult> {
  const res = await ctx.db.query(GET_CLIENT_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $client_id: params.client_id,
    $user_id:   ctx.user_id,
  });

  return {
    client: res.rows[0] ?? null,
    recipe: 'client-profile',
  };
}
