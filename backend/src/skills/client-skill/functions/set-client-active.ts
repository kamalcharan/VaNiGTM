/**
 * client-skill: set_client_active
 * Activate or deactivate a client (soft toggle on is_active).
 *
 * Business rules:
 * - Deactivating a client does NOT touch the linked contact.
 *   The contact layer enforces its own rule: a contact with an active
 *   client cannot be deactivated until the client is deactivated first.
 * - is_active != $is_active guard in SQL makes the operation idempotent —
 *   0 rows returned means client is already in the requested state.
 * - tenant_id + is_live come from ctx (never from request body).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SET_CLIENT_ACTIVE_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/set-client-active.sql'),
  'utf-8'
);

interface SetClientActiveParams {
  client_id: number;
  /** true = activate, false = deactivate */
  is_active: boolean;
}

interface SetClientActiveResult {
  client: {
    id: number;
    is_active: boolean;
    updated_at: string;
  };
  recipe: 'confirmation';
}

export async function set_client_active(
  params: SetClientActiveParams,
  ctx: SkillContext
): Promise<SetClientActiveResult> {
  const { client_id, is_active } = params;

  if (typeof client_id !== 'number' || !Number.isInteger(client_id) || client_id < 1) {
    throw new Error('client_id must be a positive integer');
  }
  if (typeof is_active !== 'boolean') {
    throw new Error('is_active must be a boolean');
  }

  const res = await ctx.db.transaction(async (client) => {
    return client.query<{ id: number; is_active: boolean; updated_at: string }>(
      SET_CLIENT_ACTIVE_SQL,
      {
        $client_id: client_id,
        $tenant_id: ctx.tenant_id,
        $is_live:   ctx.is_live,
        $is_active: is_active,
      }
    );
  });

  if (!res.rows[0]) {
    // 0 rows: either client not found / wrong tenant, or already in target state
    const action = is_active ? 'activate' : 'deactivate';
    throw new Error(
      `Cannot ${action} client ${client_id} — client not found or already ${is_active ? 'active' : 'inactive'}`
    );
  }

  return { client: res.rows[0], recipe: 'confirmation' };
}
