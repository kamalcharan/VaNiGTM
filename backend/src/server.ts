import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { buildRegistry } from './services/skill-registry';
import { getPool, createTenantDb, closePool, healthCheck } from './db';
import { createAuthRouter, createOnboardingRouter } from './auth/auth.routes';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

/* ── Health check (with DB liveness) ────────────────── */

app.get('/health', async (_req, res) => {
  try {
    const db = await healthCheck();
    res.json({
      status: 'ok',
      service: 'proessionalkey-api',
      version: '2.0.0',
      db: db,
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      service: 'proessionalkey-api',
      version: '2.0.0',
      db: { ok: false, error: err instanceof Error ? err.message : 'Unknown' },
    });
  }
});

/* ── Main ───────────────────────────────────────────── */

async function main() {
  // Initialize DB pool
  const pool = getPool();

  // Verify database connectivity at startup
  try {
    const check = await healthCheck();
    console.log(`[ProessionalKey] Database connected (${check.latency_ms}ms)`);
  } catch (err) {
    console.error('[ProessionalKey] Database connection failed:', err instanceof Error ? err.message : err);
    console.error('[ProessionalKey] Continuing without DB — skill calls will fail.');
  }

  // Mount auth + onboarding routes
  app.use('/api/v1/auth', createAuthRouter(pool));
  app.use('/api/v1/onboarding', createOnboardingRouter(pool));
  console.log('[ProessionalKey] Auth routes mounted at /api/v1/auth, /api/v1/onboarding');

  // Build skill registry
  const skillsDir = path.resolve(__dirname, 'skills');
  const registry = await buildRegistry(skillsDir);
  const summary = registry.summary();
  console.log(`[ProessionalKey] Loaded ${summary.skills} skills, ${summary.handlers} handlers`);

  /* ── Skill execution route ──────────────────────────── */

  app.post('/api/v1/skills/:skillName/:functionName', async (req, res) => {
    const { skillName, functionName } = req.params;
    const params = req.body.params || {};

    // TODO: Replace with real JWT auth middleware
    // For now: X-Dev-Tenant-Id header for development
    const tenantId = req.headers['x-dev-tenant-id'] as string;
    if (!tenantId) {
      res.status(401).json({
        error: {
          code: 'MISSING_TENANT',
          message: 'X-Dev-Tenant-Id header required (JWT auth not yet implemented)',
        },
      });
      return;
    }

    // Create tenant-scoped DB interface (RLS context set per query)
    const db = createTenantDb(pool, tenantId);
    const ctx = { tenant_id: tenantId, db };

    try {
      const result = await registry.execute(skillName, functionName, params, ctx);
      res.json(result);
    } catch (err) {
      console.error(`[Skill:${skillName}.${functionName}]`, err);
      res.status(500).json({
        error: {
          code: 'SKILL_EXECUTION_ERROR',
          message: process.env.NODE_ENV === 'production'
            ? 'Internal error'
            : err instanceof Error ? err.message : 'Unknown error',
        },
      });
    }
  });

  /* ── Start server ───────────────────────────────────── */

  const server = app.listen(PORT, () => {
    console.log(`[ProessionalKey] API running on port ${PORT}`);
  });

  /* ── Graceful shutdown ──────────────────────────────── */

  async function shutdown(signal: string) {
    console.log(`\n[ProessionalKey] ${signal} received — shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('[ProessionalKey] HTTP server closed.');
    });

    // Drain DB pool
    await closePool();

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[ProessionalKey] Failed to start:', err);
  process.exit(1);
});
