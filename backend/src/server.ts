import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { buildRegistry } from './services/skill-registry';
import { getPool, createTenantDb, closePool, healthCheck } from './db';
import { createAuthRouter, createTenantRouter } from './auth/auth.routes';
// Onboarding moved out of auth.routes: it is its own agent now, running lanes
// for the product tier and for each agent, rather than a pair of helpers.
import { createOnboardingRouter } from './onboarding/onboarding.routes';
import { createEtlRouter } from './etl/etl.routes';
import { createVaniRouter } from './skills/vani-skill/vani.routes';
import { createIngestionRouter } from './skills/ingestion-skill/ingestion.routes';
import { createProfileRouter } from './skills/profile-skill/profile.routes';
import { createStorytellerRouter } from './skills/storyteller-skill/storyteller.routes';
import { createAssessmentRouter } from './skills/assessment-skill/assessment.routes';
import { createVaraRouter } from './vara/vara.routes';
import { createEmbedRouter } from './vani/embed.routes';
import { verifyAccessToken } from './auth/token.service';
import { resolveAuth } from './auth/auth-context';

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
  app.use('/api/v1/etl', createEtlRouter(pool));
  app.use('/api/v1/vani', createVaniRouter(pool));
  app.use('/api/v1/ingest', createIngestionRouter(pool));
  app.use('/api/v1/profile', createProfileRouter(pool));
  app.use('/api/v1/storyteller', createStorytellerRouter(pool));
  // Public (no JWT) — see assessment-skill/SKILL.md "Two halves, two access models".
  app.use('/api/v1/assessment', createAssessmentRouter(pool));
  // Vara: activation + embed are workspace-authed; /vara/embed/boot is public
  // by design — it serves the widget inside the TENANT'S site, where no
  // platform session exists. See vara/vara.routes.ts for the threat model.
  app.use('/api/v1/vara', createVaraRouter(pool));
  // Platform-owned embed channel. Mounted at /api/v1 because it owns two paths
  // in that namespace — /tenant/embed (workspace) and /embed/boot (public) —
  // and belongs to no agent.
  app.use('/api/v1', createEmbedRouter(pool));
  console.log('[VaNi-GTM] Routes mounted: /api/v1/auth, /onboarding, /tenant, /etl, /vani, /ingest, /profile, /storyteller, /assessment, /vara');

  // Build skill registry
  const skillsDir = path.resolve(__dirname, 'skills');
  const registry = await buildRegistry(skillsDir);
  const summary = registry.summary();
  console.log(`[VaNi-GTM] Loaded ${summary.skills} skills, ${summary.handlers} handlers`);

  // Name every registered function at boot. The registry is built ONCE here,
  // so "No handler registered for x.y" at request time always means the
  // process was started without that file — and the only way to tell used to
  // be inferring it. Now the answer is in the log.
  for (const skill of [...registry.skills.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const fns = (skill.functions ?? [])
      .map((f) => f.name)
      .filter((n) => typeof registry.getHandler(skill.name, n) === 'function');
    const declaredOnly = (skill.functions ?? [])
      .map((f) => f.name)
      .filter((n) => typeof registry.getHandler(skill.name, n) !== 'function');
    console.log(
      `[VaNi-GTM]   ${skill.name}: ${fns.join(', ') || '(none)'}`
      + (declaredOnly.length
        ? `  ⚠ declared in SKILL.md but NOT registered: ${declaredOnly.join(', ')}`
        : ''),
    );
  }

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

    // One resolver, shared with the ETL routes. See auth/auth-context.ts.
    const auth = resolveAuth(authHeader);
    if (!auth) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
      return;
    }

    // Create tenant-scoped DB interface (RLS context set per query)
    const db = createTenantDb(pool, auth.tenant_id);
    const ctx = {
      tenant_id: auth.tenant_id,
      is_live: auth.is_live,
      user_id: auth.user_id,
      is_admin: auth.is_admin,
      db,
    };

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
