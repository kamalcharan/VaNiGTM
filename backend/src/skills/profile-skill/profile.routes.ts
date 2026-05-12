/**
 * profile-skill routes — mounted at /api/v1/profile.
 *
 *   GET  /          get current profile (JWT)
 *   PUT  /          upsert profile fields (JWT)
 *   POST /approve   approve profile, emit PROFILE_COMPLETE (JWT)
 *   GET  /history   paginated version history (JWT)
 *
 * Stage 2: handler stubs return 501 NOT_IMPLEMENTED.
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';

export function createProfileRouter(_pool: Pool): Router {
  const router = Router();

  const notImplemented = (_req: Request, res: Response): void => {
    res.status(501).json({
      error: { code: 'NOT_IMPLEMENTED', message: 'Coming soon' },
    });
  };

  router.get('/',         notImplemented);
  router.put('/',         notImplemented);
  router.post('/approve', notImplemented);
  router.get('/history',  notImplemented);

  return router;
}
