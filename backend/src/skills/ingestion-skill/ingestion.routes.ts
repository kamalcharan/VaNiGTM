/**
 * Ingestion routes — mounted at /api/v1/ingest.
 *
 * Stage 2: all handlers return 501 NOT_IMPLEMENTED. Real handlers land
 * in Stage 3 (file/URL upload + OAuth) and Stage 4 (sources CRUD).
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';

export function createIngestionRouter(_pool: Pool): Router {
  const router = Router();

  const notImplemented = (_req: Request, res: Response): void => {
    res.status(501).json({
      error: { code: 'NOT_IMPLEMENTED', message: 'Coming soon' },
    });
  };

  router.get('/connect/gdrive',           notImplemented);
  router.get('/connect/gdrive/callback',  notImplemented);
  router.post('/sync',                    notImplemented);
  router.get('/sources',                  notImplemented);
  router.get('/sources/:id',              notImplemented);
  router.delete('/sources/:id',           notImplemented);

  return router;
}
