import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { buildRegistry } from './services/skill-registry';
import { getPool, createTenantDb, closePool, healthCheck } from './db';
import { createAuthRouter, createOnboardingRouter, createTenantRouter } from './auth/auth.routes';
import { createEtlRouter } from './etl/etl.routes';
import { createIntakeRouter } from './intake/intake.routes';
import { createMasterDataRouter } from './master-data/master-data.routes';
import { verifyAccessToken } from './auth/token.service';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,   // required for httpOnly cookie exchange
}));
app.use(cookieParser());
app.use(express.json());

/* ── Health check (with DB liveness) ────────────────── */

app.get('/health', async (_req, res) => {
  try {
    const db = await healthCheck();
    res.json({
      status: 'ok',
      service: 'prokey-api',
      version: '2.0.0',
      db: db,
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      service: 'prokey-api',
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
    console.log(`[VaNi-GTM] Database connected (${check.latency_ms}ms)`);
  } catch (err) {
    console.error('[VaNi-GTM] Database connection failed:', err instanceof Error ? err.message : err);
    console.error('[VaNi-GTM] Continuing without DB — skill calls will fail.');
  }

  // Mount auth + onboarding + tenant routes
  app.use('/api/v1/auth', createAuthRouter(pool));
  app.use('/api/v1/onboarding', createOnboardingRouter(pool));
  app.use('/api/v1/tenant', createTenantRouter(pool));
  app.use('/api/v1/intake', createIntakeRouter(pool));  // public — no JWT
  app.use('/api/v1/etl', createEtlRouter(pool));
  app.use('/api/v1/master-data', createMasterDataRouter(pool));
  console.log('[VaNi-GTM] Routes mounted: /api/v1/auth, /onboarding, /tenant, /etl, /master-data');

  // Build skill registry
  const skillsDir = path.resolve(__dirname, 'skills');
  const registry = await buildRegistry(skillsDir);
  const summary = registry.summary();
  console.log(`[VaNi-GTM] Loaded ${summary.skills} skills, ${summary.handlers} handlers`);

  /* ── Skill execution route ──────────────────────────── */

  app.post('/api/v1/skills/:skillName/:functionName', async (req, res) => {
    const { skillName, functionName } = req.params;
    const params = req.body.params || {};

    // JWT auth — extract tenant_id from token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Valid token required' },
      });
      return;
    }

    let tenantId: string;
    let isLive: boolean;
    let userId: string;
    try {
      const jwt = verifyAccessToken(authHeader.slice(7));
      tenantId = jwt.tenant_id;
      isLive   = jwt.is_live;
      userId   = jwt.user_id;
    } catch {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
      return;
    }

    // Create tenant-scoped DB interface (RLS context set per query)
    const db = createTenantDb(pool, tenantId);
    const ctx = { tenant_id: tenantId, is_live: isLive, user_id: userId, db };

    try {
      const result = await registry.execute(skillName, functionName, params, ctx);
      if (!result.success) {
        console.error(`[Skill:${skillName}.${functionName}] execution failed:`, result.error);
      }
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
    console.log(`[VaNi-GTM] API running on port ${PORT}`);
  });

  /* ── Graceful shutdown ──────────────────────────────── */

  async function shutdown(signal: string) {
    console.log(`\n[VaNi-GTM] ${signal} received — shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('[VaNi-GTM] HTTP server closed.');
    });

    // Drain DB pool
    await closePool();

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[VaNi-GTM] Failed to start:', err);
  process.exit(1);
});
