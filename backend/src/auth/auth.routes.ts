/**
 * KI-Prime — Auth Routes
 *
 * POST  /api/v1/auth/register        — Create account + tenant + session
 * POST  /api/v1/auth/login           — Sign in
 * POST  /api/v1/auth/logout          — Sign out (revoke current session)
 * GET   /api/v1/auth/me              — Get current user + tenant
 * POST  /api/v1/auth/change-password — Change password while logged in
 * GET   /api/v1/auth/sessions        — List active sessions
 * POST  /api/v1/auth/sessions/revoke — Revoke specific sessions
 * PATCH /api/v1/auth/preferences     — Update user profile fields
 * POST  /api/v1/auth/invite          — Send team invitations
 * POST  /api/v1/auth/forgot-password — Request reset link
 * POST  /api/v1/auth/reset-password  — Reset password with token
 */

import { Router } from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { register, validateRegisterInput, type RegisterInput } from './auth.service';
import { login as loginService, type LoginInput } from './login.service';
import { verifyAccessToken, refreshSession, parseDeviceInfo, type JwtPayload } from './token.service';

/* ── Refresh-cookie helpers ─────────────────────────── */

const REFRESH_COOKIE_NAME = 'pk_refresh_token';
const REFRESH_TOKEN_TTL_DAYS = 30;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
}

/* ── JWT extraction helper ──────────────────────────── */

function extractJwt(req: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    return verifyAccessToken(auth.slice(7));
  } catch {
    return null;
  }
}

export function createAuthRouter(pool: Pool): Router {
  const router = Router();

  /* ── POST /api/v1/auth/register ───────────────────── */

  router.post('/register', async (req, res) => {
    try {
      const input: RegisterInput = {
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        country_code: req.body.country_code,
        mobile: req.body.mobile,
        tenant_name: req.body.tenant_name,
      };

      const validationError = validateRegisterInput(input);
      if (validationError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: validationError },
        });
        return;
      }

      const result = await register(pool, input, req);

      // Set httpOnly refresh cookie (Step 2: frontend will rely on this; Step 1: additive)
      setRefreshCookie(res, result.tokens.refresh_token);

      res.status(201).json({
        tokens: result.tokens,
        user: result.user,
        tenant: result.tenant,
      });
    } catch (err: any) {
      if (err.status && err.code) {
        res.status(err.status).json({
          error: { code: err.code, message: err.message },
        });
        return;
      }

      console.error('[Auth:register]', err);
      res.status(500).json({
        error: {
          code: 'REGISTRATION_FAILED',
          message: process.env.NODE_ENV === 'production'
            ? 'Registration failed. Please try again.'
            : err.message || 'Unknown error',
        },
      });
    }
  });

  /* ── POST /api/v1/auth/login ────────────────────────── */

  router.post('/login', async (req, res) => {
    try {
      const input: LoginInput = {
        email: req.body.email,
        password: req.body.password,
      };

      const result = await loginService(pool, input, req);

      // Session limit → 409
      if ('code' in result && result.code === 'SESSION_LIMIT') {
        res.status(409).json({
          error: {
            code: result.code,
            message: 'Maximum active sessions reached',
            max_sessions: result.max_sessions,
            active_sessions: result.active_sessions,
          },
        });
        return;
      }

      // TypeScript narrowing: after the SESSION_LIMIT check above, result is LoginResult
      const loginResult = result as import('./login.service').LoginResult;

      // Set httpOnly refresh cookie (Step 2: frontend will rely on this; Step 1: additive)
      setRefreshCookie(res, loginResult.tokens.refresh_token);

      res.json({
        tokens: loginResult.tokens,
        user: loginResult.user,
        tenant: loginResult.tenant,
      });
    } catch (err: any) {
      if (err.status && err.code) {
        res.status(err.status).json({
          error: { code: err.code, message: err.message },
        });
        return;
      }

      console.error('[Auth:login]', err);
      res.status(500).json({
        error: {
          code: 'LOGIN_FAILED',
          message: process.env.NODE_ENV === 'production'
            ? 'Login failed. Please try again.'
            : err.message || 'Unknown error',
        },
      });
    }
  });

  /* ── POST /api/v1/auth/refresh ──────────────────────── */

  router.post('/refresh', async (req, res) => {
    try {
      // Accept refresh token from httpOnly cookie (preferred) or request body (legacy fallback)
      const refresh_token: string | undefined =
        (req as any).cookies?.[REFRESH_COOKIE_NAME] || req.body.refresh_token;

      if (!refresh_token || typeof refresh_token !== 'string') {
        res.status(401).json({
          error: { code: 'INVALID_REFRESH_TOKEN', message: 'No refresh token provided' },
        });
        return;
      }

      const device = parseDeviceInfo(req as any);
      const tokens = await refreshSession(pool, refresh_token, device);

      if (!tokens) {
        clearRefreshCookie(res);
        res.status(401).json({
          error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid, expired, or revoked refresh token' },
        });
        return;
      }

      // Rotate: set new httpOnly cookie with the new refresh token
      setRefreshCookie(res, tokens.refresh_token);

      res.json({ tokens });
    } catch (err: any) {
      console.error('[Auth:refresh]', err);
      res.status(500).json({
        error: { code: 'REFRESH_FAILED', message: 'Token refresh failed' },
      });
    }
  });

  /* ── POST /api/v1/auth/invite ───────────────────────── */

  router.post('/invite', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { invitations } = req.body;
      if (!Array.isArray(invitations) || invitations.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'invitations array required' } });
        return;
      }

      // For each invitation, insert into vn_invitations
      const results = [];
      const crypto = await import('crypto');

      for (const inv of invitations) {
        const email = String(inv.email || '').trim().toLowerCase();
        const roleId = String(inv.role_id || 'planner');

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          results.push({ email, status: 'error', message: 'Invalid email' });
          continue;
        }

        // Check if already invited
        const existing = await pool.query(
          `SELECT id FROM vn_invitations WHERE tenant_id = $1 AND email = $2 AND status = 'pending'`,
          [jwt.tenant_id, email],
        );

        if (existing.rows.length > 0) {
          results.push({ email, role: roleId, status: 'error', message: 'Already invited' });
          continue;
        }

        // Generate token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Look up role UUID — check tenant-specific roles first, then global (tenant_id IS NULL)
        const roleResult = await pool.query(
          `SELECT id FROM vn_roles
           WHERE code = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
           ORDER BY tenant_id NULLS LAST LIMIT 1`,
          [roleId, jwt.tenant_id],
        );
        const roleUuid = roleResult.rows[0] ? (roleResult.rows[0] as any).id : null;

        if (!roleUuid) {
          results.push({ email, role: roleId, status: 'error', message: `Role "${roleId}" not found` });
          continue;
        }

        await pool.query(
          `INSERT INTO vn_invitations (id, tenant_id, invited_by, email, role_id, token_hash, status, expires_at, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'pending', $6, now())`,
          [jwt.tenant_id, jwt.user_id, email, roleUuid, tokenHash, expiresAt],
        );

        results.push({ email, role: roleId, status: 'sent', token: rawToken });
      }

      res.status(201).json({ invitations: results });
    } catch (err: any) {
      console.error('[Auth:invite]', err);
      res.status(500).json({
        error: { code: 'INVITE_FAILED', message: err.message || 'Failed to send invitations' },
      });
    }
  });

  /* ── GET /api/v1/auth/team ─────────────────────────── */

  router.get('/team', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const result = await pool.query(
        `SELECT
           u.id,
           u.name,
           u.email,
           u.first_name,
           u.last_name,
           u.avatar_url,
           u.is_active,
           u.last_login_at,
           u.created_at,
           r.code  AS role_code,
           r.name  AS role_name
         FROM vn_users u
         LEFT JOIN vn_user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
         LEFT JOIN vn_roles r       ON r.id = ur.role_id
         WHERE u.tenant_id = $1
         ORDER BY u.created_at ASC`,
        [jwt.tenant_id],
      );

      res.json({ members: result.rows });
    } catch (err: any) {
      console.error('[Auth:team]', err);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch team members' },
      });
    }
  });

  /* ── GET /api/v1/auth/invitations ──────────────────── */

  router.get('/invitations', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const result = await pool.query(
        `SELECT
           i.id,
           i.email,
           i.status,
           i.expires_at,
           i.created_at,
           r.code AS role_code,
           r.name AS role_name
         FROM vn_invitations i
         LEFT JOIN vn_roles r ON r.id::text = i.role_id
         WHERE i.tenant_id = $1
           AND i.status = 'pending'
           AND i.expires_at > now()
         ORDER BY i.created_at DESC`,
        [jwt.tenant_id],
      );

      res.json({ invitations: result.rows });
    } catch (err: any) {
      console.error('[Auth:invitations]', err);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch invitations' },
      });
    }
  });

  /* ── PATCH /api/v1/auth/preferences ───────────────── */

  router.patch('/preferences', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        const authHeader = req.headers.authorization;
        console.warn('[Auth:preferences] 401 — Authorization header:', authHeader ? `Bearer ${authHeader.slice(7, 20)}...` : 'MISSING');
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { user_id, tenant_id } = jwt;
      const updates: Record<string, unknown> = {};
      const body = req.body;

      // Profile fields → vn_users columns
      if (body.profile_name !== undefined) updates.name = String(body.profile_name).trim().slice(0, 100);
      if (body.first_name !== undefined) updates.first_name = String(body.first_name).trim().slice(0, 100);
      if (body.last_name !== undefined) updates.last_name = String(body.last_name).trim().slice(0, 100);
      if (body.designation !== undefined) updates.designation = String(body.designation).trim().slice(0, 50);
      if (body.country_code !== undefined) updates.country_code = String(body.country_code).trim().slice(0, 10);
      if (body.mobile !== undefined) updates.mobile = String(body.mobile).replace(/[^\d]/g, '').slice(0, 20);
      if (body.bio !== undefined) updates.bio = String(body.bio).trim().slice(0, 2000);
      if (body.preferred_theme !== undefined) updates.preferred_theme = String(body.preferred_theme).slice(0, 50);

      // Merge into preferences JSONB (for color_mode, theme_override, etc.)
      let preferencesMerge: Record<string, unknown> | null = null;
      if (body.color_mode !== undefined) {
        preferencesMerge = { ...(preferencesMerge || {}), color_mode: body.color_mode };
      }
      if (body.theme_override !== undefined) {
        preferencesMerge = { ...(preferencesMerge || {}), theme_override: body.theme_override };
      }

      // Tenant-level settings → vn_tenant_profiles.settings JSONB
      let tenantSettingsMerge: Record<string, unknown> | null = null;
      if (body.default_risk_profile !== undefined) {
        const rp = String(body.default_risk_profile).toLowerCase().trim();
        if (['conservative', 'moderate', 'aggressive'].includes(rp)) {
          tenantSettingsMerge = { ...(tenantSettingsMerge || {}), default_risk_profile: rp };
        }
      }

      if (Object.keys(updates).length === 0 && !preferencesMerge && !tenantSettingsMerge) {
        res.status(400).json({ error: { code: 'NO_FIELDS', message: 'No valid fields to update' } });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Build dynamic UPDATE for column fields
        if (Object.keys(updates).length > 0) {
          const setClauses: string[] = [];
          const values: unknown[] = [];
          let idx = 1;

          for (const [col, val] of Object.entries(updates)) {
            setClauses.push(`${col} = $${idx}`);
            values.push(val);
            idx++;
          }

          setClauses.push(`updated_at = now()`);
          values.push(user_id);
          values.push(tenant_id);

          await client.query(
            `UPDATE vn_users SET ${setClauses.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
            values,
          );
        }

        // Merge preferences JSONB
        if (preferencesMerge) {
          await client.query(
            `UPDATE vn_users SET preferences = COALESCE(preferences, '{}'::jsonb) || $1::jsonb, updated_at = now()
             WHERE id = $2 AND tenant_id = $3`,
            [JSON.stringify(preferencesMerge), user_id, tenant_id],
          );
        }

        // Merge tenant-level settings into vn_tenant_profiles.settings JSONB
        if (tenantSettingsMerge) {
          await client.query(
            `UPDATE vn_tenant_profiles
             SET settings   = COALESCE(settings, '{}'::jsonb) || $1::jsonb,
                 updated_at = now()
             WHERE tenant_id = $2`,
            [JSON.stringify(tenantSettingsMerge), tenant_id],
          );
        }

        await client.query('COMMIT');

        // Return updated user
        const result = await pool.query(
          `SELECT id, email, name, first_name, last_name, designation, country_code, mobile, bio,
                  preferred_theme, preferences, avatar_url
           FROM vn_users WHERE id = $1 AND tenant_id = $2`,
          [user_id, tenant_id],
        );

        res.json({ user: result.rows[0] || {} });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[Auth:preferences]', err);
      res.status(500).json({
        error: {
          code: 'UPDATE_FAILED',
          message: process.env.NODE_ENV === 'production'
            ? 'Failed to update preferences'
            : err.message || 'Unknown error',
        },
      });
    }
  });

  /* ── POST /api/v1/auth/logout ────────────────────────── */

  router.post('/logout', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      // Always clear the httpOnly cookie first
      clearRefreshCookie(res);

      // Revoke the specific session if we can identify it (cookie preferred, body fallback)
      const refreshToken: string | undefined =
        (req as any).cookies?.[REFRESH_COOKIE_NAME] || req.body.refresh_token;

      if (refreshToken) {
        const crypto = await import('crypto');
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await pool.query(
          `UPDATE vn_refresh_tokens SET is_active = false, revoked_at = now(), revoked_reason = 'logout'
           WHERE token_hash = $1 AND user_id = $2 AND is_active = true`,
          [tokenHash, jwt.user_id],
        );
      } else {
        // Fallback: revoke the most recently active session for this user
        await pool.query(
          `UPDATE vn_refresh_tokens SET is_active = false, revoked_at = now(), revoked_reason = 'logout'
           WHERE id = (
             SELECT id FROM vn_refresh_tokens
             WHERE user_id = $1 AND is_active = true
             ORDER BY last_activity_at DESC LIMIT 1
           )`,
          [jwt.user_id],
        );
      }

      res.json({ message: 'Signed out successfully' });
    } catch (err: any) {
      console.error('[Auth:logout]', err);
      res.status(500).json({
        error: { code: 'LOGOUT_FAILED', message: 'Failed to sign out' },
      });
    }
  });

  /* ── GET /api/v1/auth/me ───────────────────────────── */

  router.get('/me', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { user_id, tenant_id, is_live } = jwt;

      // User profile
      const userResult = await pool.query(
        `SELECT id, email, name, first_name, last_name, designation, country_code, mobile, bio,
                preferred_theme, preferences, avatar_url
         FROM vn_users WHERE id = $1 AND tenant_id = $2`,
        [user_id, tenant_id],
      );

      if (userResult.rows.length === 0) {
        res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
        return;
      }

      const user = userResult.rows[0] as any;

      // User role
      const roleResult = await pool.query(
        `SELECT r.code FROM vn_user_roles ur
         JOIN vn_roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1 AND ur.revoked_at IS NULL
         ORDER BY r.sort_order LIMIT 1`,
        [user_id],
      );
      const role = roleResult.rows.length > 0 ? (roleResult.rows[0] as any).code : 'planner';

      // Tenant info
      const tenantResult = await pool.query(
        `SELECT t.id, t.slug, t.is_admin, t.ext_ref_type_code,
                tp.name, tp.display_name, tp.theme_id, tp.logo_url,
                tp.settings->>'default_risk_profile' AS default_risk_profile
         FROM vn_tenants t
         JOIN vn_tenant_profiles tp ON tp.tenant_id = t.id
         WHERE t.id = $1`,
        [tenant_id],
      );
      const tenant = tenantResult.rows[0] as any || {};

      // Onboarding status
      const onboardingResult = await pool.query(
        `SELECT count(*) as pending FROM vn_tenant_onboarding
         WHERE tenant_id = $1 AND status != 'completed'`,
        [tenant_id],
      );
      const onboardingComplete = Number((onboardingResult.rows[0] as any).pending) === 0;

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          first_name: user.first_name,
          last_name: user.last_name,
          designation: user.designation,
          country_code: user.country_code,
          mobile: user.mobile,
          bio: user.bio,
          preferred_theme: user.preferred_theme,
          preferences: user.preferences || {},
          avatar_url: user.avatar_url,
          role,
        },
        tenant: {
          id: tenant_id,
          name: tenant.display_name || tenant.name || '',
          slug: tenant.slug || '',
          theme_id: tenant.theme_id,
          logo_url: tenant.logo_url,
          onboarding_complete: onboardingComplete,
          is_live: is_live !== false,  // default true if somehow missing from JWT
          is_admin: tenant.is_admin === true,
          ext_ref_type_code: tenant.ext_ref_type_code ?? null,
          default_risk_profile: tenant.default_risk_profile ?? null,
        },
      });
    } catch (err: any) {
      console.error('[Auth:me]', err);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch user profile' },
      });
    }
  });

  /* ── PATCH /api/v1/auth/switch-env ─────────────────── */
  /*
   * Toggle live/sandbox environment for the current user.
   * Persists preference to vn_users.preferences and issues a new access token
   * with the updated is_live flag. The refresh token is NOT rotated — only the
   * short-lived access token changes.
   */

  router.patch('/switch-env', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { is_live: requestedLive } = req.body as { is_live?: boolean };
      if (typeof requestedLive !== 'boolean') {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'is_live (boolean) is required' } });
        return;
      }

      // Persist preference
      const envMode = requestedLive ? 'live' : 'sandbox';
      await pool.query(
        `UPDATE vn_users
         SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('env_mode', $1::text),
             updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [envMode, jwt.user_id, jwt.tenant_id],
      );

      // Issue a new access token with the updated is_live flag
      // (same user, same role, same tenant — only environment changes)
      const { signAccessToken } = await import('./token.service');
      const newAccessToken = signAccessToken({
        user_id: jwt.user_id,
        tenant_id: jwt.tenant_id,
        email: jwt.email,
        role: jwt.role,
        is_live: requestedLive,
        is_admin: jwt.is_admin,
      });

      res.json({
        access_token: newAccessToken,
        expires_in: 15 * 60,
        is_live: requestedLive,
      });
    } catch (err: any) {
      console.error('[Auth:switch-env]', err);
      res.status(500).json({
        error: { code: 'SWITCH_ENV_FAILED', message: 'Failed to switch environment' },
      });
    }
  });

  /* ── POST /api/v1/auth/change-password ─────────────── */

  router.post('/change-password', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Current and new password are required' },
        });
        return;
      }

      if (new_password.length < 8) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters' },
        });
        return;
      }

      if (!/[A-Z]/.test(new_password)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'New password must contain at least 1 uppercase letter' },
        });
        return;
      }

      if (!/[0-9]/.test(new_password)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'New password must contain at least 1 number' },
        });
        return;
      }

      // Verify current password
      const userResult = await pool.query(
        'SELECT password_hash FROM vn_users WHERE id = $1 AND tenant_id = $2',
        [jwt.user_id, jwt.tenant_id],
      );

      if (userResult.rows.length === 0) {
        res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
        return;
      }

      const bcrypt = await import('bcryptjs');
      const valid = await bcrypt.compare(current_password, (userResult.rows[0] as any).password_hash);

      if (!valid) {
        res.status(401).json({
          error: { code: 'WRONG_PASSWORD', message: 'Current password is incorrect' },
        });
        return;
      }

      // Hash new password and update
      const newHash = await bcrypt.hash(new_password, 12);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          'UPDATE vn_users SET password_hash = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3',
          [newHash, jwt.user_id, jwt.tenant_id],
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      res.json({ message: 'Password changed successfully' });
    } catch (err: any) {
      console.error('[Auth:change-password]', err);
      res.status(500).json({
        error: { code: 'CHANGE_PASSWORD_FAILED', message: 'Failed to change password' },
      });
    }
  });

  /* ── GET /api/v1/auth/sessions ─────────────────────── */

  router.get('/sessions', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const result = await pool.query(
        `SELECT id as session_id, device_type, os, browser, ip_address::text,
                last_activity_at, created_at
         FROM vn_refresh_tokens
         WHERE user_id = $1 AND is_active = true AND expires_at > now()
         ORDER BY last_activity_at DESC`,
        [jwt.user_id],
      );

      res.json({ sessions: result.rows });
    } catch (err: any) {
      console.error('[Auth:sessions]', err);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch sessions' },
      });
    }
  });

  /* ── POST /api/v1/auth/sessions/revoke ─────────────── */

  router.post('/sessions/revoke', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        // Pre-login revoke (email + password based) — for session limit flow
        const { email, password, session_ids } = req.body;

        if (!email || !password || !Array.isArray(session_ids) || session_ids.length === 0) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'email, password, and session_ids required' },
          });
          return;
        }

        // Verify credentials
        const userResult = await pool.query(
          'SELECT id, password_hash FROM vn_users WHERE LOWER(email) = $1',
          [String(email).trim().toLowerCase()],
        );

        if (userResult.rows.length === 0) {
          res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
          return;
        }

        const bcrypt = await import('bcryptjs');
        const valid = await bcrypt.compare(password, (userResult.rows[0] as any).password_hash);
        if (!valid) {
          res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
          return;
        }

        const userId = (userResult.rows[0] as any).id;

        // Revoke specified sessions
        await pool.query(
          `UPDATE vn_refresh_tokens SET is_active = false, revoked_at = now(), revoked_reason = 'user_revoked'
           WHERE user_id = $1 AND id = ANY($2::uuid[]) AND is_active = true`,
          [userId, session_ids],
        );

        res.json({ message: `${session_ids.length} session(s) revoked` });
        return;
      }

      // Authenticated revoke
      const { session_ids } = req.body;

      if (!Array.isArray(session_ids) || session_ids.length === 0) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'session_ids array required' },
        });
        return;
      }

      await pool.query(
        `UPDATE vn_refresh_tokens SET is_active = false, revoked_at = now(), revoked_reason = 'user_revoked'
         WHERE user_id = $1 AND id = ANY($2::uuid[]) AND is_active = true`,
        [jwt.user_id, session_ids],
      );

      res.json({ message: `${session_ids.length} session(s) revoked` });
    } catch (err: any) {
      console.error('[Auth:sessions/revoke]', err);
      res.status(500).json({
        error: { code: 'REVOKE_FAILED', message: 'Failed to revoke sessions' },
      });
    }
  });

  /* ── POST /api/v1/auth/forgot-password ──────────────── */

  router.post('/forgot-password', async (req, res) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        // Return 200 even for invalid email (no user enumeration)
        res.json({ message: 'If an account exists, a reset link has been sent.' });
        return;
      }

      // Look up user
      const userResult = await pool.query(
        'SELECT id FROM vn_users WHERE LOWER(email) = $1',
        [email],
      );

      if (userResult.rows.length === 0) {
        // Don't reveal that the account doesn't exist
        res.json({ message: 'If an account exists, a reset link has been sent.' });
        return;
      }

      const userId = (userResult.rows[0] as any).id;
      const crypto = await import('crypto');

      // Generate token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Delete any existing unused resets for this user
      await pool.query(
        'DELETE FROM vn_password_resets WHERE user_id = $1 AND used = false',
        [userId],
      );

      // Insert new reset record
      await pool.query(
        `INSERT INTO vn_password_resets (id, user_id, token_hash, expires_at, used, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, false, now())`,
        [userId, tokenHash, expiresAt],
      );

      // MVP: return token in response (email dispatch later)
      res.json({
        message: 'If an account exists, a reset link has been sent.',
        token: rawToken, // MVP only — remove when email is implemented
      });
    } catch (err: any) {
      console.error('[Auth:forgot-password]', err);
      res.status(500).json({
        error: { code: 'RESET_FAILED', message: 'Failed to process reset request' },
      });
    }
  });

  /* ── POST /api/v1/auth/reset-password ─────────────── */

  router.post('/reset-password', async (req, res) => {
    try {
      const { token, new_password } = req.body;

      if (!token || typeof token !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Reset token is required' },
        });
        return;
      }

      if (!new_password || new_password.length < 8) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' },
        });
        return;
      }

      if (!/[A-Z]/.test(new_password)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Password must contain at least 1 uppercase letter' },
        });
        return;
      }

      if (!/[0-9]/.test(new_password)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Password must contain at least 1 number' },
        });
        return;
      }

      const crypto = await import('crypto');
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

      // Look up reset record
      const resetResult = await pool.query(
        `SELECT id, user_id, expires_at, used FROM vn_password_resets
         WHERE token_hash = $1`,
        [tokenHash],
      );

      if (resetResult.rows.length === 0) {
        res.status(400).json({
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' },
        });
        return;
      }

      const resetRecord = resetResult.rows[0] as any;

      if (resetRecord.used) {
        res.status(400).json({
          error: { code: 'TOKEN_USED', message: 'This reset token has already been used' },
        });
        return;
      }

      if (new Date(resetRecord.expires_at) < new Date()) {
        res.status(400).json({
          error: { code: 'TOKEN_EXPIRED', message: 'Reset token has expired. Please request a new one.' },
        });
        return;
      }

      // Hash new password
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(new_password, 12);

      // Update password + mark token used — in transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          'UPDATE vn_users SET password_hash = $1, failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $2',
          [passwordHash, resetRecord.user_id],
        );

        await client.query(
          'UPDATE vn_password_resets SET used = true WHERE id = $1',
          [resetRecord.id],
        );

        // Revoke all existing sessions (force re-login with new password)
        await client.query(
          'UPDATE vn_refresh_tokens SET is_active = false, revoked_at = now(), revoked_reason = $1 WHERE user_id = $2 AND is_active = true',
          ['password_reset', resetRecord.user_id],
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
    } catch (err: any) {
      console.error('[Auth:reset-password]', err);
      res.status(500).json({
        error: {
          code: 'RESET_FAILED',
          message: process.env.NODE_ENV === 'production'
            ? 'Password reset failed'
            : err.message || 'Unknown error',
        },
      });
    }
  });

  return router;
}

/* ── Onboarding Routes (separate router, same file) ─── */

export function createOnboardingRouter(pool: Pool): Router {
  const router = Router();

  /* ── GET /api/v1/onboarding/status ────────────────── */

  router.get('/status', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const result = await pool.query(
        `SELECT step_id, status, completed_at FROM vn_tenant_onboarding
         WHERE tenant_id = $1 ORDER BY created_at`,
        [jwt.tenant_id],
      );

      const steps = result.rows;
      const pendingCount = steps.filter((s: any) => s.status !== 'completed').length;
      const nextIncomplete = steps.find((s: any) => s.status !== 'completed');

      res.json({
        complete: pendingCount === 0,
        steps,
        next_incomplete_step: nextIncomplete ? (nextIncomplete as any).step_id : null,
      });
    } catch (err: any) {
      console.error('[Onboarding:status]', err);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to get onboarding status' },
      });
    }
  });

  /* ── PATCH /api/v1/onboarding/step ────────────────── */

  router.patch('/step', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { step_id, status, metadata } = req.body;
      if (!step_id || status !== 'completed') {
        res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'step_id and status "completed" required' },
        });
        return;
      }

      // Verify step exists for this tenant (must be a mandatory step)
      const existing = await pool.query(
        'SELECT id, status FROM vn_tenant_onboarding WHERE tenant_id = $1 AND step_id = $2',
        [jwt.tenant_id, step_id],
      );

      if (existing.rows.length === 0) {
        res.status(400).json({
          error: { code: 'STEP_NOT_FOUND', message: `Step "${step_id}" is not a tracked onboarding step` },
        });
        return;
      }

      // Update step
      await pool.query(
        `UPDATE vn_tenant_onboarding
         SET status = 'completed', completed_at = now(), metadata = COALESCE($1::jsonb, metadata)
         WHERE tenant_id = $2 AND step_id = $3`,
        [metadata ? JSON.stringify(metadata) : null, jwt.tenant_id, step_id],
      );

      // Check if all steps complete
      const pending = await pool.query(
        `SELECT count(*) as c FROM vn_tenant_onboarding WHERE tenant_id = $1 AND status != 'completed'`,
        [jwt.tenant_id],
      );
      const onboardingComplete = Number((pending.rows[0] as any).c) === 0;

      // Get next incomplete step
      const nextResult = await pool.query(
        `SELECT step_id FROM vn_tenant_onboarding WHERE tenant_id = $1 AND status != 'completed' ORDER BY created_at LIMIT 1`,
        [jwt.tenant_id],
      );
      const nextStep = nextResult.rows[0] ? (nextResult.rows[0] as any).step_id : null;

      res.json({
        step: { step_id, status: 'completed' },
        next_step: nextStep,
        onboarding_complete: onboardingComplete,
      });
    } catch (err: any) {
      console.error('[Onboarding:step]', err);
      res.status(500).json({
        error: { code: 'UPDATE_FAILED', message: 'Failed to update onboarding step' },
      });
    }
  });

  return router;
}

/* ── Tenant Profile Routes ─────────────────────────── */

/** Allowed columns for vn_tenant_profiles update */
const TENANT_PROFILE_FIELDS = [
  'name', 'display_name', 'type', 'description', 'brand_color', 'theme_id',
  'email', 'phone', 'website', 'address_line1', 'address_line2', 'city',
  'state', 'country', 'postal_code', 'gstin', 'pan', 'industry', 'arn',
] as const;

export function createTenantRouter(pool: Pool): Router {
  const router = Router();

  /* ── GET /api/v1/tenant/profile ───────────────────── */

  router.get('/profile', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const result = await pool.query(
        `SELECT tenant_id, name, short_name, display_name, type, description,
                logo_url, brand_color, theme_id, tagline, email, phone, website,
                address_line1, address_line2, city, state, country, postal_code,
                gstin, pan, industry, arn, updated_at
         FROM vn_tenant_profiles WHERE tenant_id = $1`,
        [jwt.tenant_id],
      );

      res.json({ profile: result.rows[0] || {} });
    } catch (err: any) {
      console.error('[Tenant:profile:get]', err);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch tenant profile' },
      });
    }
  });

  /* ── PATCH /api/v1/tenant/profile ──────────────────── */

  router.patch('/profile', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { tenant_id } = jwt;
      const body = req.body;

      // Collect only allowed fields that are present in the request body
      const updates: { col: string; value: unknown }[] = [];
      for (const field of TENANT_PROFILE_FIELDS) {
        if (body[field] !== undefined) {
          updates.push({ col: field, value: body[field] });
        }
      }

      if (updates.length === 0) {
        res.status(400).json({ error: { code: 'NO_FIELDS', message: 'No valid fields to update' } });
        return;
      }

      // Build dynamic UPDATE — only set provided fields + updated_at
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const { col, value } of updates) {
        setClauses.push(`${col} = $${idx}`);
        values.push(value);
        idx++;
      }

      setClauses.push('updated_at = now()');
      values.push(tenant_id);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE vn_tenant_profiles SET ${setClauses.join(', ')} WHERE tenant_id = $${idx}`,
          values,
        );

        await client.query('COMMIT');

        // Return the updated profile
        const result = await pool.query(
          `SELECT tenant_id, name, short_name, display_name, type, description,
                  logo_url, brand_color, theme_id, tagline, email, phone, website,
                  address_line1, address_line2, city, state, country, postal_code,
                  gstin, pan, industry, arn, updated_at
           FROM vn_tenant_profiles WHERE tenant_id = $1`,
          [tenant_id],
        );

        res.json({ profile: result.rows[0] || {} });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[Tenant:profile]', err);
      res.status(500).json({
        error: {
          code: 'UPDATE_FAILED',
          message: process.env.NODE_ENV === 'production'
            ? 'Failed to update tenant profile'
            : err.message || 'Unknown error',
        },
      });
    }
  });

  /* ── PATCH /api/v1/tenant/ext-ref-type ─────────────── */
  /*
   * One-time selection of the tenant's external reference type (CAMS, KFINTECH, etc.).
   * Once set, cannot be changed by the tenant — admin intervention required.
   * Returns 409 if already set.
   */

  router.patch('/ext-ref-type', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
        return;
      }

      const { ext_ref_type_code } = req.body as { ext_ref_type_code?: string };
      if (!ext_ref_type_code || typeof ext_ref_type_code !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'ext_ref_type_code is required' } });
        return;
      }

      // Verify the code exists in ki_ext_ref_types
      const typeCheck = await pool.query(
        `SELECT code FROM ki_ext_ref_types WHERE code = $1 AND is_active = true`,
        [ext_ref_type_code],
      );
      if (typeCheck.rows.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_CODE', message: 'Unknown or inactive platform type' } });
        return;
      }

      // Set only if not already set (one-time lock)
      const result = await pool.query(
        `UPDATE vn_tenants
         SET ext_ref_type_code = $1, updated_at = now()
         WHERE id = $2 AND ext_ref_type_code IS NULL
         RETURNING ext_ref_type_code`,
        [ext_ref_type_code, jwt.tenant_id],
      );

      if (result.rows.length === 0) {
        // Check if it's because already set
        const existing = await pool.query(
          `SELECT ext_ref_type_code FROM vn_tenants WHERE id = $1`,
          [jwt.tenant_id],
        );
        const current = (existing.rows[0] as any)?.ext_ref_type_code;
        if (current) {
          res.status(409).json({
            error: {
              code: 'ALREADY_SET',
              message: `Platform already set to '${current}'. Contact admin to change.`,
              current_code: current,
            },
          });
        } else {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
        }
        return;
      }

      res.json({ ext_ref_type_code: (result.rows[0] as any).ext_ref_type_code });
    } catch (err: any) {
      console.error('[Tenant:extRefType]', err);
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to set platform type' } });
    }
  });

  return router;
}
