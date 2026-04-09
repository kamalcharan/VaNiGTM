/**
 * contact-skill: generate_intake_token
 *
 * Creates a signed intake link for a contact (Flow 1) or a generic
 * tenant-level link (Flow 2 — contact_id omitted).
 *
 * Returns the token and the full intake URL.
 * Token is valid for 5 days. Only one active token per contact is
 * enforced in application logic (old tokens are not revoked — they
 * expire naturally; MFD can generate a fresh link any time).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GEN_TOKEN_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/generate-intake-token.sql'), 'utf-8'
);

interface GenerateIntakeTokenParams {
  /** Omit for Flow 2 (cold lead / generic link). Set for Flow 1 (known contact). */
  contact_id?: number;
}

interface GenerateIntakeTokenResult {
  token_id: number;
  token: string;
  intake_url: string;
  expires_at: string;
  flow: 'known_contact' | 'cold_lead';
  recipe: 'intake-token';
}

export async function generate_intake_token(
  params: GenerateIntakeTokenParams,
  ctx: SkillContext
): Promise<GenerateIntakeTokenResult> {
  const { contact_id } = params;

  // Verify contact belongs to this tenant (if provided)
  if (contact_id != null) {
    const check = await ctx.db.query<{ id: number }>(
      `SELECT id FROM ki_contacts
       WHERE id = $contact_id AND tenant_id = $tenant_id
         AND is_live = $is_live AND is_active = true`,
      { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
    );
    if (!check.rows[0]) {
      throw new Error(`Contact ${contact_id} not found`);
    }
  }

  // Generate cryptographically secure token (32 bytes = 64 hex chars)
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // +5 days

  const res = await ctx.db.query<{
    id: number; token: string; contact_id: number | null;
    expires_at: string; status: string; created_at: string;
  }>(GEN_TOKEN_SQL, {
    $tenant_id:          ctx.tenant_id,
    $token:              token,
    $contact_id:         contact_id ?? null,
    $created_by_user_id: ctx.user_id,
    $expires_at:         expiresAt.toISOString(),
  });

  const row = res.rows[0];
  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const intakeUrl = `${baseUrl}/intake/${token}`;

  return {
    token_id:   row.id,
    token:      row.token,
    intake_url: intakeUrl,
    expires_at: row.expires_at,
    flow:       contact_id != null ? 'known_contact' : 'cold_lead',
    recipe:     'intake-token',
  };
}
