/**
 * KI-Prime — Auth Routes
 *
 * POST  /api/v1/auth/register      — Create account + tenant + session
 * PATCH /api/v1/auth/preferences   — Update user profile fields (onboarding step 1)
 * PATCH /api/v1/onboarding/step    — Mark onboarding step as completed
 * GET   /api/v1/onboarding/status  — Get onboarding completion status
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { register, validateRegisterInput, type RegisterInput } from './auth.service';
import { login as loginService, type LoginInput } from './login.service';
import { verifyAccessToken, type JwtPayload } from './token.service';

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

        // Look up role UUID
        const roleResult = await pool.query(
          'SELECT id FROM vn_roles WHERE tenant_id = $1 AND code = $2 LIMIT 1',
          [jwt.tenant_id, roleId],
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

      if (Object.keys(updates).length === 0 && !preferencesMerge) {
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

  return router;
}
