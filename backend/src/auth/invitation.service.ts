/**
 * Invitations — a person joins an EXISTING workspace through a link.
 *
 * Nothing sends email. The inviter copies the link from People in the Smart
 * Profile and shares it however they like (Charan, 2026-10-01: "copy and
 * share"). So the only thing that makes the link work is the token in it,
 * which is why only its SHA-256 is stored and the raw value is returned once,
 * at the moment it is made.
 *
 * Three rules this file keeps:
 *   - The email is the INVITATION's, never the request body's. The link was
 *     made for one address; opening it does not let anyone pick another.
 *   - One account belongs to one workspace (vn_users.tenant_id, and login
 *     looks a user up by email alone). An address that already has an account
 *     cannot accept — it is refused when the link is made, and again when it
 *     is opened, with the reason, instead of failing on the INSERT.
 *   - Accepting is one transaction: the user, their role and the invitation
 *     turning `accepted` either all happen or none do. The row is locked, so
 *     two tabs opening the same link make one account, not two.
 *
 * The vn_ auth tables are RLS-exempt by design — authentication precedes
 * tenant context (docs/db/rls-status.md §5.1) — so these reads work before
 * anyone is signed in, under either runtime role.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import type { Request } from 'express';
import { createSession, parseDeviceInfo } from './token.service';
import { validateRegisterInput, type RegisterResult } from './auth.service';

export function hashInviteToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function newInviteToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashInviteToken(raw) };
}

class InviteError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** True if this address already has an account anywhere — it cannot join another workspace. */
export async function emailHasAccount(pool: Pool, email: string): Promise<boolean> {
  const r = await pool.query('SELECT 1 FROM vn_users WHERE LOWER(email) = $1 LIMIT 1', [email.toLowerCase()]);
  return r.rows.length > 0;
}

const INVITE_SQL = `
  SELECT i.id, i.tenant_id, i.email, i.role_id, i.status, i.expires_at,
         r.code AS role_code, r.name AS role_name,
         COALESCE(tp.display_name, tp.name) AS workspace_name,
         inv.name AS invited_by_name
    FROM vn_invitations i
    LEFT JOIN vn_roles r            ON r.id::text = i.role_id
    LEFT JOIN vn_tenant_profiles tp ON tp.tenant_id = i.tenant_id
    LEFT JOIN vn_users inv          ON inv.id = i.invited_by
   WHERE i.token_hash = $1`;

interface InviteRow {
  id: string; tenant_id: string; email: string; role_id: string; status: string; expires_at: Date;
  role_code: string | null; role_name: string | null; workspace_name: string | null; invited_by_name: string | null;
}

/** Why a link cannot be used, in words the person holding it can act on. */
function refuse(row: InviteRow | undefined): InviteError | null {
  if (!row) return new InviteError(404, 'INVITE_NOT_FOUND', 'This invitation link is not valid. Ask the person who shared it for a new one.');
  if (row.status === 'accepted') return new InviteError(410, 'INVITE_USED', 'This invitation has already been used. Sign in instead.');
  if (row.status !== 'pending') return new InviteError(410, 'INVITE_WITHDRAWN', 'This invitation was withdrawn. Ask the person who shared it for a new one.');
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return new InviteError(410, 'INVITE_EXPIRED', 'This invitation has expired. Ask the person who shared it for a new link.');
  }
  if (!row.role_code) return new InviteError(409, 'INVITE_ROLE_MISSING', 'The role on this invitation no longer exists. Ask for a new link.');
  return null;
}

export interface InvitationPreview {
  email: string;
  workspace_name: string;
  role: string;
  invited_by: string | null;
  expires_at: string;
}

/** What the join page shows before the person types anything. */
export async function previewInvitation(pool: Pool, rawToken: string): Promise<InvitationPreview> {
  const row = (await pool.query<InviteRow>(INVITE_SQL, [hashInviteToken(rawToken)])).rows[0];
  const err = refuse(row);
  if (err) throw err;
  if (await emailHasAccount(pool, row.email)) {
    throw new InviteError(409, 'EMAIL_EXISTS',
      `${row.email} already has a VaNi account, and an account belongs to one workspace. Sign in with it, or ask for an invitation to a different address.`);
  }
  return {
    email: row.email,
    workspace_name: row.workspace_name ?? 'this workspace',
    role: row.role_name ?? row.role_code!,
    invited_by: row.invited_by_name,
    expires_at: new Date(row.expires_at).toISOString(),
  };
}

export interface AcceptInput {
  token: string;
  name: string;
  password: string;
  country_code?: string;
  mobile?: string;
}

function sanitize(input: string): string {
  return input.replace(/[<>"'&]/g, '');
}

/** Create the user inside the inviting workspace and sign them in. */
export async function acceptInvitation(pool: Pool, input: AcceptInput, req: Request): Promise<RegisterResult> {
  const raw = String(input.token ?? '').trim();
  if (!raw) throw new InviteError(400, 'VALIDATION_ERROR', 'The invitation link is missing its token.');

  // Validate the person's fields against the same rules as signup, using the
  // invitation's email so the email rule cannot be what fails.
  const peek = (await pool.query<InviteRow>(INVITE_SQL, [hashInviteToken(raw)])).rows[0];
  const early = refuse(peek);
  if (early) throw early;
  const validation = validateRegisterInput({
    name: input.name, email: peek.email, password: input.password,
    country_code: input.country_code, mobile: input.mobile,
  });
  if (validation) throw new InviteError(400, 'VALIDATION_ERROR', validation);

  const name = sanitize(String(input.name).trim());
  const countryCode = input.country_code?.trim() || null;
  const mobile = input.mobile?.replace(/[\s-]/g, '') || null;
  const passwordHash = await bcrypt.hash(input.password, 12);
  const device = parseDeviceInfo(req);

  const client = await pool.connect();
  let userId: string;
  let row: InviteRow;
  try {
    await client.query('BEGIN');
    // Re-read under a lock: the checks above were advisory, this one decides.
    row = (await client.query<InviteRow>(`${INVITE_SQL} FOR UPDATE OF i`, [hashInviteToken(raw)])).rows[0];
    const err = refuse(row);
    if (err) throw err;

    const taken = await client.query('SELECT 1 FROM vn_users WHERE LOWER(email) = $1 LIMIT 1', [row.email.toLowerCase()]);
    if (taken.rows.length) {
      throw new InviteError(409, 'EMAIL_EXISTS',
        `${row.email} already has a VaNi account, and an account belongs to one workspace. Sign in with it instead.`);
    }

    const defaultTheme = process.env.NEXT_PUBLIC_DEFAULT_THEME || 'vikuna-black';
    const defaultColorMode = process.env.NEXT_PUBLIC_DEFAULT_COLOR_MODE || 'dark';
    const parts = name.split(' ');
    const u = await client.query<{ id: string }>(
      `INSERT INTO vn_users
         (id, tenant_id, email, password_hash, name, first_name, last_name, country_code, mobile,
          preferred_theme, preferences, is_active, is_email_verified, failed_login_count,
          intake_code, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10::jsonb, true, false, 0,
          substring(encode(gen_random_bytes(5), 'hex'), 1, 8), now(), now())
       RETURNING id`,
      [row.tenant_id, row.email.toLowerCase(), passwordHash, name, parts[0] || '', parts.slice(1).join(' ') || '',
       countryCode, mobile, defaultTheme, JSON.stringify({ color_mode: defaultColorMode })],
    );
    userId = u.rows[0].id;

    // assigned_by is the inviter: that is who decided this person gets this role.
    await client.query(
      `INSERT INTO vn_user_roles (id, user_id, role_id, assigned_by, assigned_at)
       SELECT gen_random_uuid(), $1, $2::uuid, i.invited_by, now() FROM vn_invitations i WHERE i.id = $3`,
      [userId, row.role_id, row.id],
    );

    await client.query(
      `UPDATE vn_invitations SET status = 'accepted', accepted_at = now() WHERE id = $1`,
      [row.id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const t = (await pool.query(
    `SELECT t.slug, t.is_admin, tp.name, tp.display_name, tp.theme_id
       FROM vn_tenants t JOIN vn_tenant_profiles tp ON tp.tenant_id = t.id
      WHERE t.id = $1`,
    [row.tenant_id],
  )).rows[0] ?? {};
  const pending = await pool.query(
    `SELECT count(*)::int AS n FROM vn_tenant_onboarding WHERE tenant_id = $1 AND status != 'completed'`,
    [row.tenant_id],
  );

  const role = row.role_code!;
  const tokens = await createSession(pool, userId, row.tenant_id, row.email.toLowerCase(), role, device, true, t.is_admin === true);

  return {
    tokens,
    user: {
      id: userId,
      email: row.email.toLowerCase(),
      name,
      role,
      preferred_theme: process.env.NEXT_PUBLIC_DEFAULT_THEME || 'vikuna-black',
      preferences: { color_mode: process.env.NEXT_PUBLIC_DEFAULT_COLOR_MODE || 'dark' },
    },
    tenant: {
      id: row.tenant_id,
      name: t.display_name || t.name || '',
      slug: t.slug || '',
      theme_id: t.theme_id || 'vikuna-black',
      onboarding_complete: Number(pending.rows[0].n) === 0,
    },
  };
}
