/**
 * client-skill: add_bookmark
 * Add or update a bookmark for a client (user-scoped UPSERT).
 * Either reason_id or custom_reason must be provided.
 */

import { SkillContext } from '../../../shared/types';

interface AddBookmarkParams {
  client_id: number;
  reason_id?: number;
  custom_reason?: string;
  notes?: string;
}

interface AddBookmarkResult {
  bookmark: {
    id: number;
    client_id: number;
    reason_id: number | null;
    custom_reason: string | null;
    notes: string | null;
  };
  recipe: 'inline-item';
}

export async function add_bookmark(
  params: AddBookmarkParams,
  ctx: SkillContext
): Promise<AddBookmarkResult> {
  const { client_id, reason_id, custom_reason, notes } = params;

  if (!reason_id && !custom_reason?.trim()) {
    throw new Error('Either reason_id or custom_reason is required');
  }

  // Verify client belongs to this tenant
  const clientCheck = await ctx.db.query<{ id: number }>(
    `SELECT id FROM ki_clients WHERE id = $client_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true`,
    { $client_id: client_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );
  if (!clientCheck.rows[0]) {
    throw new Error(`Client ${client_id} not found`);
  }

  const res = await ctx.db.query<{
    id: number; client_id: number; reason_id: number | null;
    custom_reason: string | null; notes: string | null;
  }>(
    `INSERT INTO ki_client_bookmarks
       (client_id, tenant_id, is_live, user_id, reason_id, custom_reason, notes)
     VALUES ($client_id, $tenant_id, $is_live, $user_id, $reason_id, $custom_reason, $notes)
     ON CONFLICT (tenant_id, is_live, client_id, user_id) DO UPDATE SET
       reason_id     = COALESCE(EXCLUDED.reason_id, ki_client_bookmarks.reason_id),
       custom_reason = COALESCE(EXCLUDED.custom_reason, ki_client_bookmarks.custom_reason),
       notes         = COALESCE(EXCLUDED.notes, ki_client_bookmarks.notes),
       is_active     = true,
       updated_at    = now()
     RETURNING id, client_id, reason_id, custom_reason, notes`,
    {
      $client_id:    client_id,
      $tenant_id:    ctx.tenant_id,
      $is_live:      ctx.is_live,
      $user_id:      ctx.user_id,
      $reason_id:    reason_id ?? null,
      $custom_reason: custom_reason?.trim() ?? null,
      $notes:        notes?.trim() ?? null,
    }
  );

  return { bookmark: res.rows[0], recipe: 'inline-item' };
}
