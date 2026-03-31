/**
 * KI-Prime — Auth Routes
 *
 * POST /api/v1/auth/register  — Create account + tenant + session
 *
 * More endpoints (login, me, refresh, logout) will be added in later steps.
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { register, validateRegisterInput, type RegisterInput } from './auth.service';

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

      // Validate
      const validationError = validateRegisterInput(input);
      if (validationError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: validationError },
        });
        return;
      }

      // Register
      const result = await register(pool, input, req);

      res.status(201).json({
        tokens: result.tokens,
        user: result.user,
        tenant: result.tenant,
      });
    } catch (err: any) {
      // Known errors (email exists, etc.)
      if (err.status && err.code) {
        res.status(err.status).json({
          error: { code: err.code, message: err.message },
        });
        return;
      }

      // Unexpected errors
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

  return router;
}
