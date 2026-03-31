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

  /* ── PATCH /api/v1/auth/preferences ───────────────── */

  router.patch('/preferences', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) {
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
