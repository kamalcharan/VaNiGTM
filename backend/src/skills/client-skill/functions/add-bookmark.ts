/**
 * client-skill: add_bookmark
 * Add or update a bookmark for a client (user-scoped UPSERT).
 * Either reason_id or custom_reason must be provided.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const CHECK_CLIENT_SQL  = fs.readFileSync(path.join(__dirname, '../queries/check-client.sql'),  'utf-8');
const UPSERT_BOOKMARK_SQL = fs.readFileSync(path.join(__dirname, '../queries/upsert-bookmark.sql'), 'utf-8');

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
  const clientCheck = await ctx.db.query<{ id: number }>(CHECK_CLIENT_SQL, {
    $client_id: client_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
  });
  if (!clientCheck.rows[0]) {
    throw new Error(`Client ${client_id} not found`);
  }

  const res = await ctx.db.query<{
    id: number; client_id: number; reason_id: number | null;
    custom_reason: string | null; notes: string | null;
  }>(UPSERT_BOOKMARK_SQL, {
    $client_id:     client_id,
    $tenant_id:     ctx.tenant_id,
    $is_live:       ctx.is_live,
    $user_id:       ctx.user_id,
    $reason_id:     reason_id ?? null,
    $custom_reason: custom_reason?.trim() ?? null,
    $notes:         notes?.trim() ?? null,
  });

  return { bookmark: res.rows[0], recipe: 'inline-item' };
}
