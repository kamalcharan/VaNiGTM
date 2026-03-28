# VaNiBase Codebase Audit Report

**Date:** 2026-03-26  
**Branch:** `claude/setup-vanibase-framework-UYVrq`  
**Purpose:** Provide Claude.ai mentor session with exact code patterns for designing Phase 1 (Auth API), Phase 2 (Theme System), Phase 3 (Auth Context), Phase 4 (Entity Navigation)

---

## SECTION 1: Complete File Tree

    ./.eslintrc.json (24 lines)
    ./framework/boot.ts (83 lines)
    ./framework/config.ts (53 lines)
    ./framework/context-builder/build-context.ts (61 lines)
    ./framework/context-builder/index.ts (5 lines)
    ./framework/db/index.ts (1 lines)
    ./framework/db/pool.ts (334 lines)
    ./framework/escalation/handler.ts (96 lines)
    ./framework/escalation/index.ts (5 lines)
    ./framework/gateway/auth.ts (97 lines)
    ./framework/gateway/index.ts (6 lines)
    ./framework/gateway/tenant-context.ts (27 lines)
    ./framework/memory/index.ts (5 lines)
    ./framework/memory/store.ts (161 lines)
    ./framework/middleware/error-handler.ts (24 lines)
    ./framework/middleware/metrics.ts (112 lines)
    ./framework/middleware/rate-limiter.ts (115 lines)
    ./framework/middleware/request-logger.ts (14 lines)
    ./framework/orchestrator.ts (202 lines)
    ./framework/queue/index.ts (6 lines)
    ./framework/queue/processor.ts (155 lines)
    ./framework/recipes/index.ts (5 lines)
    ./framework/recipes/registry.ts (33 lines)
    ./framework/redis/client.ts (53 lines)
    ./framework/redis/index.ts (1 lines)
    ./framework/routes/chat.ts (49 lines)
    ./framework/routes/health.ts (62 lines)
    ./framework/routes/jobs.ts (24 lines)
    ./framework/routes/recipes.ts (27 lines)
    ./framework/routes/skills.ts (77 lines)
    ./framework/server.ts (119 lines)
    ./framework/skill-executor/executor.ts (148 lines)
    ./framework/skill-executor/index.ts (7 lines)
    ./framework/skill-executor/registry.ts (81 lines)
    ./framework/vani-engine/engine.ts (148 lines)
    ./framework/vani-engine/index.ts (6 lines)
    ./framework/vani-engine/mock-engine.ts (89 lines)
    ./migrations/001_framework_base.sql (233 lines)
    ./package.json (36 lines)
    ./recipes/demo-dashboard.json (63 lines)
    ./seeds/demo-seed.sql (48 lines)
    ./shared/constants/index.ts (90 lines)
    ./shared/types/index.ts (581 lines)
    ./shell/.eslintrc.json (3 lines)
    ./shell/package.json (28 lines)
    ./shell/postcss.config.mjs (8 lines)
    ./shell/src/app/[recipe]/page.tsx (10 lines)
    ./shell/src/app/globals.css (120 lines)
    ./shell/src/app/layout.tsx (76 lines)
    ./shell/src/app/page.tsx (36 lines)
    ./shell/src/components/header.tsx (31 lines)
    ./shell/src/components/layouts/briefing.tsx (18 lines)
    ./shell/src/components/layouts/comparison.tsx (22 lines)
    ./shell/src/components/layouts/dashboard-3row.tsx (22 lines)
    ./shell/src/components/layouts/detail-sidebar.tsx (19 lines)
    ./shell/src/components/layouts/index.ts (29 lines)
    ./shell/src/components/layouts/list-detail.tsx (19 lines)
    ./shell/src/components/layouts/wizard-flow.tsx (18 lines)
    ./shell/src/components/recipe-page.tsx (87 lines)
    ./shell/src/components/recipe-renderer.tsx (107 lines)
    ./shell/src/components/shell-layout.tsx (46 lines)
    ./shell/src/components/sidebar.tsx (83 lines)
    ./shell/src/components/theme-provider.tsx (79 lines)
    ./shell/src/components/vdf/action-bar.tsx (41 lines)
    ./shell/src/components/vdf/approval-card.tsx (48 lines)
    ./shell/src/components/vdf/badge.tsx (40 lines)
    ./shell/src/components/vdf/bar-chart.tsx (171 lines)
    ./shell/src/components/vdf/briefing-panel.tsx (63 lines)
    ./shell/src/components/vdf/chat-panel.tsx (143 lines)
    ./shell/src/components/vdf/data-table.tsx (217 lines)
    ./shell/src/components/vdf/doughnut.tsx (164 lines)
    ./shell/src/components/vdf/filter-row.tsx (82 lines)
    ./shell/src/components/vdf/index.ts (50 lines)
    ./shell/src/components/vdf/insight-card.tsx (90 lines)
    ./shell/src/components/vdf/kpi-card.tsx (147 lines)
    ./shell/src/components/vdf/line-chart.tsx (143 lines)
    ./shell/src/components/vdf/probability-gauge.tsx (189 lines)
    ./shell/src/components/vdf/slider-panel.tsx (78 lines)
    ./shell/src/components/vdf/sparkline.tsx (49 lines)
    ./shell/src/components/vdf/stat-row.tsx (88 lines)
    ./shell/src/components/vdf/suggestion.tsx (51 lines)
    ./shell/src/components/vdf/timeline.tsx (120 lines)
    ./shell/src/components/vdf/wizard.tsx (128 lines)
    ./shell/src/lib/chart-colors.ts (16 lines)
    ./shell/src/lib/default-product-config.ts (8 lines)
    ./shell/src/lib/json-path.ts (34 lines)
    ./shell/src/lib/shell-config-types.ts (57 lines)
    ./shell/src/lib/shell-config.ts (81 lines)
    ./shell/src/lib/skill-fetcher.ts (93 lines)
    ./shell/tailwind.config.ts (33 lines)
    ./shell/tsconfig.json (27 lines)
    ./skills/demo-skill/functions/get-greeting.ts (38 lines)
    ./skills/demo-skill/functions/get-stats.ts (47 lines)
    ./tsconfig.json (30 lines)
    ./vani.config.template.ts (95 lines)

---

## SECTION 2: API Server — Boot Sequence

### framework/server.ts (119 lines)

```typescript
/**
 * VaNi Framework — Generic Server Entry Point
 *
 * This is the framework's standalone server for development and testing.
 * Products (KI-Prime, KaalaDristi) import the framework as a submodule
 * and have their own entry points that wire in product-specific skills.
 *
 * Usage:
 *   VANI_MOCK=true npx tsx framework/server.ts
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { loadConfig } from './config.js';
import { Orchestrator } from './orchestrator.js';
import { boot } from './boot.js';
import { initPool } from './db/index.js';
import { initRedis, closeRedis } from './redis/index.js';
import { initQueue, startWorker } from './queue/index.js';
import { healthRouter } from './routes/health.js';
import { createChatRouter } from './routes/chat.js';
import { createRecipesRouter } from './routes/recipes.js';
import { registerSkillsRoute } from './routes/skills.js';
import { jobsRouter } from './routes/jobs.js';
import { authMiddleware } from './gateway/auth.js';
import { tenantContext } from './gateway/tenant-context.js';
import { rateLimitMiddleware } from './middleware/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { metricsMiddleware, metricsRouter } from './middleware/metrics.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const port = config.port;

  console.log(`[VaNi] Starting framework server (${config.nodeEnv})`);

  // --- Infrastructure ---
  const hasDb = !!(config.dbParams || config.databaseUrl);
  if (hasDb) {
    initPool(config.databaseUrl, config.dbParams);
    console.log('[VaNi] Database pool initialized');
  } else {
    console.log('[VaNi] No database configured — using stub DB');
  }

  if (config.redisUrl && config.redisUrl.startsWith('redis://')) {
    try {
      const redis = initRedis(config.redisUrl);
      await Promise.race([
        redis.connect().then(() => redis.ping()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      initQueue();
      startWorker();
      console.log('[VaNi] Redis + Queue ready');
    } catch (err) {
      try { closeRedis(); } catch { /* ignore */ }
      console.warn('[VaNi] Redis unavailable:', (err as Error).message);
    }
  } else {
    console.log('[VaNi] Redis not configured — rate limiting and queue disabled');
  }

  // --- Orchestrator ---
  const orchestrator = new Orchestrator();
  boot(orchestrator);

  // --- Express Server ---
  const app = express();

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Dev-Tenant-Id', 'X-Dev-User-Id'],
  }));
  app.use(express.json());
  app.use(metricsMiddleware);
  app.use(requestLogger);

  // Public routes
  app.use(healthRouter);
  app.use(metricsRouter);
  app.use('/api/v1', createRecipesRouter(orchestrator.recipeRegistry));

  // Protected routes
  const protectedRouter = express.Router();
  protectedRouter.use(authMiddleware);
  protectedRouter.use(tenantContext);
  protectedRouter.use(rateLimitMiddleware);
  protectedRouter.use('/chat', createChatRouter(orchestrator));
  registerSkillsRoute(protectedRouter, orchestrator);
  protectedRouter.use(jobsRouter);
  app.use('/api/v1', protectedRouter);

  app.use(errorHandler);

  const server = app.listen(port, () => {
    console.log(`[VaNi] Server running on port ${port}`);
    console.log(`[VaNi] Health:   http://localhost:${port}/health`);
    console.log(`[VaNi] Chat:     POST http://localhost:${port}/api/v1/chat`);
    console.log(`[VaNi] Skills:   POST http://localhost:${port}/api/v1/skills/:skill/:function`);
    console.log(`[VaNi] Recipes:  GET http://localhost:${port}/api/v1/recipes`);
    console.log(`[VaNi] Mock mode: ${orchestrator.mockMode ? 'ON' : 'OFF'}`);
  });

  const shutdown = () => {
    console.log('\n[VaNi] Shutting down...');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[VaNi] Failed to start:', err);
  process.exit(1);
});
```

### framework/boot.ts (83 lines)

```typescript
/**
 * Boot Loader — Registers skills, recipes, and job handlers at startup.
 *
 * This is the integration point where product-specific skills and recipes
 * get wired into the framework. In a real product, this file would be
 * generated or hand-written to load KI-Prime skills, etc.
 *
 * For now, it loads the demo skill and demo recipe for E2E testing.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Orchestrator } from './orchestrator.js';
import { registerHandler } from './skill-executor/index.js';
import type { SkillDefinition, Recipe } from '../shared/types/index.js';

// --- Demo Skill Handlers ---
import { getGreeting } from '../skills/demo-skill/functions/get-greeting.js';
import { getStats } from '../skills/demo-skill/functions/get-stats.js';

/**
 * Register all skills, recipes, and job handlers.
 */
export function boot(orchestrator: Orchestrator): void {
  console.info('[Boot] Loading skills and recipes...');

  // =============================================
  // 1. REGISTER DEMO SKILL
  // =============================================
  const demoSkill: SkillDefinition = {
    name: 'demo-skill',
    version: '0.1.0',
    description: 'Demo skill for E2E pipeline testing',
    tier: 'starter',
    default_recipe: 'demo-dashboard',
    functions: [
      {
        name: 'get_greeting',
        description: 'Returns a personalized greeting with the tenant name',
        parameters: [
          {
            name: 'name',
            type: 'string',
            required: true,
            description: 'Name of person to greet',
          },
        ],
        returns: 'Greeting message with tenant info',
        default_recipe: 'demo-dashboard',
      },
      {
        name: 'get_stats',
        description: 'Returns framework runtime stats like uptime and system info',
        parameters: [],
        returns: 'System stats (uptime, skill count, memory)',
        default_recipe: 'demo-dashboard',
      },
    ],
  };

  orchestrator.skillRegistry.register(demoSkill);
  registerHandler('demo-skill', 'get_greeting', getGreeting);
  registerHandler('demo-skill', 'get_stats', getStats);

  // =============================================
  // 2. REGISTER DEMO RECIPE
  // =============================================
  try {
    const recipePath = resolve(process.cwd(), 'recipes/demo-dashboard.json');
    const recipeJson = readFileSync(recipePath, 'utf-8');
    const recipe: Recipe = JSON.parse(recipeJson);
    orchestrator.recipeRegistry.register(recipe);
  } catch (err) {
    console.warn('[Boot] Could not load demo-dashboard recipe:', (err as Error).message);
  }

  // =============================================
  // 3. SUMMARY
  // =============================================
  const skillCount = orchestrator.skillRegistry.skills.size;
  const recipeCount = orchestrator.recipeRegistry.recipes.size;
  console.info(`[Boot] Ready — ${skillCount} skill(s), ${recipeCount} recipe(s)`);
}
```

### framework/config.ts (53 lines)

```typescript
/**
 * Framework Configuration — Reads environment variables
 */

export interface DbParamsConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface FrameworkConfig {
  port: number;
  nodeEnv: 'development' | 'staging' | 'production';
  databaseUrl: string;
  dbParams: DbParamsConfig | null;
  redisUrl: string;
  vllmEndpoint: string;
  vllmModel: string;
  claudeApiKey: string;
  claudeModel: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  jwtSecret: string;
  productSlug: string;
}

export function loadConfig(): FrameworkConfig {
  return {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: (process.env.NODE_ENV as FrameworkConfig['nodeEnv']) || 'development',
    databaseUrl: process.env.DATABASE_URL || '',
    dbParams: process.env.DB_HOST ? {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'postgres',
    } : null,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    vllmEndpoint: process.env.VLLM_ENDPOINT || 'http://localhost:8000/v1',
    vllmModel: process.env.VLLM_MODEL || 'liquidai/lfm2-2.6b',
    claudeApiKey: process.env.CLAUDE_API_KEY || '',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
    jwtSecret: process.env.JWT_SECRET || '',
    productSlug: process.env.PRODUCT_SLUG || 'vani',
  };
}
```

### package.json (36 lines)

```json
{
  "name": "vani-framework",
  "version": "0.1.0",
  "private": true,
  "description": "VaNi Product Framework — AI-powered product platform",
  "scripts": {
    "dev": "tsx watch framework/server.ts",
    "build": "tsc",
    "start": "node dist/framework/server.js",
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "@types/cors": "^2.8.19",
    "bullmq": "^5.71.0",
    "cors": "^2.8.6",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "ioredis": "^5.10.1",
    "pg": "^8.20.0",
    "prom-client": "^15.1.3"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^25.5.0",
    "@types/pg": "^8.18.0",
    "@typescript-eslint/eslint-plugin": "^8.57.1",
    "@typescript-eslint/parser": "^8.57.1",
    "eslint": "^10.0.3",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

---

## SECTION 3: Middleware Pipeline

### framework/gateway/auth.ts (97 lines)

```typescript
/**
 * Auth Middleware — Extracts and validates JWT from Authorization header
 * Task: F-09
 *
 * In production this verifies against Supabase JWT / the configured JWT_SECRET.
 * For dev, if JWT_SECRET is empty, it accepts a mock header: X-Dev-Tenant-Id + X-Dev-User-Id.
 */

import type { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config.js';
import type { JWTPayload } from '../../shared/types/index.js';
import { HTTP_STATUS, ERROR_CODES } from '../../shared/constants/index.js';

// Extend Express Request to carry the decoded JWT payload
declare global {
  namespace Express {
    interface Request {
      auth?: JWTPayload;
    }
  }
}

/**
 * Decode a JWT payload (base64url segment 1).
 * Does NOT verify signature — in production, use a proper JWT library or Supabase client.
 * This is a framework stub; F-09 ships the contract, and a real verifier swaps in later.
 */
function decodeJwtPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = loadConfig();

  // --- Dev bypass: in development mode, accept dev headers instead of JWT ---
  if (config.nodeEnv === 'development') {
    const tenantId = req.headers['x-dev-tenant-id'] as string | undefined;

    if (tenantId) {
      const userId = (req.headers['x-dev-user-id'] as string) || 'dev-user';
      console.info(`[DEBUG][Auth] Dev bypass activated for ${req.method} ${req.originalUrl}`);
      console.info(`[DEBUG][Auth]   X-Dev-Tenant-Id header: "${tenantId}"`);
      console.info(`[DEBUG][Auth]   X-Dev-User-Id header: "${req.headers['x-dev-user-id'] || '(not set, defaulting to dev-user)'}"`);
      console.info(`[DEBUG][Auth]   Setting req.auth = { sub: "${userId}", tenant_id: "${tenantId}", role: "owner", tier: "professional" }`);
      req.auth = {
        sub: userId,
        tenant_id: tenantId,
        role: 'owner',
        tier: 'professional',
        email: 'dev@vani.local',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      next();
      return;
    }
  }

  // --- Extract Bearer token ---
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Missing or invalid Authorization header',
      code: ERROR_CODES.AUTH_MISSING,
      status: HTTP_STATUS.UNAUTHORIZED,
    });
    return;
  }

  const token = header.slice(7);
  const payload = decodeJwtPayload(token);

  if (!payload) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid or expired token',
      code: ERROR_CODES.AUTH_INVALID,
      status: HTTP_STATUS.UNAUTHORIZED,
    });
    return;
  }

  req.auth = payload;
  next();
}
```

### framework/gateway/tenant-context.ts (27 lines)

```typescript
/**
 * Tenant Context Middleware — Sets tenant scope from JWT payload
 * Task: F-09
 *
 * After authMiddleware runs, this middleware ensures req.auth.tenant_id
 * is available and could (in the future) set the PostgreSQL session variable
 * for RLS: SET app.tenant_id = '<tenant_id>'.
 */

import type { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ERROR_CODES } from '../../shared/constants/index.js';

export function tenantContext(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.tenant_id) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Tenant context missing from auth token',
      code: ERROR_CODES.TENANT_NOT_FOUND,
      status: HTTP_STATUS.UNAUTHORIZED,
    });
    return;
  }

  // Future: set PostgreSQL session variable for RLS
  // await db.query("SELECT set_tenant_context($1)", [req.auth.tenant_id]);

  next();
}
```

### framework/gateway/index.ts (6 lines)

```typescript
/**
 * Gateway Layer — Auth middleware, tenant context, rate limiting
 * Task: F-09
 */
export { authMiddleware } from './auth.js';
export { tenantContext } from './tenant-context.js';
```

### framework/middleware/error-handler.ts (24 lines)

```typescript
/**
 * Global error handler middleware
 */

import type { Request, Response, NextFunction } from 'express';
import type { APIError } from '../../shared/types/index.js';

export function errorHandler(
  err: Error & { status?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[Error] ${err.message}`, err.stack);

  const status = err.status || 500;
  const response: APIError = {
    error: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    status,
  };

  res.status(status).json(response);
}
```

### framework/middleware/metrics.ts (112 lines)

```typescript
/**
 * Prometheus Metrics + Request Timing Middleware
 * S-07: Monitoring hooks
 *
 * Exposes /metrics in Prometheus text format.
 * Tracks: request count, latency histogram, error rate, queue depth, skill execution.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// --- Register default metrics (event loop lag, heap, GC, etc.) ---
client.collectDefaultMetrics({ prefix: 'vani_' });

// --- Custom Metrics ---

export const httpRequestDuration = new client.Histogram({
  name: 'vani_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestTotal = new client.Counter({
  name: 'vani_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

export const httpErrorTotal = new client.Counter({
  name: 'vani_http_errors_total',
  help: 'Total number of HTTP errors (4xx + 5xx)',
  labelNames: ['method', 'path', 'status'],
});

export const skillExecutionDuration = new client.Histogram({
  name: 'vani_skill_execution_duration_seconds',
  help: 'Skill function execution duration in seconds',
  labelNames: ['skill', 'function', 'success'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
});

export const skillExecutionTotal = new client.Counter({
  name: 'vani_skill_executions_total',
  help: 'Total number of skill executions',
  labelNames: ['skill', 'function', 'success'],
});

export const skillErrorTotal = new client.Counter({
  name: 'vani_skill_errors_total',
  help: 'Total number of skill execution errors',
  labelNames: ['skill', 'function'],
});

export const queueDepthGauge = new client.Gauge({
  name: 'vani_queue_depth',
  help: 'Number of pending + active + delayed jobs in the queue',
});

export const escalationTotal = new client.Counter({
  name: 'vani_escalations_total',
  help: 'Total number of Claude API escalations',
  labelNames: ['tenant_id'],
});

/**
 * Middleware: track request timing and counts.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationS = durationNs / 1e9;
    const path = normalizePath(req.route?.path || req.path);
    const labels = {
      method: req.method,
      path,
      status: String(res.statusCode),
    };

    httpRequestDuration.observe(labels, durationS);
    httpRequestTotal.inc(labels);

    if (res.statusCode >= 400) {
      httpErrorTotal.inc(labels);
    }
  });

  next();
}

/**
 * Normalize path to avoid high-cardinality labels.
 * E.g., /api/v1/jobs/abc123 → /api/v1/jobs/:id
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Prometheus /metrics endpoint.
 */
export const metricsRouter = Router();

metricsRouter.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});
```

### framework/middleware/rate-limiter.ts (115 lines)

```typescript
/**
 * Rate Limiter Middleware — Per-tenant, tier-aware, Redis-backed
 * S-04: Rate limiting
 *
 * Tracks two counters per tenant per day:
 * - vani:{tenant_id}:{date} — VaNi interaction count
 * - escalation:{tenant_id}:{date} — Claude escalation count
 *
 * Keys expire at midnight IST (UTC+5:30).
 */

import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../redis/index.js';
import { RATE_LIMITS, HTTP_STATUS, ERROR_CODES } from '../../shared/constants/index.js';
import type { SubscriptionTier } from '../../shared/types/index.js';

function getISTDateKey(): string {
  // Current time in IST
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getSecondsUntilMidnightIST(): number {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const midnightIST = new Date(ist);
  midnightIST.setUTCHours(18, 30, 0, 0); // Midnight IST = 18:30 UTC
  if (midnightIST <= now) {
    midnightIST.setUTCDate(midnightIST.getUTCDate() + 1);
  }
  return Math.ceil((midnightIST.getTime() - now.getTime()) / 1000);
}

export async function incrementVaniCounter(tenantId: string): Promise<number> {
  const redis = getRedis();
  const key = `vani:${tenantId}:${getISTDateKey()}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, getSecondsUntilMidnightIST());
  }
  return count;
}

export async function incrementEscalationCounter(tenantId: string): Promise<number> {
  const redis = getRedis();
  const key = `escalation:${tenantId}:${getISTDateKey()}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, getSecondsUntilMidnightIST());
  }
  return count;
}

export async function getVaniCount(tenantId: string): Promise<number> {
  const redis = getRedis();
  const val = await redis.get(`vani:${tenantId}:${getISTDateKey()}`);
  return val ? parseInt(val, 10) : 0;
}

export async function getEscalationCount(tenantId: string): Promise<number> {
  const redis = getRedis();
  const val = await redis.get(`escalation:${tenantId}:${getISTDateKey()}`);
  return val ? parseInt(val, 10) : 0;
}

/**
 * Check if the tenant can escalate to Claude (checks tier limit).
 */
export async function canEscalate(tenantId: string, tier: SubscriptionTier): Promise<boolean> {
  const limits = RATE_LIMITS[tier];
  if (limits.claudeEscalations === Infinity) return true;
  const count = await getEscalationCount(tenantId);
  return count < limits.claudeEscalations;
}

/**
 * Express middleware: check VaNi interaction rate limit before processing.
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    next();
    return;
  }

  const tier = req.auth.tier as SubscriptionTier;
  const tenantId = req.auth.tenant_id;
  const limits = RATE_LIMITS[tier];

  if (!limits || limits.vaniInteractions === Infinity) {
    next();
    return;
  }

  getVaniCount(tenantId)
    .then((count) => {
      if (count >= limits.vaniInteractions) {
        const retryAfter = getSecondsUntilMidnightIST();
        res.set('Retry-After', String(retryAfter));
        res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
          error: `Daily interaction limit reached (${limits.vaniInteractions} for ${tier} tier)`,
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          details: { limit: limits.vaniInteractions, used: count, retryAfterSeconds: retryAfter },
        });
        return;
      }
      next();
    })
    .catch((err) => {
      // If Redis is down, allow the request (fail open)
      console.error('[RateLimiter] Redis error, failing open:', err.message);
      next();
    });
}
```

### framework/middleware/request-logger.ts (14 lines)

```typescript
/**
 * Simple request logger middleware
 */

import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.info(`[${req.method}] ${req.path} → ${_res.statusCode} (${duration}ms)`);
  });
  next();
}
```

---

## SECTION 4: Skill Executor

### framework/skill-executor/executor.ts (148 lines)

```typescript
/**
 * Skill Executor — Runs a skill function within a SkillContext
 * S-02: Auto-wraps each skill call in a transaction
 * S-07: Writes to vn_skill_execution_log, tracks Prometheus metrics
 */

import type {
  SkillContext,
  SkillCall,
  SkillResult,
} from '../../shared/types/index.js';
import type { SkillRegistryImpl } from './registry.js';
import { TIER_LEVELS, ERROR_CODES, TABLES } from '../../shared/constants/index.js';
import { skillExecutionDuration, skillExecutionTotal, skillErrorTotal } from '../middleware/metrics.js';

export type SkillHandler = (
  params: Record<string, unknown>,
  ctx: SkillContext
) => Promise<SkillResult>;

const handlers = new Map<string, SkillHandler>();

export function registerHandler(skillName: string, functionName: string, handler: SkillHandler): void {
  handlers.set(`${skillName}.${functionName}`, handler);
}

/**
 * Execute a single skill call.
 * Automatically wraps in a DB transaction and logs to vn_skill_execution_log.
 */
export async function executeSkill(
  call: SkillCall,
  ctx: SkillContext,
  registry: SkillRegistryImpl
): Promise<SkillResult> {
  const start = Date.now();
  const qualifiedName = `${call.skill}.${call.function}`;

  // 1. Verify skill exists in registry
  const fnDef = registry.getFunction(call.skill, call.function);
  if (!fnDef) {
    return {
      success: false,
      recipe: '',
      data: {},
      error: `Skill function not found: ${qualifiedName}`,
    };
  }

  // 2. Check tier access
  const skill = registry.skills.get(call.skill);
  if (skill) {
    const requiredLevel = TIER_LEVELS[skill.tier] ?? 0;
    const userLevel = TIER_LEVELS[ctx.tier] ?? 0;
    if (userLevel < requiredLevel) {
      return {
        success: false,
        recipe: '',
        data: {},
        error: `${ERROR_CODES.TIER_INSUFFICIENT}: ${ctx.tier} cannot access ${call.skill} (requires ${skill.tier})`,
      };
    }
  }

  // 3. Look up handler
  const handler = handlers.get(qualifiedName);
  if (!handler) {
    return {
      success: false,
      recipe: '',
      data: {},
      error: `No handler registered for ${qualifiedName}`,
    };
  }

  // 4. Execute inside a transaction
  let result: SkillResult;
  try {
    result = await ctx.db.transaction(async (_tx) => {
      const handlerResult = await handler(call.params, ctx);
      // Ensure success is always a boolean — guards against product skills that omit it
      if (handlerResult.success === undefined) {
        handlerResult.success = true;
      }
      return handlerResult;
    });

    const elapsed = Date.now() - start;

    // Prometheus metrics
    skillExecutionDuration.observe({ skill: call.skill, function: call.function, success: 'true' }, elapsed / 1000);
    skillExecutionTotal.inc({ skill: call.skill, function: call.function, success: 'true' });

    // Write to execution log (fire-and-forget, don't block the response)
    logExecution(ctx, call, result, elapsed).catch((err) =>
      console.error('[SkillExecutor] Failed to write execution log:', err.message)
    );

    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    // Prometheus metrics
    skillExecutionDuration.observe({ skill: call.skill, function: call.function, success: 'false' }, elapsed / 1000);
    skillExecutionTotal.inc({ skill: call.skill, function: call.function, success: 'false' });
    skillErrorTotal.inc({ skill: call.skill, function: call.function });

    result = {
      success: false,
      recipe: fnDef.default_recipe || '',
      data: {},
      error: `${ERROR_CODES.SKILL_EXECUTION_FAILED}: ${message}`,
    };

    logExecution(ctx, call, result, elapsed).catch((logErr) =>
      console.error('[SkillExecutor] Failed to write execution log:', logErr.message)
    );

    return result;
  }
}

/**
 * Write to vn_skill_execution_log for audit trail.
 */
async function logExecution(
  ctx: SkillContext,
  call: SkillCall,
  result: SkillResult,
  executionMs: number
): Promise<void> {
  await ctx.db.execute(
    `INSERT INTO ${TABLES.SKILL_EXECUTION_LOG}
     (tenant_id, user_id, skill_name, function_name, params, result_success, result_recipe, error_message, execution_ms)
     VALUES (:tenantId, :userId, :skillName, :functionName, :params, :success, :recipe, :error, :executionMs)`,
    {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      skillName: call.skill,
      functionName: call.function,
      params: JSON.stringify(call.params),
      success: result.success,
      recipe: result.recipe || null,
      error: result.error || null,
      executionMs,
    }
  );
}```

### framework/skill-executor/registry.ts (81 lines)

```typescript
/**
 * Skill Registry — In-memory registry of all available skills
 * Task: F-11
 *
 * Product authors register skills at startup. The registry:
 * - Stores SkillDefinitions keyed by name
 * - Filters skills by subscription tier
 * - Builds LFM2-compatible tool definitions for the VaNi engine
 */

import type {
  SkillDefinition,
  SkillFunctionDef,
  SkillRegistry,
  SubscriptionTier,
  LFM2ToolDef,
} from '../../shared/types/index.js';
import { TIER_LEVELS } from '../../shared/constants/index.js';

export class SkillRegistryImpl implements SkillRegistry {
  skills: Map<string, SkillDefinition> = new Map();

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
    console.info(`[SkillRegistry] Registered: ${skill.name} v${skill.version}`);
  }

  getSkillsForTier(tier: SubscriptionTier): SkillDefinition[] {
    const tierLevel = TIER_LEVELS[tier] ?? 0;
    return Array.from(this.skills.values()).filter(
      (s) => (TIER_LEVELS[s.tier] ?? 0) <= tierLevel
    );
  }

  getFunction(skillName: string, functionName: string): SkillFunctionDef | null {
    const skill = this.skills.get(skillName);
    if (!skill) return null;
    return skill.functions.find((f) => f.name === functionName) ?? null;
  }

  /**
   * Build tool definitions in the OpenAI-compatible format that vLLM/LFM2 expects.
   * Each skill function becomes one tool, named "skillName.functionName".
   */
  buildToolDefinitions(tier: SubscriptionTier): LFM2ToolDef[] {
    const skills = this.getSkillsForTier(tier);
    const tools: LFM2ToolDef[] = [];

    for (const skill of skills) {
      for (const fn of skill.functions) {
        const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
        const required: string[] = [];

        for (const param of fn.parameters) {
          properties[param.name] = {
            type: param.type === 'string[]' || param.type === 'number[]' ? 'array' : param.type,
            description: param.description,
          };
          if (param.required) {
            required.push(param.name);
          }
        }

        tools.push({
          type: 'function',
          function: {
            name: `${skill.name}.${fn.name}`,
            description: fn.description,
            parameters: {
              type: 'object',
              properties,
              required,
            },
          },
        });
      }
    }

    return tools;
  }
}
```

### framework/skill-executor/index.ts (7 lines)

```typescript
/**
 * Skill Executor — Loads, validates, and executes skill functions
 * Task: F-11
 */
export { SkillRegistryImpl } from './registry.js';
export { executeSkill, registerHandler } from './executor.js';
export type { SkillHandler } from './executor.js';
```

### framework/context-builder/build-context.ts (61 lines)

```typescript
/**
 * Context Builder — Assembles a SkillContext from the authenticated request
 * Updated for scalability: real DB pool, enqueue, memory store
 */

import type { Request } from 'express';
import type {
  SkillContext,
  MemoryStore,
  Channel,
  ChatRequest,
} from '../../shared/types/index.js';
import { DEFAULT_CHANNEL } from '../../shared/constants/index.js';
import { isPoolReady, createTenantScopedDB, createStubDB } from '../db/index.js';
import { enqueueJob } from '../queue/index.js';

/**
 * Build a SkillContext from an authenticated Express request.
 */
export function buildSkillContext(
  req: Request,
  escalateFn: (prompt: string) => Promise<string>,
  memoryStore: MemoryStore
): SkillContext {
  const auth = req.auth!;
  const body = req.body as ChatRequest;

  const poolReady = isPoolReady();
  console.info(`[DEBUG][ContextBuilder] Building SkillContext from auth payload:`);
  console.info(`[DEBUG][ContextBuilder]   tenant_id = "${auth.tenant_id}" (type: ${typeof auth.tenant_id})`);
  console.info(`[DEBUG][ContextBuilder]   user_id   = "${auth.sub}" (type: ${typeof auth.sub})`);
  console.info(`[DEBUG][ContextBuilder]   tier      = "${auth.tier}"`);
  console.info(`[DEBUG][ContextBuilder]   pool_ready = ${poolReady} → using ${poolReady ? 'createTenantScopedDB' : 'createStubDB'}`);

  const db = poolReady ? createTenantScopedDB(auth.tenant_id) : createStubDB(auth.tenant_id);
  console.info(`[DEBUG][ContextBuilder] SkillContext built successfully. DB will call set_tenant_context("${auth.tenant_id}") on each query.`);

  return {
    tenantId: auth.tenant_id,
    userId: auth.sub,
    tier: auth.tier,
    db,
    memory: memoryStore,
    escalate: escalateFn,
    enqueue: async (jobType: string, payload: Record<string, unknown>) => {
      try {
        return await enqueueJob(jobType, {  
          ...payload,
          _tenant_id: auth.tenant_id,
          _userId: auth.sub,
        });
      } catch {
        console.warn(`[SkillContext] enqueue(${jobType}) failed — queue not available`);
        return 'unavailable';
      }
    },
    entityId: body.entity_id,
    entityType: undefined,
    channel: (body.channel as Channel) || DEFAULT_CHANNEL,
  };
}
```

### framework/context-builder/index.ts (5 lines)

```typescript
/**
 * Context Builder — Assembles SkillContext from authenticated request
 * Task: F-10
 */
export { buildSkillContext } from './build-context.js';
```

---

## SECTION 5: Database Connection

### framework/db/pool.ts (334 lines)

```typescript
/**
 * Database Connection Pool — pg Pool with tenant-scoped connections
 * S-01: Connection pooling
 * S-02: Transaction support
 * S-03: FOR UPDATE / optimistic locking
 *
 * Every connection checks out from the pool, runs SET app.tenant_id,
 * then executes queries. This ensures RLS policies work correctly
 * even with connection pooling (PgBouncer).
 */

import pg from 'pg';
import type { TenantScopedDB } from '../../shared/types/index.js';
import { POOL_DEFAULTS, TABLES } from '../../shared/constants/index.js';
import type { DbParamsConfig } from '../config.js';

const { Pool } = pg;
type PoolClient = pg.PoolClient;

let pool: pg.Pool | null = null;

/**
 * Initialize the connection pool.
 * Prefer individual DB params (avoids URL-encoding issues with special-char passwords).
 * Falls back to DATABASE_URL connection string.
 */
export function initPool(databaseUrl: string, dbParams?: DbParamsConfig | null): pg.Pool {
  if (pool) return pool;

  const sslConfig = { rejectUnauthorized: false };
  const sharedOpts = {
    max: POOL_DEFAULTS.MAX_CONNECTIONS,
    idleTimeoutMillis: POOL_DEFAULTS.IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: POOL_DEFAULTS.CONNECTION_TIMEOUT_MS,
    ssl: sslConfig,
  };

  if (dbParams) {
    // Individual params — password is passed as-is, no URL-encoding needed
    const poolConfig = {
      host: dbParams.host,
      port: dbParams.port,
      user: dbParams.user,
      password: dbParams.password,
      database: dbParams.database,
      ...sharedOpts,
    };
    const pw = poolConfig.password || '';
    const pwHint = pw.length > 2 ? `${pw[0]}..${pw[pw.length - 1]} (len=${pw.length})` : `(len=${pw.length})`;
    console.info(`[DB Pool] user=${JSON.stringify(poolConfig.user)} password=${pwHint} host=${poolConfig.host} port=${poolConfig.port} db=${poolConfig.database}`);
    pool = new Pool(poolConfig);
  } else {
    // Fallback: connection string
    // pg v8 treats sslmode=require as verify-full, which rejects Supabase's
    // self-signed certs. Strip it so our explicit ssl config takes effect.
    const cleanUrl = databaseUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
    pool = new Pool({ connectionString: cleanUrl, ...sharedOpts });
    console.info('[DB Pool] Using connection string');
  }

  pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error on idle client:', err.message);
  });

  console.info(`[DB Pool] Initialized (max=${POOL_DEFAULTS.MAX_CONNECTIONS})`);
  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('DB pool not initialized — call initPool() first');
  return pool;
}

export function isPoolReady(): boolean {
  return pool !== null;
}

/**
 * Stub TenantScopedDB for dev/mock mode when no Postgres is available.
 * All queries return empty results; writes are no-ops.
 */
export function createStubDB(tenantId: string): TenantScopedDB {
  return {
    async query() { return { rows: [] }; },
    async queryOne() { return null; },
    async queryForUpdate() { return []; },
    async execute() { return { rowCount: 0 }; },
    async transaction<T>(fn: (tx: TenantScopedDB) => Promise<T>): Promise<T> {
      return fn(createStubDB(tenantId));
    },
  };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.info('[DB Pool] Closed');
  }
}

/**
 * Check if the pool is healthy by running a simple query.
 */
export async function checkPoolHealth(): Promise<boolean> {
  try {
    const p = getPool();
    // Use simple query (no prepared statement) — compatible with Supabase transaction pooler
    const result = await p.query({ text: 'SELECT 1 AS ok', rowMode: 'array' });
    return result.rows.length > 0;
  } catch (err) {
    console.error('[DB Pool] Health check failed:', err);
    return false;
  }
}

/**
 * Convert Record<string, unknown> params to positional ($1, $2...) format.
 * Input SQL uses :paramName syntax. Returns { text, values }.
 */
function toPositional(
  sql: string,
  params: Record<string, unknown>
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  let idx = 0;
  const text = sql.replace(/(?::|\$)(\w+)/g, (_match, name) => {
    idx++;
    values.push(params[name] ?? params[`$${name}`] ?? params[`:${name}`]);
    return `$${idx}`;
  });
  return { text, values };
}

/**
 * Build a TenantScopedDB from a raw PoolClient.
 * Every method sets tenant context before querying.
 */
function buildDBFromClient(client: PoolClient, tenantId: string): TenantScopedDB {
  const setTenantCtx = async () => {
    await client.query('SELECT set_tenant_context($1)', [tenantId]);
  };

  return {
    async query<T = Record<string, unknown>>(sql: string, params: Record<string, unknown>): Promise<{ rows: T[] }> {
      await setTenantCtx();
      const { text, values } = toPositional(sql, params);
      console.info(`[DEBUG][DB][tx] query: ${text}`);
      console.info(`[DEBUG][DB][tx]   values: ${JSON.stringify(values)}`);
      const result = await client.query(text, values);
      console.info(`[DEBUG][DB][tx]   → ${result.rows.length} row(s) returned`);
      return { rows: result.rows as T[] };
    },

    async queryOne<T = Record<string, unknown>>(sql: string, params: Record<string, unknown>): Promise<T | null> {
      await setTenantCtx();
      const { text, values } = toPositional(sql, params);
      console.info(`[DEBUG][DB][tx] queryOne: ${text}`);
      console.info(`[DEBUG][DB][tx]   values: ${JSON.stringify(values)}`);
      const result = await client.query(text, values);
      console.info(`[DEBUG][DB][tx]   → ${result.rows.length} row(s)${result.rows[0] ? ': ' + JSON.stringify(result.rows[0]) : ' (EMPTY — no rows matched!)'}`);
      return (result.rows[0] as T) ?? null;
    },

    async queryForUpdate<T = Record<string, unknown>>(sql: string, params: Record<string, unknown>): Promise<T[]> {
      await setTenantCtx();
      const forUpdateSql = sql.trimEnd().replace(/;?\s*$/, '') + ' FOR UPDATE';
      const { text, values } = toPositional(forUpdateSql, params);
      console.info(`[DEBUG][DB][tx] queryForUpdate: ${text}`);
      console.info(`[DEBUG][DB][tx]   values: ${JSON.stringify(values)}`);
      const result = await client.query(text, values);
      console.info(`[DEBUG][DB][tx]   → ${result.rows.length} row(s) returned`);
      return result.rows as T[];
    },

    async execute(sql: string, params: Record<string, unknown>): Promise<{ rowCount: number }> {
      await setTenantCtx();
      const { text, values } = toPositional(sql, params);
      console.info(`[DEBUG][DB][tx] execute: ${text}`);
      console.info(`[DEBUG][DB][tx]   values: ${JSON.stringify(values)}`);
      const result = await client.query(text, values);
      console.info(`[DEBUG][DB][tx]   → rowCount: ${result.rowCount ?? 0}`);
      return { rowCount: result.rowCount ?? 0 };
    },

    async transaction<T>(fn: (tx: TenantScopedDB) => Promise<T>): Promise<T> {
      // Already inside a client — just wrap with BEGIN/COMMIT
      await client.query('BEGIN');
      try {
        const result = await fn(buildDBFromClient(client, tenantId));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    },
  };
}

/**
 * Create a TenantScopedDB that checks out a connection per operation.
 * For transactions, the connection is held for the duration of the tx.
 */
export function createTenantScopedDB(tenantId: string): TenantScopedDB {
  const p = getPool();

  const withClient = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await p.connect();
    try {
      console.info(`[DEBUG][DB] set_tenant_context("${tenantId}")`);
      await client.query('SELECT set_tenant_context($1)', [tenantId]);
      return await fn(client);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[DEBUG][DB] Query failed for tenant="${tenantId}": ${msg}`);
      throw err;
    } finally {
      client.release();
    }
  };

  return {
    async query<T = Record<string, unknown>>(sql: string, params: Record<string, unknown>): Promise<{ rows: T[] }> {
      return withClient(async (client) => {
        const { text, values } = toPositional(sql, params);
        console.info(`[DEBUG][DB] query: ${text}`);
        console.info(`[DEBUG][DB]   values: ${JSON.stringify(values)}`);
        const result = await client.query(text, values);
        console.info(`[DEBUG][DB]   → ${result.rows.length} row(s) returned`);
        return { rows: result.rows as T[] };
      });
    },

    async queryOne<T = Record<string, unknown>>(sql: string, params: Record<string, unknown>): Promise<T | null> {
      return withClient(async (client) => {
        const { text, values } = toPositional(sql, params);
        console.info(`[DEBUG][DB] queryOne: ${text}`);
        console.info(`[DEBUG][DB]   values: ${JSON.stringify(values)}`);
        const result = await client.query(text, values);
        console.info(`[DEBUG][DB]   → ${result.rows.length} row(s)${result.rows[0] ? ': ' + JSON.stringify(result.rows[0]) : ' (EMPTY — no rows matched!)'}`);
        return (result.rows[0] as T) ?? null;
      });
    },

    async queryForUpdate<T = Record<string, unknown>>(sql: string, params: Record<string, unknown>): Promise<T[]> {
      return withClient(async (client) => {
        const forUpdateSql = sql.trimEnd().replace(/;?\s*$/, '') + ' FOR UPDATE';
        const { text, values } = toPositional(forUpdateSql, params);
        const result = await client.query(text, values);
        return result.rows as T[];
      });
    },

    async execute(sql: string, params: Record<string, unknown>): Promise<{ rowCount: number }> {
      return withClient(async (client) => {
        const { text, values } = toPositional(sql, params);
        const result = await client.query(text, values);
        return { rowCount: result.rowCount ?? 0 };
      });
    },

    async transaction<T>(fn: (tx: TenantScopedDB) => Promise<T>): Promise<T> {
      console.info(`[DEBUG][DB] transaction() called for tenant="${tenantId}" — acquiring client from pool...`);
      let client: PoolClient;
      try {
        client = await p.connect();
        console.info(`[DEBUG][DB] Pool client acquired successfully`);
      } catch (connErr) {
        const msg = connErr instanceof Error ? connErr.message : String(connErr);
        console.error(`[DEBUG][DB] pool.connect() FAILED: ${msg}`);
        throw connErr;
      }
      try {
        console.info(`[DEBUG][DB] Sending BEGIN...`);
        await client.query('BEGIN');
        console.info(`[DEBUG][DB] BEGIN ok. Sending set_tenant_context("${tenantId}")...`);
        try {
          await client.query('SELECT set_tenant_context($1)', [tenantId]);
          console.info(`[DEBUG][DB] set_tenant_context ok`);
        } catch (ctxErr) {
          const msg = ctxErr instanceof Error ? ctxErr.message : String(ctxErr);
          console.error(`[DEBUG][DB] set_tenant_context("${tenantId}") FAILED: ${msg}`);
          console.error(`[DEBUG][DB] This may mean set_tenant_context() function does not exist in the database, or it validates tenant and the tenant_id is wrong`);
          await client.query('ROLLBACK').catch(() => {});
          throw ctxErr;
        }
        try {
          const tx = buildDBFromClient(client, tenantId);
          const result = await fn(tx);
          await client.query('COMMIT');
          console.info(`[DEBUG][DB] Transaction COMMIT for tenant="${tenantId}"`);
          return result;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[DEBUG][DB] Transaction ROLLBACK for tenant="${tenantId}": ${msg}`);
          throw err;
        }
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Optimistic locking helper.
 * Throws StaleVersionError if the row was modified since it was read.
 * Usage: await assertVersion(ctx.db, 'vn_holdings', holdingId, expectedVersion);
 */
export class StaleVersionError extends Error {
  constructor(table: string, id: string) {
    super(`Stale version: ${table} row ${id} was modified by another transaction`);
    this.name = 'StaleVersionError';
  }
}

export async function updateWithVersion(
  db: TenantScopedDB,
  table: string,
  id: string,
  expectedVersion: number,
  setClauses: string,
  params: Record<string, unknown>
): Promise<void> {
  const result = await db.execute(
    `UPDATE ${table} SET ${setClauses}, version = version + 1 WHERE id = :id AND version = :expectedVersion`,
    { ...params, id, expectedVersion }
  );
  if (result.rowCount === 0) {
    throw new StaleVersionError(table, id);
  }
}
```

### framework/db/index.ts (1 lines)

```typescript
export { initPool, getPool, isPoolReady, closePool, checkPoolHealth, createTenantScopedDB, createStubDB, updateWithVersion, StaleVersionError } from './pool.js';
```

### migrations/001_framework_base.sql (233 lines)

```sql
-- ============================================================
-- VaNi Product Framework — Base Migrations (VN_ prefix)
-- All framework tables prefixed with VN_
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- -----------------------------------------------------------
-- VN_TENANTS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    tier            TEXT NOT NULL DEFAULT 'starter'
                        CHECK (tier IN ('starter', 'professional', 'enterprise')),
    preferences     JSONB NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT true,
    supabase_org_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_tenants_slug ON vn_tenants(slug);
CREATE INDEX idx_vn_tenants_active ON vn_tenants(active) WHERE active = true;

-- -----------------------------------------------------------
-- VN_USERS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_users (
    id              UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member'
                        CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    active          BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_users_tenant ON vn_users(tenant_id);
CREATE INDEX idx_vn_users_email ON vn_users(email);
CREATE UNIQUE INDEX idx_vn_users_tenant_email ON vn_users(tenant_id, email);

-- -----------------------------------------------------------
-- VN_CONVERSATIONS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES vn_users(id) ON DELETE CASCADE,
    entity_id       TEXT,
    entity_type     TEXT,
    channel         TEXT NOT NULL DEFAULT 'web'
                        CHECK (channel IN ('web', 'whatsapp', 'mobile', 'api')),
    active          BOOLEAN NOT NULL DEFAULT true,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_conversations_tenant ON vn_conversations(tenant_id);
CREATE INDEX idx_vn_conversations_tenant_entity ON vn_conversations(tenant_id, entity_id);
CREATE INDEX idx_vn_conversations_user ON vn_conversations(user_id);

-- -----------------------------------------------------------
-- VN_CONVERSATION_TURNS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_conversation_turns (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES vn_conversations(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    skill_calls     JSONB,
    skill_results   JSONB,
    recipe_used     TEXT,
    channel         TEXT NOT NULL DEFAULT 'web',
    confidence      REAL,
    escalated       BOOLEAN NOT NULL DEFAULT false,
    token_count     INTEGER,
    latency_ms      INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_turns_conversation ON vn_conversation_turns(conversation_id);
CREATE INDEX idx_vn_turns_tenant ON vn_conversation_turns(tenant_id);
CREATE INDEX idx_vn_turns_tenant_created ON vn_conversation_turns(tenant_id, created_at DESC);

-- -----------------------------------------------------------
-- VN_MEMORY_EMBEDDINGS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_memory_embeddings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    entity_id       TEXT,
    turn_id         UUID REFERENCES vn_conversation_turns(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    embedding       vector(384) NOT NULL,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_memory_hnsw ON vn_memory_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_vn_memory_tenant ON vn_memory_embeddings(tenant_id);
CREATE INDEX idx_vn_memory_tenant_entity ON vn_memory_embeddings(tenant_id, entity_id);

-- -----------------------------------------------------------
-- VN_SKILL_EXECUTION_LOG
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_skill_execution_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    conversation_id UUID REFERENCES vn_conversations(id),
    skill_name      TEXT NOT NULL,
    function_name   TEXT NOT NULL,
    params          JSONB NOT NULL,
    result_success  BOOLEAN NOT NULL,
    result_recipe   TEXT,
    error_message   TEXT,
    execution_ms    INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_skill_log_tenant ON vn_skill_execution_log(tenant_id);
CREATE INDEX idx_vn_skill_log_skill ON vn_skill_execution_log(skill_name, function_name);
CREATE INDEX idx_vn_skill_log_created ON vn_skill_execution_log(created_at DESC);

-- -----------------------------------------------------------
-- VN_ESCALATION_LOG
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_escalation_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES vn_conversations(id),
    reason          TEXT NOT NULL,
    vani_confidence REAL NOT NULL,
    claude_model    TEXT NOT NULL,
    prompt_tokens   INTEGER,
    completion_tokens INTEGER,
    latency_ms      INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_escalation_tenant ON vn_escalation_log(tenant_id);

-- -----------------------------------------------------------
-- VN_SCHEDULED_JOBS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vn_scheduled_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    job_type        TEXT NOT NULL,
    schedule_cron   TEXT NOT NULL,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    config          JSONB DEFAULT '{}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vn_jobs_tenant ON vn_scheduled_jobs(tenant_id);
CREATE INDEX idx_vn_jobs_next_run ON vn_scheduled_jobs(next_run_at) WHERE active = true;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE vn_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vn_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vn_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vn_conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE vn_memory_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vn_skill_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vn_escalation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vn_scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY vn_tenant_isolation ON vn_tenants
    FOR ALL USING (id::text = current_setting('app.tenant_id', true));

CREATE POLICY vn_user_tenant_isolation ON vn_users
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY vn_conversation_tenant_isolation ON vn_conversations
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY vn_turn_tenant_isolation ON vn_conversation_turns
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY vn_memory_tenant_isolation ON vn_memory_embeddings
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY vn_skill_log_tenant_isolation ON vn_skill_execution_log
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY vn_escalation_tenant_isolation ON vn_escalation_log
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY vn_jobs_tenant_isolation ON vn_scheduled_jobs
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id TEXT)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.tenant_id', p_tenant_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vn_tenants_updated
    BEFORE UPDATE ON vn_tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vn_users_updated
    BEFORE UPDATE ON vn_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### seeds/demo-seed.sql (48 lines)

```sql
-- ============================================================
-- VaNi Demo Seed — Inserts minimum data for E2E testing
-- Run after migrations:
--   psql $DATABASE_URL -f seeds/demo-seed.sql
-- ============================================================

-- Use fixed UUIDs so dev headers and docs can reference them.
-- Tenant: Demo Distributor (professional tier)
INSERT INTO vn_tenants (id, name, slug, tier, preferences, active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Demo Distributor',
  'demo-distributor',
  'professional',
  '{"theme": "ocean-blue", "language": "en", "timezone": "Asia/Kolkata", "daily_briefing": true, "whatsapp_enabled": false, "custom": {}}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier;

-- User: Dev Admin linked to Demo Distributor
INSERT INTO vn_users (id, tenant_id, email, display_name, role, active)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'dev@vani.local',
  'Dev Admin',
  'admin',
  true
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name;

-- Print the IDs for reference
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Demo Seed Complete!';
  RAISE NOTICE 'Tenant ID: a0000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'User ID:   b0000000-0000-0000-0000-000000000001';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Use these in dev headers:';
  RAISE NOTICE '  X-Dev-Tenant-Id: a0000000-0000-0000-0000-000000000001';
  RAISE NOTICE '  X-Dev-User-Id:   b0000000-0000-0000-0000-000000000001';
  RAISE NOTICE '============================================';
END $$;
```

---

## SECTION 6: Shell Architecture

### shell/src/app/layout.tsx (76 lines)

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { ShellLayout } from '../components/shell-layout';
import { ShellConfigProvider } from '../lib/shell-config';

const productConfig = {
  product: {
    name: 'KI-Prime',
    tagline: 'Financial Planning for MFDs',
  },
  apiUrl: 'http://localhost:3001',
  auth: {
    customHeaders: {
      'X-Dev-Tenant-Id': 'a0000000-0000-0000-0000-000000000001',
      'X-Dev-User-Id': 'a0000000-0000-0000-0000-000000000002',
    },
  },
  recipes: [
    {
      recipe: 'client-list',
      label: 'Clients',
      route: '/client-list',
      skills: [{ skill: 'client-skill', function: 'get_clients' }],
    },
    {
      recipe: 'portfolio-view',
      label: 'Portfolio Overview',
      route: '/portfolio-view',
      skills: [
        { skill: 'portfolio-skill', function: 'get_holdings', params: { client_id: 1 } },
        { skill: 'portfolio-skill', function: 'get_allocation', params: { client_id: 1 } },
      ],
    },
    {
      recipe: 'client-360',
      label: 'Client 360',
      route: '/client-360',
      skills: [
        { skill: 'client-skill', function: 'get_client_profile', params: { client_id: 1 } },
        { skill: 'portfolio-skill', function: 'get_portfolio_summary', params: { client_id: 1 } },
      ],
    },
    {
      recipe: 'goal-dashboard',
      label: 'Financial Goals',
      route: '/goal-dashboard',
      skills: [{ skill: 'planning-skill', function: 'get_goals', params: { client_id: 1 } }],
    },
    {
      recipe: 'scheme-explorer',
      label: 'Scheme Explorer',
      route: '/scheme-explorer',
      skills: [{ skill: 'market-skill', function: 'search_schemes' }],
    },
    { recipe: 'daily-briefing', label: 'VaNi Command Center', route: '/daily-briefing', skills: [] },
    { recipe: 'goal-deep-dive', label: 'Goal Analysis', route: '/goal-deep-dive', skills: [] },
    { recipe: 'planning-playground', label: 'Planning Playground', route: '/planning-playground', skills: [] },
    { recipe: 'plan-vs-reality', label: 'Plan vs Reality', route: '/plan-vs-reality', skills: [] },
  ],
};

export const metadata: Metadata = {
  title: 'KI-Prime',
  description: 'Financial Planning for MFDs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="ocean-blue">
      <body className="antialiased">
        <ShellConfigProvider config={productConfig}>
          <ShellLayout>{children}</ShellLayout>
        </ShellConfigProvider>
      </body>
    </html>
  );
}```

### shell/src/app/page.tsx (36 lines)

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useShellConfig } from '../lib/shell-config';

export default function Home() {
  const { recipes, product } = useShellConfig();
  const router = useRouter();

  useEffect(() => {
    if (recipes.length > 0) {
      router.replace(recipes[0].route);
    }
  }, [recipes, router]);

  // Show while redirecting, or when no recipes are configured
  if (recipes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{product.name}</h2>
          <p className="text-sm text-muted">
            No recipes configured. Provide a shell config with recipe definitions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="animate-pulse text-muted">Loading...</div>
    </div>
  );
}
```

### shell/src/app/[recipe]/page.tsx (10 lines)

```tsx
'use client';

import { useParams } from 'next/navigation';
import RecipePage from '../../components/recipe-page';

export default function DynamicRecipePage() {
  const params = useParams<{ recipe: string }>();
  const route = `/${params.recipe}`;
  return <RecipePage route={route} />;
}
```

### shell/package.json (28 lines)

```json
{
  "name": "shell",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "chart.js": "^4.5.1",
    "next": "14.2.35",
    "react": "^18",
    "react-chartjs-2": "^5.3.1",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "eslint": "^8",
    "eslint-config-next": "14.2.35",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
```

### shell/src/components/shell-layout.tsx (46 lines)

```tsx
'use client';

import { useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from './theme-provider';
import { useShellConfig } from '../lib/shell-config';
import Sidebar from './sidebar';
import Header from './header';

export function ShellLayout({ children }: { children: ReactNode }) {
  const { product, recipes } = useShellConfig();
  const pathname = usePathname();

  // Build sidebar items from config recipes
  const sidebarRecipes = useMemo(
    () => recipes.map((r) => ({ name: r.route, title: r.label })),
    [recipes],
  );

  // Determine active recipe from current pathname
  const activeRecipe = useMemo(() => {
    // Exact match first
    const exact = recipes.find((r) => r.route === pathname);
    if (exact) return exact.route;
    // Fallback: check if pathname starts with a recipe route
    const match = recipes.find((r) => pathname.startsWith(r.route + '/'));
    return match?.route;
  }, [recipes, pathname]);

  return (
    <ThemeProvider>
      <div className="flex min-h-screen">
        <Sidebar
          productName={product.name}
          productTagline={product.tagline}
          recipes={sidebarRecipes}
          activeRecipe={activeRecipe}
        />
        <div className="flex-1 ml-64 flex flex-col">
          <Header />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
```

### shell/src/components/sidebar.tsx (83 lines)

```tsx
'use client';

import Link from 'next/link';
import { useTheme, THEMES, type ThemeName } from './theme-provider';

interface SidebarProps {
  productName?: string;
  productTagline?: string;
  recipes: { name: string; title: string }[];
  activeRecipe?: string;
}

export default function Sidebar({
  productName = 'VaNi',
  productTagline = 'Product Framework',
  recipes,
  activeRecipe,
}: SidebarProps) {
  const { theme, setTheme } = useTheme();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface border-r border-border flex flex-col z-20">
      {/* Brand */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-primary">{productName}</h1>
        <p className="text-xs text-muted">{productTagline}</p>
      </div>

      {/* Recipe Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-xs font-semibold uppercase text-muted tracking-wider">
          Views
        </p>
        {recipes.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted italic">No recipes loaded</p>
        )}
        {recipes.map((r) => (
          <Link
            key={r.name}
            href={r.name}
            className={`block w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              activeRecipe === r.name
                ? 'bg-primary text-primary-fg'
                : 'hover:bg-surface-hover text-foreground'
            }`}
          >
            {r.title}
          </Link>
        ))}
      </nav>

      {/* Theme Picker */}
      <div className="p-3 border-t border-border">
        <p className="text-xs font-semibold uppercase text-muted tracking-wider mb-2">Theme</p>
        <div className="grid grid-cols-3 gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t.name)}
              title={t.label}
              className={`h-6 rounded-md border-2 transition-all ${
                theme === t.name ? 'border-primary scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: themePreviewColor(t.name) }}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function themePreviewColor(name: ThemeName): string {
  const map: Record<ThemeName, string> = {
    'ocean-blue': '#0ea5e9',
    'emerald-green': '#10b981',
    'sunset-amber': '#f59e0b',
    'royal-purple': '#8b5cf6',
    'coral-reef': '#f43f5e',
    'slate-gray': '#64748b',
  };
  return map[name];
}
```

### shell/src/components/header.tsx (31 lines)

```tsx
'use client';

import { useTheme } from './theme-provider';

export default function Header() {
  const { colorMode, toggleColorMode } = useTheme();

  return (
    <header className="sticky top-0 z-10 h-14 bg-surface border-b border-border flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        {/* Light / Dark toggle */}
        <button
          onClick={toggleColorMode}
          className="p-2 rounded-md hover:bg-surface-hover text-muted transition-colors"
          aria-label="Toggle color mode"
        >
          {colorMode === 'light' ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
```

### shell/src/components/theme-provider.tsx (79 lines)

```tsx
'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

export type ThemeName =
  | 'ocean-blue'
  | 'emerald-green'
  | 'sunset-amber'
  | 'royal-purple'
  | 'coral-reef'
  | 'slate-gray';

export type ColorMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  colorMode: ColorMode;
  toggleColorMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'ocean-blue',
  setTheme: () => {},
  colorMode: 'light',
  toggleColorMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'ocean-blue', label: 'Ocean Blue' },
  { name: 'emerald-green', label: 'Emerald Green' },
  { name: 'sunset-amber', label: 'Sunset Amber' },
  { name: 'royal-purple', label: 'Royal Purple' },
  { name: 'coral-reef', label: 'Coral Reef' },
  { name: 'slate-gray', label: 'Slate Gray' },
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('ocean-blue');
  const [colorMode, setColorMode] = useState<ColorMode>('light');

  useEffect(() => {
    const saved = localStorage.getItem('vani-theme') as ThemeName | null;
    const savedMode = localStorage.getItem('vani-color-mode') as ColorMode | null;
    if (saved) setThemeState(saved);
    if (savedMode) setColorMode(savedMode);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vani-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode === 'dark');
    localStorage.setItem('vani-color-mode', colorMode);
  }, [colorMode]);

  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);
  const toggleColorMode = useCallback(
    () => setColorMode((m) => (m === 'light' ? 'dark' : 'light')),
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colorMode, toggleColorMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### shell/src/lib/shell-config.ts (81 lines)

```typescript
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import React from 'react';

// ── Config interfaces ──

export interface SkillEndpoint {
  /** Skill name, e.g. "client-skill" */
  skill: string;
  /** Function name, e.g. "getDashboard" */
  function: string;
  /** Static params to POST in the request body */
  params?: Record<string, unknown>;
  /**
   * Maps response paths to recipe data keys.
   * e.g. { "result.clients": "clients" } places response.result.clients at data.clients
   * If omitted, the entire response body is merged into recipe data.
   */
  responseMapping?: Record<string, string>;
}

export interface RecipeConfig {
  /** Recipe name — must match a recipe definition from GET /api/v1/recipes/:name */
  recipe: string;
  /** Sidebar display label */
  label: string;
  /** Optional icon identifier */
  icon?: string;
  /** URL route path, e.g. "/dashboard" or "/clients" */
  route: string;
  /** Skill endpoint(s) to call to populate this recipe's data */
  skills: SkillEndpoint[];
  /** Optional auto-refresh interval in seconds */
  refreshInterval?: number;
}

export interface ShellConfig {
  product: {
    name: string;
    tagline?: string;
  };
  /** Override for NEXT_PUBLIC_API_URL */
  apiUrl?: string;
  auth?: {
    /** Dev JWT token for local development */
    devToken?: string;
    customHeaders?: Record<string, string>; 
    /** Header name, defaults to "Authorization" */
    /** headerName?: string; */
  };
  recipes: RecipeConfig[];
}

// ── Default config (framework demo) ──

export const DEFAULT_SHELL_CONFIG: ShellConfig = {
  product: {
    name: 'VaNi',
    tagline: 'Product Framework',
  },
  recipes: [],
};

// ── React context ──

const ShellConfigContext = createContext<ShellConfig>(DEFAULT_SHELL_CONFIG);

export function ShellConfigProvider({
  config,
  children,
}: {
  config: ShellConfig;
  children: ReactNode;
}) {
  return React.createElement(ShellConfigContext.Provider, { value: config }, children);
}

export function useShellConfig(): ShellConfig {
  return useContext(ShellConfigContext);
}
```

### shell/src/lib/shell-config-types.ts (57 lines)

```typescript
// ── Config interfaces (shared between server and client) ──

export interface SkillEndpoint {
  /** Skill name, e.g. "client-skill" */
  skill: string;
  /** Function name, e.g. "getDashboard" */
  function: string;
  /** Static params to POST in the request body */
  params?: Record<string, unknown>;
  /**
   * Maps response paths to recipe data keys.
   * e.g. { "result.clients": "clients" } places response.result.clients at data.clients
   * If omitted, the entire response body is merged into recipe data.
   */
  responseMapping?: Record<string, string>;
}

export interface RecipeConfig {
  /** Recipe name — must match a recipe definition from GET /api/v1/recipes/:name */
  recipe: string;
  /** Sidebar display label */
  label: string;
  /** Optional icon identifier */
  icon?: string;
  /** URL route path, e.g. "/dashboard" or "/clients" */
  route: string;
  /** Skill endpoint(s) to call to populate this recipe's data */
  skills: SkillEndpoint[];
  /** Optional auto-refresh interval in seconds */
  refreshInterval?: number;
}

export interface ShellConfig {
  product: {
    name: string;
    tagline?: string;
  };
  /** Override for NEXT_PUBLIC_API_URL */
  apiUrl?: string;
  auth?: {
    /** Dev JWT token for local development */
    devToken?: string;
    /** Header name, defaults to "Authorization" */
    headerName?: string;
  };
  recipes: RecipeConfig[];
}

// ── Default config (framework demo) ──

export const DEFAULT_SHELL_CONFIG: ShellConfig = {
  product: {
    name: 'VaNi',
    tagline: 'Product Framework',
  },
  recipes: [],
};
```

### shell/src/lib/skill-fetcher.ts (93 lines)

```typescript
import type { SkillEndpoint, ShellConfig } from './shell-config-types';

/**
 * Resolves a dot-notation path from an object.
 * e.g. getNestedValue({ a: { b: 1 } }, "a.b") → 1
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Calls a single skill endpoint and returns the response body.
 */
async function callSkill(
  endpoint: SkillEndpoint,
  apiUrl: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const url = `${apiUrl}/api/v1/skills/${endpoint.skill}/${endpoint.function}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ params: endpoint.params ?? {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Skill ${endpoint.skill}/${endpoint.function} returned ${res.status}: ${text}`,
    );
  }
  return res.json();
}

/**
 * Builds auth headers from ShellConfig.
 */
export function buildAuthHeaders(config: ShellConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.auth?.devToken) {
    const headerName = config.auth.headerName ?? 'Authorization';
    headers[headerName] = config.auth.devToken;
  }
  if (config.auth?.customHeaders) {           // ← add
    Object.assign(headers, config.auth.customHeaders);  // ← add
  }         
  return headers;
}

/**
 * Fetches data for a recipe by calling all its skill endpoints in parallel.
 * Results are merged into a single data object using responseMapping.
 */
export async function fetchRecipeData(
  skills: SkillEndpoint[],
  apiUrl: string,
  authHeaders: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (skills.length === 0) return {};

  const results = await Promise.all(
    skills.map((endpoint) => callSkill(endpoint, apiUrl, authHeaders)),
  );

  const merged: Record<string, unknown> = {};

  skills.forEach((endpoint, idx) => {
    const result = results[idx];
    if (endpoint.responseMapping) {
      // Map specific response paths to data keys
      for (const [sourcePath, targetKey] of Object.entries(endpoint.responseMapping)) {
        merged[targetKey] = getNestedValue(result, sourcePath);
      }
    } else {
      // No mapping — merge entire response (must be an object)
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        Object.assign(merged, result);
      } else {
        // Non-object response: store under skill/function key
        merged[`${endpoint.skill}_${endpoint.function}`] = result;
      }
    }
  });

  return merged;
}
```

### shell/src/lib/json-path.ts (34 lines)

```typescript
/**
 * JSONPath-like resolver for recipe data binding.
 * Supports:
 *   - dot notation: "portfolio.holdings"
 *   - array brackets: "goals[0]", "goals[0].name"
 *   - root "$" prefix: "$.portfolio"
 *   - mixed: "data.goals[0].target_amount"
 */
export function resolvePath(data: Record<string, unknown>, path: string): unknown {
  if (!path || !data) return data;

  const cleaned = path.startsWith('$.') ? path.slice(2) : path.startsWith('$') ? path.slice(1) : path;
  if (!cleaned) return data;

  // Split on dots AND brackets: "goals[0].name" → ["goals", "0", "name"]
  const parts = cleaned.split(/[\.\[\]]/).filter(Boolean);

  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(part);
      if (!isNaN(idx)) {
        current = current[idx];
        continue;
      }
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}```

### shell/src/lib/chart-colors.ts (16 lines)

```typescript
/**
 * Reads CSS custom properties for chart colors at runtime.
 * Chart.js needs actual color values, not var() references.
 */

export function getChartColors(count: number = 6): string[] {
  if (typeof window === 'undefined') {
    return ['#0ea5e9', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
  }
  const style = getComputedStyle(document.documentElement);
  const colors: string[] = [];
  for (let i = 1; i <= count; i++) {
    colors.push(style.getPropertyValue(`--color-chart-${i}`).trim() || '#888');
  }
  return colors;
}
```

### shell/src/lib/default-product-config.ts (8 lines)

```typescript
/**
 * Fallback product config used when shell runs standalone (framework dev).
 * When running inside a product repo (as submodule), the webpack alias
 * in next.config.mjs resolves @product-config to ../../shell.config.ts instead.
 */
import { DEFAULT_SHELL_CONFIG } from './shell-config-types';

export default DEFAULT_SHELL_CONFIG;
```

### shell/src/app/globals.css (120 lines)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ============================================================
   VaNi Theme Engine — 6 themes × light/dark mode
   All colors exposed as CSS custom properties.
   VDF components use these, never hardcoded colors.
   ============================================================ */

:root {
  --color-bg: #f8fafc;
  --color-fg: #0f172a;
  --color-surface: #ffffff;
  --color-surface-hover: #f1f5f9;
  --color-border: #e2e8f0;
  --color-muted: #64748b;
  --color-primary: #0ea5e9;
  --color-primary-fg: #ffffff;
  --color-primary-hover: #0284c7;
  --color-secondary: #6366f1;
  --color-accent: #06b6d4;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #3b82f6;
  --color-chart-1: #0ea5e9;
  --color-chart-2: #6366f1;
  --color-chart-3: #22c55e;
  --color-chart-4: #f59e0b;
  --color-chart-5: #ef4444;
  --color-chart-6: #8b5cf6;
  --sidebar-width: 16rem;
}

.dark {
  --color-bg: #0f172a;
  --color-fg: #f1f5f9;
  --color-surface: #1e293b;
  --color-surface-hover: #334155;
  --color-border: #334155;
  --color-muted: #94a3b8;
}

/* --- ocean-blue (default) --- */
[data-theme="ocean-blue"] {
  --color-primary: #0ea5e9;
  --color-primary-fg: #ffffff;
  --color-primary-hover: #0284c7;
  --color-secondary: #6366f1;
  --color-accent: #06b6d4;
  --color-chart-1: #0ea5e9; --color-chart-2: #6366f1; --color-chart-3: #22c55e;
  --color-chart-4: #f59e0b; --color-chart-5: #ef4444; --color-chart-6: #8b5cf6;
}

/* --- emerald-green --- */
[data-theme="emerald-green"] {
  --color-primary: #10b981;
  --color-primary-fg: #ffffff;
  --color-primary-hover: #059669;
  --color-secondary: #06b6d4;
  --color-accent: #34d399;
  --color-chart-1: #10b981; --color-chart-2: #06b6d4; --color-chart-3: #8b5cf6;
  --color-chart-4: #f59e0b; --color-chart-5: #ef4444; --color-chart-6: #6366f1;
}

/* --- sunset-amber --- */
[data-theme="sunset-amber"] {
  --color-primary: #f59e0b;
  --color-primary-fg: #1c1917;
  --color-primary-hover: #d97706;
  --color-secondary: #ef4444;
  --color-accent: #fb923c;
  --color-chart-1: #f59e0b; --color-chart-2: #ef4444; --color-chart-3: #10b981;
  --color-chart-4: #6366f1; --color-chart-5: #06b6d4; --color-chart-6: #ec4899;
}

/* --- royal-purple --- */
[data-theme="royal-purple"] {
  --color-primary: #8b5cf6;
  --color-primary-fg: #ffffff;
  --color-primary-hover: #7c3aed;
  --color-secondary: #ec4899;
  --color-accent: #a78bfa;
  --color-chart-1: #8b5cf6; --color-chart-2: #ec4899; --color-chart-3: #0ea5e9;
  --color-chart-4: #22c55e; --color-chart-5: #f59e0b; --color-chart-6: #06b6d4;
}

/* --- coral-reef --- */
[data-theme="coral-reef"] {
  --color-primary: #f43f5e;
  --color-primary-fg: #ffffff;
  --color-primary-hover: #e11d48;
  --color-secondary: #fb923c;
  --color-accent: #fb7185;
  --color-chart-1: #f43f5e; --color-chart-2: #fb923c; --color-chart-3: #06b6d4;
  --color-chart-4: #8b5cf6; --color-chart-5: #22c55e; --color-chart-6: #f59e0b;
}

/* --- slate-gray --- */
[data-theme="slate-gray"] {
  --color-primary: #64748b;
  --color-primary-fg: #ffffff;
  --color-primary-hover: #475569;
  --color-secondary: #94a3b8;
  --color-accent: #78909c;
  --color-chart-1: #64748b; --color-chart-2: #0ea5e9; --color-chart-3: #22c55e;
  --color-chart-4: #f59e0b; --color-chart-5: #ef4444; --color-chart-6: #8b5cf6;
}

/* --- Base styles --- */
body {
  background-color: var(--color-bg);
  color: var(--color-fg);
  font-family: system-ui, -apple-system, sans-serif;
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--color-bg); }
::-webkit-scrollbar-thumb { background: var(--color-muted); border-radius: 3px; }
```

### shell/tailwind.config.ts (33 lines)

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--color-bg)",
        foreground: "var(--color-fg)",
        surface: "var(--color-surface)",
        "surface-hover": "var(--color-surface-hover)",
        border: "var(--color-border)",
        primary: "var(--color-primary)",
        "primary-fg": "var(--color-primary-fg)",
        "primary-hover": "var(--color-primary-hover)",
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        muted: "var(--color-muted)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
    },
  },
  plugins: [],
};
export default config;
```

---

## SECTION 7: Recipe System

### shell/src/components/recipe-page.tsx (87 lines)

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useShellConfig, type RecipeConfig } from '../lib/shell-config';
import { fetchRecipeData, buildAuthHeaders } from '../lib/skill-fetcher';
import RecipeRenderer from './recipe-renderer';

interface RecipeSlot {
  row: number;
  components: {
    type: string;
    data: string;
    variant?: string;
    span?: number;
    props?: Record<string, unknown>;
  }[];
}

interface Recipe {
  name: string;
  title: string;
  layout: string;
  slots: RecipeSlot[];
}

interface RecipePageProps {
  route: string;
}

export default function RecipePage({ route }: RecipePageProps) {
  const config = useShellConfig();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const rc = config.recipes.find((r) => r.route === route);

    if (!rc) {
      setError(`No recipe config found for route: ${route}`);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const headers = buildAuthHeaders(config);
    const apiUrl = config.apiUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    async function load() {
      try {
        setLoading(true);
        setError(undefined);

        const recipeRes = await fetch(`${apiUrl}/api/v1/recipes/${rc.recipe}`, {
          headers,
        });
        if (!recipeRes.ok) {
          throw new Error(`Failed to fetch recipe definition: ${rc.recipe}`);
        }
        const recipeDef: Recipe = await recipeRes.json();

        let skillData: Record<string, unknown> = {};
        if (rc.skills.length > 0) {
          skillData = await fetchRecipeData(rc.skills, apiUrl, headers);
        }

        if (!cancelled) {
          setRecipe(recipeDef);
          setData(skillData);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  return <RecipeRenderer recipe={recipe} data={data} loading={loading} error={error} />;
}```

### shell/src/components/recipe-renderer.tsx (107 lines)

```tsx
'use client';

import VDF_COMPONENTS from './vdf';
import { resolvePath } from '../lib/json-path';

/**
 * Mirrors the Recipe shape from shared/types — kept locally to avoid
 * a cross-package import (shell is a separate Next.js app).
 */
interface RecipeSlot {
  row: number;
  components: {
    type: string;
    data: string;
    variant?: string;
    span?: number;
    props?: Record<string, unknown>;
  }[];
}

interface Recipe {
  name: string;
  title: string;
  layout: string;
  slots: RecipeSlot[];
}

interface RecipeRendererProps {
  recipe: Recipe | null;
  data: Record<string, unknown>;
  loading?: boolean;
  error?: string;
}

export default function RecipeRenderer({ recipe, data, loading, error }: RecipeRendererProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger text-sm">
        {error}
      </div>
    );
  }

  if (!recipe) {
    // Fallback: raw JSON display
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs text-muted mb-2">No recipe found — raw data:</p>
        <pre className="text-xs overflow-auto max-h-96 text-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }

  // Sort slots by row number
  const sortedSlots = [...recipe.slots].sort((a, b) => a.row - b.row);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{recipe.title}</h2>
      {sortedSlots.map((slot, slotIdx) => {
        const totalSpan = slot.components.reduce((s, c) => s + (c.span || 1), 0);
        return (
          <div
            key={slotIdx}
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(totalSpan, 12)}, minmax(0, 1fr))`,
            }}
          >
            {slot.components.map((comp, compIdx) => {
              const Component = VDF_COMPONENTS[comp.type];
              const resolvedData = resolvePath(data, comp.data);

              if (!Component) {
                return (
                  <div
                    key={compIdx}
                    className="rounded border border-warning/30 bg-warning/5 p-3 text-xs text-warning"
                    style={{ gridColumn: `span ${comp.span || 1}` }}
                  >
                    Unknown component: {comp.type}
                  </div>
                );
              }

              return (
                <div key={compIdx} style={{ gridColumn: `span ${comp.span || 1}` }}>
                  <Component data={resolvedData} variant={comp.variant} {...(comp.props || {})} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

### shell/src/components/vdf/index.ts (50 lines)

```typescript
/**
 * VDF Component Registry — maps component type strings to React components.
 * The recipe renderer uses this to look up which component to render for each slot.
 */

import type { ComponentType } from 'react';
import KpiCard from './kpi-card';
import DataTable from './data-table';
import Doughnut from './doughnut';
import StatRow from './stat-row';
import InsightCard from './insight-card';
import ChatPanel from './chat-panel';
import ProbabilityGauge from './probability-gauge';
import LineChart from './line-chart';
import SliderPanel from './slider-panel';
import Suggestion from './suggestion';
import Badge from './badge';
import BarChart from './bar-chart';
import Sparkline from './sparkline';
import Timeline from './timeline';
import ActionBar from './action-bar';
import FilterRow from './filter-row';
import Wizard from './wizard';
import ApprovalCard from './approval-card';
import BriefingPanel from './briefing-panel';

/* eslint-disable @typescript-eslint/no-explicit-any */
const VDF_COMPONENTS: Record<string, ComponentType<any>> = {
  'kpi-card': KpiCard,
  'data-table': DataTable,
  'doughnut': Doughnut,
  'stat-row': StatRow,
  'insight-card': InsightCard,
  'chat-panel': ChatPanel,
  'probability-gauge': ProbabilityGauge,
  'line-chart': LineChart,
  'slider-panel': SliderPanel,
  'suggestion': Suggestion,
  'badge': Badge,
  'bar-chart': BarChart,
  'sparkline': Sparkline,
  'timeline': Timeline,
  'action-bar': ActionBar,
  'filter-row': FilterRow,
  'wizard': Wizard,
  'approval-card': ApprovalCard,
  'briefing-panel': BriefingPanel,
};

export default VDF_COMPONENTS;
```

### shell/src/components/layouts/index.ts (29 lines)

```typescript
export { default as Dashboard3Row } from './dashboard-3row';
export { default as DetailSidebar } from './detail-sidebar';
export { default as ListDetail } from './list-detail';
export { default as Briefing } from './briefing';
export { default as Comparison } from './comparison';
export { default as WizardFlow } from './wizard-flow';

import type { ComponentType, ReactNode } from 'react';
import Dashboard3Row from './dashboard-3row';
import DetailSidebar from './detail-sidebar';
import ListDetail from './list-detail';
import Briefing from './briefing';
import Comparison from './comparison';
import WizardFlow from './wizard-flow';

export interface LayoutProps {
  children: ReactNode[];
}

const LAYOUT_MAP: Record<string, ComponentType<LayoutProps>> = {
  'dashboard-3row': Dashboard3Row,
  'detail-sidebar': DetailSidebar,
  'list-detail': ListDetail,
  'briefing': Briefing,
  'comparison': Comparison,
  'wizard-flow': WizardFlow,
};

export default LAYOUT_MAP;
```

### recipes/demo-dashboard.json (63 lines)

```json
{
  "name": "demo-dashboard",
  "title": "Demo Dashboard",
  "layout": "dashboard-3row",
  "slots": [
    {
      "row": 1,
      "components": [
        {
          "type": "kpi-card",
          "data": "$.message",
          "variant": "default",
          "span": 2,
          "props": {
            "label": "Greeting",
            "status": "success",
            "prefix": ""
          }
        },
        {
          "type": "kpi-card",
          "data": "$.tenant_name",
          "variant": "default",
          "span": 1,
          "props": {
            "label": "Tenant",
            "status": "info"
          }
        }
      ]
    },
    {
      "row": 2,
      "components": [
        {
          "type": "stat-row",
          "data": "$",
          "props": {
            "stats": [
              { "label": "Uptime", "value": "$.uptime_display" },
              { "label": "Node.js", "value": "$.node_version" },
              { "label": "Heap (MB)", "value": "$.memory_mb", "suffix": " MB" }
            ]
          }
        }
      ]
    },
    {
      "row": 3,
      "components": [
        {
          "type": "chat-panel",
          "data": "$.messages",
          "props": {
            "onSend": "/api/v1/chat",
            "placeholder": "Ask VaNi anything...",
            "contextLabel": "Demo Mode"
          }
        }
      ]
    }
  ]
}
```

---

## SECTION 8: Types & Constants

### shared/types/index.ts (581 lines)

```typescript
/**
 * VaNi Product Framework — Shared Type Definitions
 * 
 * These interfaces define the contracts between all framework layers.
 * Product authors extend these; framework code implements them.
 * 
 * Task: F-03 | Owner: Claude.ai | Depends On: F-01
 */

// ============================================================
// 1. TENANT & AUTH
// ============================================================

export type VaniMode = 'full' | 'explain' | 'off';
export type TenancyModel = 'operator' | 'subscriber';
export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';
export type Channel = 'web' | 'whatsapp' | 'mobile' | 'api';

export interface Tenant {
  id: string;                    // UUID
  name: string;                  // Display name (e.g., distributor firm name)
  tier: SubscriptionTier;
  preferences: TenantPreferences;
  active: boolean;
  created_at: string;            // ISO 8601
  updated_at: string;
}

export interface TenantPreferences {
  theme: string;                 // e.g., 'ocean-blue'
  language: string;              // e.g., 'en', 'hi'
  timezone: string;              // e.g., 'Asia/Kolkata'
  daily_briefing: boolean;
  whatsapp_enabled: boolean;
  custom: Record<string, unknown>; // Product-specific preferences
}

export interface AuthUser {
  id: string;                    // Supabase auth user ID
  tenant_id: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  display_name: string;
}

export interface JWTPayload {
  sub: string;                   // user_id
  tenant_id: string;
  role: string;
  tier: SubscriptionTier;
  email: string;
  iat: number;
  exp: number;
}

// ============================================================
// 2. SKILL SYSTEM
// ============================================================

export interface SkillContext {
  tenantId: string;              // From JWT, NEVER from LLM
  userId: string;                // Authenticated user
  tier: SubscriptionTier;
  db: TenantScopedDB;           // Pre-scoped database client
  memory: MemoryStore;           // Tenant-scoped conversation memory
  escalate: (prompt: string) => Promise<string>; // Claude API fallback
  enqueue: (jobType: string, payload: Record<string, unknown>) => Promise<string>; // BullMQ async job dispatch
  entityId?: string;             // Optional entity context (client_id, contract_id, etc.)
  entityType?: string;           // From product config
  channel: Channel;
}

export interface TenantScopedDB {
  query<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, unknown>
  ): Promise<{ rows: T[] }>;
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, unknown>
  ): Promise<T | null>;
  queryForUpdate<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, unknown>
  ): Promise<T[]>;
  execute(
    sql: string,
    params: Record<string, unknown>
  ): Promise<{ rowCount: number }>;
  transaction<T>(fn: (tx: TenantScopedDB) => Promise<T>): Promise<T>;
}

export interface MemoryStore {
  getHistory(
    tenantId: string,
    entityId: string | null,
    limit: number
  ): Promise<ConversationTurn[]>;
  saveTurn(turn: ConversationTurn): Promise<void>;
  search(
    tenantId: string,
    query: string,
    limit: number
  ): Promise<ConversationTurn[]>;
}

export interface ConversationTurn {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  skill_calls?: SkillCall[];
  recipe_used?: string;
  channel: Channel;
  timestamp: string;             // ISO 8601
  embedding?: number[];          // pgvector embedding
}

export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  tier: SubscriptionTier;        // Minimum tier required
  default_recipe: string;
  functions: SkillFunctionDef[];
}

export interface SkillFunctionDef {
  name: string;
  description: string;
  parameters: SkillParam[];
  returns: string;               // Human-readable return description
  default_recipe?: string;       // Function-level recipe override
}

export interface SkillParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'object';
  required: boolean;
  description: string;
  default?: unknown;
}

export interface SkillCall {
  skill: string;                 // e.g., 'portfolio-skill'
  function: string;              // e.g., 'get_holdings'
  params: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  recipe: string;                // Recipe name for rendering
  data: Record<string, unknown>; // Skill output data
  summary?: string;              // Optional NL summary for chat
  error?: string;
}

export interface SkillRegistry {
  skills: Map<string, SkillDefinition>;
  getSkillsForTier(tier: SubscriptionTier): SkillDefinition[];
  getFunction(skillName: string, functionName: string): SkillFunctionDef | null;
  buildToolDefinitions(tier: SubscriptionTier): LFM2ToolDef[];
}

// ============================================================
// 3. VaNi ENGINE (LFM2 INTEGRATION)
// ============================================================

export interface VaniRequest {
  message: string;
  tenant_id: string;
  user_id: string;
  entity_id?: string;
  channel: Channel;
  mode: VaniMode;
}

export interface VaniResponse {
  reply: string;                 // NL response text
  skill_calls: SkillCall[];      // Tool calls made
  skill_results: SkillResult[];  // Results from skills
  recipe?: string;               // Final recipe to render (may differ from skill default)
  data?: Record<string, unknown>; // Merged data for recipe
  escalated: boolean;            // Was this escalated to Claude?
  confidence: number;            // 0-1, VaNi's self-assessed confidence
}

export interface LFM2ToolDef {
  type: 'function';
  function: {
    name: string;                // skill_name.function_name
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

export interface LFM2Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: LFM2ToolCall[];
}

export interface LFM2ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;           // JSON string
  };
}

export interface VaniEngineConfig {
  endpoint: string;              // vLLM base URL
  model: string;                 // e.g., 'liquidai/lfm2-2.6b'
  maxTokens: number;
  temperature: number;
  escalationThreshold: number;   // Confidence below this → Claude
}

// ============================================================
// 4. RECIPE SYSTEM
// ============================================================

export type LayoutTemplate =
  | 'dashboard-3row'
  | 'detail-sidebar'
  | 'list-detail'
  | 'wizard-flow'
  | 'briefing'
  | 'comparison';

export interface Recipe {
  name: string;                  // Unique recipe identifier
  title: string;                 // Human-readable display title
  layout: LayoutTemplate;
  slots: RecipeSlot[];
  responsive?: ResponsiveRule[];
}

export interface RecipeSlot {
  row: number;
  components: RecipeComponent[];
}

export interface RecipeComponent {
  type: string;                  // VDF component name (e.g., 'kpi-card')
  data: string;                  // JSONPath into skill result data
  variant?: string;              // Component variant
  span?: number;                 // Grid column span (default 1)
  props?: Record<string, unknown>; // Additional component props
}

export interface ResponsiveRule {
  breakpoint: 'mobile' | 'tablet' | 'desktop';
  changes: {
    slot: number;                // Row index
    component: number;           // Component index within row
    hide?: boolean;
    span?: number;
    variant?: string;
  }[];
}

export interface RecipeRegistry {
  recipes: Map<string, Recipe>;
  get(name: string): Recipe | null;
  register(recipe: Recipe): void;
}

// ============================================================
// 5. VDF (VIKUNA DESIGN FRAMEWORK) COMPONENTS
// ============================================================

export interface VDFComponentDef {
  type: string;                  // Component identifier
  category: 'data-display' | 'chart' | 'interactive' | 'vani-specific';
  variants: string[];
  dataShape: Record<string, string>; // Expected data shape description
}

// --- Data Display Components ---

export interface KPICardData {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'flat';
  trend_value?: string;
  status?: 'success' | 'warning' | 'danger' | 'info';
  prefix?: string;               // e.g., '₹'
  suffix?: string;               // e.g., '%'
}

export interface DataTableData {
  columns: DataTableColumn[];
  rows: Record<string, unknown>[];
  sortable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  onRowClick?: string;           // Skill call template
}

export interface DataTableColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'badge';
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface StatRowData {
  stats: { label: string; value: string | number; prefix?: string; suffix?: string }[];
}

export interface TimelineData {
  events: TimelineEvent[];
}

export interface TimelineEvent {
  date: string;
  text: string;
  type: 'activity' | 'milestone' | 'alert' | 'info';
  icon?: string;
}

export interface BadgeData {
  text: string;
  variant: 'status' | 'tier' | 'risk' | 'category';
  color?: string;
}

// --- Chart Components ---

export interface DoughnutData {
  segments: { label: string; value: number; color?: string }[];
  centerLabel?: string;
  centerValue?: string;
}

export interface LineChartData {
  series: { label: string; data: number[]; color?: string }[];
  xLabels: string[];
  yLabel?: string;
}

export interface BarChartData {
  categories: string[];
  values: number[] | { label: string; data: number[]; color?: string }[];
  horizontal?: boolean;
}

export interface ProbabilityGaugeData {
  probability: number;           // 0 to 1
  target?: number;
  label: string;
  thresholds?: { green: number; amber: number }; // Defaults: 0.7, 0.4
}

export interface SparklineData {
  values: number[];
  color?: string;
  showArea?: boolean;
}

// --- Interactive Components ---

export interface SliderPanelData {
  label: string;
  min: number;
  max: number;
  current: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  onChange: string;               // Skill call template with {{value}} placeholder
}

export interface ActionBarData {
  actions: {
    label: string;
    skill: string;               // Skill function to call
    params: Record<string, unknown>;
    variant?: 'primary' | 'secondary' | 'danger';
    icon?: string;
  }[];
}

export interface FilterRowData {
  filters: {
    key: string;
    type: 'dropdown' | 'search' | 'toggle' | 'date-range';
    label: string;
    options?: { value: string; label: string }[];
    defaultValue?: unknown;
  }[];
  onFilter: string;              // Skill call template
}

export interface WizardData {
  steps: {
    title: string;
    description?: string;
    fields: WizardField[];
  }[];
  onComplete: string;            // Skill call template
}

export interface WizardField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'currency' | 'toggle';
  required: boolean;
  options?: { value: string; label: string }[];
  validation?: { min?: number; max?: number; pattern?: string };
  placeholder?: string;
}

export interface ApprovalCardData {
  proposal: string;
  reasoning: string;
  actions: {
    accept: { skill: string; params: Record<string, unknown> };
    modify?: { skill: string; params: Record<string, unknown> };
    reject: { skill: string; params: Record<string, unknown> };
  };
}

// --- VaNi-Specific Components ---

export interface InsightCardData {
  title: string;
  body: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  action?: {
    label: string;
    skill: string;
    params: Record<string, unknown>;
  };
  timestamp?: string;
}

export interface BriefingPanelData {
  insights: InsightCardData[];
  date: string;
  greeting?: string;
}

export interface SuggestionData {
  text: string;
  confidence: number;            // 0 to 1
  action?: {
    label: string;
    skill: string;
    params: Record<string, unknown>;
  };
}

export interface ChatPanelData {
  messages: ChatMessage[];
  onSend: string;                // API endpoint
  placeholder?: string;
  contextLabel?: string;         // e.g., "Talking about Priya's portfolio"
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  recipe?: string;               // If assistant response includes a renderable recipe
  data?: Record<string, unknown>;
}

// ============================================================
// 6. PRODUCT CONFIGURATION
// ============================================================

export interface VaniProductConfig {
  product: {
    name: string;
    slug: string;                // URL-safe identifier
    description: string;
    entityType: string;          // Primary entity (e.g., 'client', 'contract', 'market')
    entityLabel: string;         // Display label for entity
    version: string;
  };
  vani: {
    mode: VaniMode;
    systemPrompt: string;        // Base system prompt for this product
    defaultRecipe: string;       // Home screen recipe
    escalationThreshold: number; // 0-1, below this → Claude API
  };
  tenancy: {
    model: TenancyModel;
    // operator: tenant manages entities (distributor → clients)
    // subscriber: user IS the tenant (trader → own dashboard)
  };
  tiers: Record<SubscriptionTier, {
    skills: string[] | ['*'];    // '*' = all skills
    maxEntities: number;
    vaniInteractionsPerDay: number;
    claudeEscalationsPerDay: number;
    features: Record<string, boolean>;
  }>;
  channels: Channel[];
  themes: string[];              // Available theme names
  database: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    skillDbUrl: string;          // Raw PostgreSQL connection string
  };
}

// ============================================================
// 7. API REQUEST / RESPONSE
// ============================================================

export interface ChatRequest {
  message: string;
  entity_id?: string;
  channel?: Channel;
  recipe_override?: string;      // Force a specific recipe
}

export interface ChatResponse {
  reply: string;
  recipe?: string;
  data?: Record<string, unknown>;
  skill_calls?: { skill: string; function: string }[];
  escalated?: boolean;
}

export interface APIError {
  error: string;
  code: string;
  status: number;
  details?: Record<string, unknown>;
}

// ============================================================
// 8. ENVIRONMENT CONFIG
// ============================================================

export interface EnvironmentConfig {
  port: number;
  nodeEnv: 'development' | 'staging' | 'production';
  
  // Supabase (auth + realtime)
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  
  // Raw PostgreSQL (skill data)
  databaseUrl: string;
  
  // Redis
  redisUrl: string;
  
  // vLLM
  vllmEndpoint: string;
  vllmModel: string;
  
  // Claude API (escalation)
  claudeApiKey: string;
  claudeModel: string;
  
  // JWT
  jwtSecret: string;
  
  // Product
  productSlug: string;
}
```

### shared/constants/index.ts (90 lines)

```typescript
/**
 * VaNi Product Framework — Shared Constants
 */

// --- HTTP Status Codes ---
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// --- Subscription Tiers (ordered by level) ---
export const TIER_LEVELS: Record<string, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
};

// --- Channel Defaults ---
export const DEFAULT_CHANNEL = 'web' as const;

// --- VaNi Engine ---
export const VANI_DEFAULTS = {
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.3,
  ESCALATION_THRESHOLD: 0.6,
  HISTORY_LIMIT: 20,
  EMBEDDING_DIMENSION: 384,
} as const;

// --- API Paths ---
export const API_PATHS = {
  HEALTH: '/health',
  CHAT: '/api/v1/chat',
  SKILLS: '/api/v1/skills',
  RECIPES: '/api/v1/recipes',
  TENANTS: '/api/v1/tenants',
} as const;

// --- Database Tables (vn_ prefix) ---
export const TABLES = {
  TENANTS: 'vn_tenants',
  USERS: 'vn_users',
  CONVERSATIONS: 'vn_conversations',
  CONVERSATION_TURNS: 'vn_conversation_turns',
  MEMORY_EMBEDDINGS: 'vn_memory_embeddings',
  SKILL_EXECUTION_LOG: 'vn_skill_execution_log',
  ESCALATION_LOG: 'vn_escalation_log',
  SCHEDULED_JOBS: 'vn_scheduled_jobs',
} as const;

// --- Rate Limits (per tier, per day) ---
export const RATE_LIMITS = {
  starter: { vaniInteractions: 50, claudeEscalations: 0 },
  professional: { vaniInteractions: 200, claudeEscalations: 5 },
  enterprise: { vaniInteractions: Infinity, claudeEscalations: 20 },
} as const;

// --- Connection Pool ---
export const POOL_DEFAULTS = {
  MAX_CONNECTIONS: 20,
  IDLE_TIMEOUT_MS: 30_000,
  CONNECTION_TIMEOUT_MS: 5_000,
} as const;

// --- Job Types ---
export const JOB_TYPES = {
  DAILY_BRIEFING: 'daily_briefing',
  REPORT_GENERATION: 'report_generation',
  BULK_ALERT: 'bulk_alert',
  NAV_FETCH: 'nav_fetch',
} as const;

// --- Error Codes ---
export const ERROR_CODES = {
  AUTH_MISSING: 'AUTH_MISSING',
  AUTH_INVALID: 'AUTH_INVALID',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TIER_INSUFFICIENT: 'TIER_INSUFFICIENT',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_EXECUTION_FAILED: 'SKILL_EXECUTION_FAILED',
  VANI_ENGINE_ERROR: 'VANI_ENGINE_ERROR',
  ESCALATION_FAILED: 'ESCALATION_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;
```

### vani.config.template.ts (95 lines)

```typescript
/**
 * VaNi Product Framework — Product Configuration Template
 * 
 * Task: F-06 | Every product built on VaNi defines this file.
 * Copy to your product root and customize all values.
 * 
 * The framework reads this at startup to configure:
 * - Skill filtering by tier
 * - VaNi mode (full/explain/off)
 * - Tenancy model (operator/subscriber)
 * - Available channels and themes
 */

import type { VaniProductConfig } from './shared/types';

const config: VaniProductConfig = {
  product: {
    name: 'My Product',
    slug: 'my-product',
    description: 'A product built on the VaNi Product Framework',
    entityType: 'entity',        // Primary entity: 'client', 'contract', 'market', etc.
    entityLabel: 'Entity',       // Display label in UI
    version: '1.0.0',
  },

  vani: {
    mode: 'full',                // 'full' | 'explain' | 'off'
    systemPrompt: `You are VaNi, an AI assistant for [Product Name].
Your role is to understand user intent, invoke the right skills, and present results clearly.
You NEVER calculate values yourself — always use skill functions for computations.
You NEVER generate UI markup — return the recipe name and let the shell render.
If you're unsure, ask the user to clarify. If a request is too complex, signal for escalation.`,
    defaultRecipe: 'home-dashboard',
    escalationThreshold: 0.6,    // Below this confidence → Claude API
  },

  tenancy: {
    model: 'operator',           // 'operator' (manages entities) | 'subscriber' (is the entity)
  },

  tiers: {
    starter: {
      skills: ['*'],             // Which skills are available. '*' = all, or list names.
      maxEntities: 100,
      vaniInteractionsPerDay: 50,
      claudeEscalationsPerDay: 0,
      features: {
        dailyBriefing: false,
        whatsappAgent: false,
        brandedReports: false,
      },
    },
    professional: {
      skills: ['*'],
      maxEntities: 500,
      vaniInteractionsPerDay: 200,
      claudeEscalationsPerDay: 5,
      features: {
        dailyBriefing: true,
        whatsappAgent: true,
        brandedReports: true,
      },
    },
    enterprise: {
      skills: ['*'],
      maxEntities: Infinity,
      vaniInteractionsPerDay: Infinity,
      claudeEscalationsPerDay: 20,
      features: {
        dailyBriefing: true,
        whatsappAgent: true,
        brandedReports: true,
      },
    },
  },

  channels: ['web', 'api'],

  themes: [
    'ocean-blue',
    'emerald-green',
    'sunset-amber',
    'royal-purple',
    'coral-reef',
    'slate-gray',
  ],

  database: {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    skillDbUrl: process.env.DATABASE_URL || '',
  },
};

export default config;
```

---

## SECTION 9: Orchestrator & Engine

### framework/orchestrator.ts (202 lines)

```typescript
/**
 * Orchestrator — The main pipeline that wires all layers together
 * Updated for scalability: real DB, rate limiting, escalation tracking, metrics
 */

import type { Request } from 'express';
import type {
  ChatRequest,
  ChatResponse,
  VaniRequest,
  LFM2Message,
  ConversationTurn,
  Channel,
} from '../shared/types/index.js';
import { VaniEngine, MockVaniEngine } from './vani-engine/index.js';
import { EscalationHandler } from './escalation/index.js';
import { SkillRegistryImpl, executeSkill } from './skill-executor/index.js';
import { RecipeRegistryImpl } from './recipes/index.js';
import { MemoryStoreImpl } from './memory/index.js';
import { buildSkillContext } from './context-builder/index.js';
import { loadConfig } from './config.js';
import { DEFAULT_CHANNEL } from '../shared/constants/index.js';
import {
  incrementVaniCounter,
  incrementEscalationCounter,
  canEscalate,
} from './middleware/rate-limiter.js';
import { escalationTotal } from './middleware/metrics.js';

export class Orchestrator {
  readonly skillRegistry: SkillRegistryImpl;
  readonly recipeRegistry: RecipeRegistryImpl;
  readonly memoryStore: MemoryStoreImpl;
  private vaniEngine: VaniEngine | MockVaniEngine;
  private escalationHandler: EscalationHandler;
  private systemPrompt: string;
  readonly mockMode: boolean;

  constructor(opts?: { systemPrompt?: string }) {
    const config = loadConfig();

    this.skillRegistry = new SkillRegistryImpl();
    this.recipeRegistry = new RecipeRegistryImpl();
    this.memoryStore = new MemoryStoreImpl();

    // Use mock engine when vLLM is unavailable
    this.mockMode = !config.vllmEndpoint || config.vllmEndpoint === 'mock' || process.env.VANI_MOCK === 'true';
    if (this.mockMode) {
      console.info('[Orchestrator] Mock VaNi mode — keyword-based intent classification');
      this.vaniEngine = new MockVaniEngine();
    } else {
      this.vaniEngine = new VaniEngine({
        endpoint: config.vllmEndpoint,
        model: config.vllmModel,
      });
    }

    this.escalationHandler = new EscalationHandler({
      claudeApiKey: config.claudeApiKey,
      claudeModel: config.claudeModel,
    });
    this.systemPrompt = opts?.systemPrompt || 'You are VaNi, an AI assistant.';
  }

  async handleChat(req: Request): Promise<ChatResponse> {
    const auth = req.auth!;
    const body = req.body as ChatRequest;
    const channel = (body.channel || DEFAULT_CHANNEL) as Channel;

    // Track VaNi interaction count (fail-open if Redis unavailable)
    try { await incrementVaniCounter(auth.tenant_id); } catch { /* Redis may be down in dev */ }

    // Build escalation callback, then SkillContext
    const escalateFn = this.escalationHandler.createEscalateFn(this.systemPrompt);
    const ctx = buildSkillContext(req, escalateFn, this.memoryStore);

    // Fetch conversation history (graceful if DB unavailable)
    let historyMessages: LFM2Message[] = [];
    try {
      const history = await this.memoryStore.getHistory(auth.tenant_id, body.entity_id ?? null, 10);
      historyMessages = history.map((t) => ({
        role: t.role as 'user' | 'assistant',
        content: t.content,
      }));
    } catch {
      // DB may not be available in dev/mock mode
    }

    // Build tool definitions for this tier
    const tools = this.skillRegistry.buildToolDefinitions(auth.tier);

    // Call VaNi engine
    const vaniRequest: VaniRequest = {
      message: body.message,
      tenant_id: auth.tenant_id,
      user_id: auth.sub,
      entity_id: body.entity_id,
      channel,
      mode: 'full',
    };

    const vaniResponse = await this.vaniEngine.chat(
      vaniRequest,
      this.systemPrompt,
      historyMessages,
      tools
    );

    // Execute skill calls
    for (const call of vaniResponse.skill_calls) {
      const result = await executeSkill(call, ctx, this.skillRegistry);
      vaniResponse.skill_results.push(result);
    }

    // Check for escalation
    let reply = vaniResponse.reply;
    let escalated = false;

    if (vaniResponse.confidence < this.vaniEngine.escalationThreshold) {
      const allowed = await canEscalate(auth.tenant_id, auth.tier);
      if (allowed) {
        try {
          const escalationResult = await this.escalationHandler.escalate(
            this.systemPrompt,
            body.message,
            historyMessages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
          );
          reply = escalationResult.reply;
          escalated = true;
          await incrementEscalationCounter(auth.tenant_id);
          escalationTotal.inc({ tenant_id: auth.tenant_id });
          console.info(
            `[Orchestrator] Escalated to Claude (confidence: ${vaniResponse.confidence}, latency: ${escalationResult.latencyMs}ms)`
          );
        } catch (err) {
          console.error('[Orchestrator] Escalation failed:', err);
        }
      } else {
        console.info(`[Orchestrator] Escalation blocked — ${auth.tier} tier limit reached for tenant ${auth.tenant_id}`);
      }
    }

    // Determine recipe
    const recipe =
      body.recipe_override ||
      vaniResponse.skill_results.find((r) => r.recipe)?.recipe ||
      vaniResponse.recipe;

    // Merge data
    const mergedData: Record<string, unknown> = {};
    for (const result of vaniResponse.skill_results) {
      if (result.success) {
        Object.assign(mergedData, result.data);
      }
    }

    // Save conversation turns
    const userTurn: ConversationTurn = {
      id: crypto.randomUUID(),
      tenant_id: auth.tenant_id,
      entity_id: body.entity_id ?? null,
      role: 'user',
      content: body.message,
      channel,
      timestamp: new Date().toISOString(),
    };

    const assistantTurn: ConversationTurn = {
      id: crypto.randomUUID(),
      tenant_id: auth.tenant_id,
      entity_id: body.entity_id ?? null,
      role: 'assistant',
      content: reply,
      skill_calls: vaniResponse.skill_calls,
      recipe_used: recipe,
      channel,
      timestamp: new Date().toISOString(),
    };

    // Persist turns (graceful if DB unavailable)
    try {
      await this.memoryStore.saveTurn(userTurn);
      await this.memoryStore.saveTurn(assistantTurn);
    } catch (err) {
      console.error('[Orchestrator] Failed to save conversation turns:', (err as Error).message);
    }

    return {
      reply,
      recipe,
      data: Object.keys(mergedData).length > 0 ? mergedData : undefined,
      skill_calls: vaniResponse.skill_calls.map((c) => ({
        skill: c.skill,
        function: c.function,
      })),
      escalated,
    };
  }
}
```

### framework/vani-engine/engine.ts (148 lines)

```typescript
/**
 * VaNi Engine — Sends prompts to LFM2 via vLLM's OpenAI-compatible API
 * Task: F-12
 *
 * Responsibilities:
 * - Build the LFM2 message array (system prompt + history + user message)
 * - Attach tool definitions from the SkillRegistry
 * - Call vLLM /v1/chat/completions
 * - Parse tool_calls from the response
 * - Return structured VaniResponse with confidence assessment
 */

import type {
  VaniRequest,
  VaniResponse,
  LFM2ToolDef,
  LFM2Message,
  LFM2ToolCall,
  SkillCall,
} from '../../shared/types/index.js';
import type { VaniEngineConfig } from '../../shared/types/index.js';
import { VANI_DEFAULTS } from '../../shared/constants/index.js';

interface ChatCompletionChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: LFM2ToolCall[];
  };
  finish_reason: string;
}

interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class VaniEngine {
  private config: VaniEngineConfig;

  constructor(config: Partial<VaniEngineConfig> & { endpoint: string }) {
    this.config = {
      endpoint: config.endpoint,
      model: config.model || 'liquidai/lfm2-2.6b',
      maxTokens: config.maxTokens || VANI_DEFAULTS.MAX_TOKENS,
      temperature: config.temperature || VANI_DEFAULTS.TEMPERATURE,
      escalationThreshold: config.escalationThreshold || VANI_DEFAULTS.ESCALATION_THRESHOLD,
    };
  }

  /**
   * Send a chat request to the vLLM server and parse the response.
   */
  async chat(
    request: VaniRequest,
    systemPrompt: string,
    history: LFM2Message[],
    tools: LFM2ToolDef[]
  ): Promise<VaniResponse> {
    const messages: LFM2Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: request.message },
    ];

    const body = {
      model: this.config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    const response = await fetch(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`vLLM request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('vLLM returned no choices');
    }

    // Parse tool calls
    const skillCalls = this.parseToolCalls(choice.message.tool_calls);

    // Assess confidence heuristically
    const confidence = this.assessConfidence(choice);

    return {
      reply: choice.message.content || '',
      skill_calls: skillCalls,
      skill_results: [], // Filled in by the orchestrator after executing skills
      escalated: false,
      confidence,
    };
  }

  /**
   * Convert LFM2 tool_calls into our SkillCall format.
   * Tool names are "skillName.functionName".
   */
  private parseToolCalls(toolCalls?: LFM2ToolCall[]): SkillCall[] {
    if (!toolCalls) return [];

    return toolCalls.map((tc) => {
      const [skill, fn] = tc.function.name.split('.', 2);
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(tc.function.arguments);
      } catch {
        console.error(`[VaniEngine] Failed to parse tool call arguments for ${tc.function.name}`);
      }
      return {
        skill: skill || tc.function.name,
        function: fn || '',
        params,
      };
    });
  }

  /**
   * Simple confidence heuristic:
   * - If tool calls present → higher confidence (model knows what to do)
   * - If finish_reason is 'stop' with content → medium confidence
   * - Otherwise lower confidence
   */
  private assessConfidence(choice: ChatCompletionChoice): number {
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      return 0.85;
    }
    if (choice.finish_reason === 'stop' && choice.message.content) {
      return 0.7;
    }
    return 0.4;
  }

  get escalationThreshold(): number {
    return this.config.escalationThreshold;
  }
}
```

### framework/vani-engine/mock-engine.ts (89 lines)

```typescript
/**
 * Mock VaNi Engine — Keyword-based intent classification
 * Used when VLLM_ENDPOINT is 'mock' or unset.
 * Parses user messages for keywords and returns mock tool calls.
 */

import type {
  VaniRequest,
  VaniResponse,
  LFM2ToolDef,
  LFM2Message,
} from '../../shared/types/index.js';

export class MockVaniEngine {
  readonly escalationThreshold = 0.6;

  async chat(
    request: VaniRequest,
    _systemPrompt: string,
    _history: LFM2Message[],
    tools: LFM2ToolDef[]
  ): Promise<VaniResponse> {
    const msg = request.message.toLowerCase().trim();
    const skillCalls = this.classifyIntent(msg, tools);

    if (skillCalls.length > 0) {
      return {
        reply: '',
        skill_calls: skillCalls,
        skill_results: [],
        escalated: false,
        confidence: 0.85,
      };
    }

    // No match — return a generic reply with medium confidence
    return {
      reply: `I understood your message: "${request.message}". In production, VaNi (LFM2) would classify your intent and call the appropriate skill. Currently running in mock mode.`,
      skill_calls: [],
      skill_results: [],
      escalated: false,
      confidence: 0.7,
    };
  }

  private classifyIntent(
    msg: string,
    tools: LFM2ToolDef[]
  ): { skill: string; function: string; params: Record<string, unknown> }[] {
    // Greeting patterns
    if (/\b(hello|hi|hey|greet|namaste|good\s*(morning|afternoon|evening))\b/.test(msg)) {
      const hasGreeting = tools.some(t => t.function.name === 'demo-skill.get_greeting');
      if (hasGreeting) {
        // Extract a name if present after greeting word
        const nameMatch = msg.match(/(?:hello|hi|hey|greet(?:ing)?)\s+(\w+)/i);
        const name = nameMatch ? nameMatch[1] : 'there';
        return [{
          skill: 'demo-skill',
          function: 'get_greeting',
          params: { name },
        }];
      }
    }

    // Stats patterns
    if (/\b(stats|status|uptime|health|system|info|dashboard)\b/.test(msg)) {
      const hasStats = tools.some(t => t.function.name === 'demo-skill.get_stats');
      if (hasStats) {
        return [{
          skill: 'demo-skill',
          function: 'get_stats',
          params: {},
        }];
      }
    }

    // Generic: try to match any tool by keyword in its description
    for (const tool of tools) {
      const keywords = tool.function.description.toLowerCase().split(/\s+/);
      const matchCount = keywords.filter(kw => kw.length > 3 && msg.includes(kw)).length;
      if (matchCount >= 2) {
        const [skill, fn] = tool.function.name.split('.', 2);
        return [{ skill, function: fn, params: {} }];
      }
    }

    return [];
  }
}
```

### framework/vani-engine/index.ts (6 lines)

```typescript
/**
 * VaNi Engine — LFM2/vLLM integration for intent classification and tool calling
 * Task: F-12
 */
export { VaniEngine } from './engine.js';
export { MockVaniEngine } from './mock-engine.js';
```

### framework/escalation/handler.ts (96 lines)

```typescript
/**
 * Escalation Handler — Falls back to Claude API when VaNi confidence is low
 * Task: F-13
 *
 * When VaNi's confidence is below the escalation threshold, we call Claude
 * to handle the request. This uses Anthropic's Messages API.
 */

import type { FrameworkConfig } from '../config.js';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export class EscalationHandler {
  private apiKey: string;
  private model: string;

  constructor(config: Pick<FrameworkConfig, 'claudeApiKey' | 'claudeModel'>) {
    this.apiKey = config.claudeApiKey;
    this.model = config.claudeModel;
  }

  /**
   * Escalate a prompt to Claude. Returns the assistant's text response.
   */
  async escalate(
    systemPrompt: string,
    userMessage: string,
    history: ClaudeMessage[] = []
  ): Promise<{ reply: string; inputTokens: number; outputTokens: number; latencyMs: number }> {
    if (!this.apiKey) {
      throw new Error('CLAUDE_API_KEY not configured — cannot escalate');
    }

    const start = Date.now();

    const messages = [
      ...history,
      { role: 'user' as const, content: userMessage },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as ClaudeResponse;
    const reply = data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      reply,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      latencyMs,
    };
  }

  /**
   * Create the escalate callback for SkillContext.
   * This is a curried function that captures the system prompt.
   */
  createEscalateFn(systemPrompt: string): (prompt: string) => Promise<string> {
    return async (prompt: string) => {
      const result = await this.escalate(systemPrompt, prompt);
      return result.reply;
    };
  }
}
```

### framework/escalation/index.ts (5 lines)

```typescript
/**
 * Escalation Handler — Claude API fallback when VaNi confidence is low
 * Task: F-13
 */
export { EscalationHandler } from './handler.js';
```

### framework/memory/store.ts (161 lines)

```typescript
/**
 * Memory Store — Postgres-backed conversation history + pgvector search
 * S-06: Zero in-process state — all state in Postgres
 *
 * Replaces the in-memory implementation. Now backed by:
 * - vn_conversation_turns for history
 * - vn_memory_embeddings + pgvector for semantic search
 */

import type {
  MemoryStore,
  ConversationTurn,
} from '../../shared/types/index.js';
import { VANI_DEFAULTS, TABLES } from '../../shared/constants/index.js';
import { getPool } from '../db/index.js';

export class MemoryStoreImpl implements MemoryStore {
  async getHistory(
    tenantId: string,
    entityId: string | null,
    limit: number = VANI_DEFAULTS.HISTORY_LIMIT
  ): Promise<ConversationTurn[]> {
    const pool = getPool();

    const entityClause = entityId
      ? `AND c.entity_id = $3`
      : `AND c.entity_id IS NULL`;

    const params: unknown[] = [tenantId, limit];
    if (entityId) params.push(entityId);

    // Set tenant context for RLS
    const client = await pool.connect();
    try {
      await client.query('SELECT set_tenant_context($1)', [tenantId]);

      const result = await client.query(
        `SELECT ct.id, ct.tenant_id, c.entity_id, ct.role, ct.content,
                ct.skill_calls, ct.recipe_used, ct.channel, ct.created_at AS timestamp
         FROM ${TABLES.CONVERSATION_TURNS} ct
         JOIN ${TABLES.CONVERSATIONS} c ON ct.conversation_id = c.id
         WHERE ct.tenant_id = $1 ${entityClause}
         ORDER BY ct.created_at DESC
         LIMIT $2`,
        params
      );

      // Return in chronological order
      return result.rows.reverse().map((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        entity_id: r.entity_id,
        role: r.role,
        content: r.content,
        skill_calls: r.skill_calls,
        recipe_used: r.recipe_used,
        channel: r.channel,
        timestamp: r.timestamp?.toISOString?.() ?? r.timestamp,
      }));
    } finally {
      client.release();
    }
  }

  async saveTurn(turn: ConversationTurn): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('SELECT set_tenant_context($1)', [turn.tenant_id]);

      // Ensure a conversation exists (upsert)
      const convResult = await client.query(
        `INSERT INTO ${TABLES.CONVERSATIONS} (tenant_id, user_id, entity_id, channel)
         VALUES ($1, $1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [turn.tenant_id, turn.entity_id, turn.channel]
      );

      let conversationId: string;
      if (convResult.rows.length > 0) {
        conversationId = convResult.rows[0].id;
      } else {
        // Get existing conversation
        const existing = await client.query(
          `SELECT id FROM ${TABLES.CONVERSATIONS}
           WHERE tenant_id = $1 AND entity_id ${turn.entity_id ? '= $2' : 'IS NULL'} AND active = true
           ORDER BY last_message_at DESC LIMIT 1`,
          turn.entity_id ? [turn.tenant_id, turn.entity_id] : [turn.tenant_id]
        );
        conversationId = existing.rows[0]?.id || turn.id;
      }

      await client.query(
        `INSERT INTO ${TABLES.CONVERSATION_TURNS}
         (id, conversation_id, tenant_id, role, content, skill_calls, recipe_used, channel)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          turn.id,
          conversationId,
          turn.tenant_id,
          turn.role,
          turn.content,
          turn.skill_calls ? JSON.stringify(turn.skill_calls) : null,
          turn.recipe_used,
          turn.channel,
        ]
      );

      // Update conversation timestamp
      await client.query(
        `UPDATE ${TABLES.CONVERSATIONS} SET last_message_at = now() WHERE id = $1`,
        [conversationId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Semantic search via pgvector cosine similarity.
   * Falls back to keyword ILIKE search if no embeddings are available.
   */
  async search(
    tenantId: string,
    query: string,
    limit: number = 5
  ): Promise<ConversationTurn[]> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('SELECT set_tenant_context($1)', [tenantId]);

      // Keyword fallback (pgvector embedding search needs an embedding model call)
      const result = await client.query(
        `SELECT ct.id, ct.tenant_id, c.entity_id, ct.role, ct.content,
                ct.skill_calls, ct.recipe_used, ct.channel, ct.created_at AS timestamp
         FROM ${TABLES.CONVERSATION_TURNS} ct
         JOIN ${TABLES.CONVERSATIONS} c ON ct.conversation_id = c.id
         WHERE ct.tenant_id = $1 AND ct.content ILIKE $2
         ORDER BY ct.created_at DESC
         LIMIT $3`,
        [tenantId, `%${query}%`, limit]
      );

      return result.rows.map((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        entity_id: r.entity_id,
        role: r.role,
        content: r.content,
        skill_calls: r.skill_calls,
        recipe_used: r.recipe_used,
        channel: r.channel,
        timestamp: r.timestamp?.toISOString?.() ?? r.timestamp,
      }));
    } finally {
      client.release();
    }
  }
}
```

### framework/memory/index.ts (5 lines)

```typescript
/**
 * Memory Store — Conversation history and pgvector semantic search
 * Task: F-14
 */
export { MemoryStoreImpl } from './store.js';
```

### framework/queue/processor.ts (155 lines)

```typescript
/**
 * Queue System — BullMQ job processor and dispatcher
 * S-05: Queue system
 *
 * Skills dispatch async work via ctx.enqueue(jobType, payload).
 * Job processors are registered at startup.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { getRedis } from '../redis/index.js';

const QUEUE_NAME = 'vani-jobs';

let queue: Queue | null = null;
let worker: Worker | null = null;

/** Job handler function — product authors implement these */
export type JobHandler = (job: Job) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function initQueue(): Queue {
  if (queue) return queue;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = getRedis().duplicate() as any;

  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86400 }, // Keep completed jobs for 24h
      removeOnFail: false,              // Keep failed jobs for inspection
    },
  });

  console.info('[Queue] Initialized');
  return queue;
}

export function getQueue(): Queue {
  if (!queue) throw new Error('Queue not initialized — call initQueue() first');
  return queue;
}

/**
 * Register a job handler for a specific job type.
 */
export function registerJobHandler(jobType: string, handler: JobHandler): void {
  handlers.set(jobType, handler);
  console.info(`[Queue] Registered handler: ${jobType}`);
}

/**
 * Start the worker that processes jobs.
 */
export function startWorker(): Worker {
  if (worker) return worker;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = getRedis().duplicate() as any;

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = handlers.get(job.name);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.name}`);
      }
      console.info(`[Queue] Processing job ${job.id} (${job.name})`);
      await handler(job);
      console.info(`[Queue] Completed job ${job.id} (${job.name})`);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Queue] Worker error:', err.message);
  });

  console.info('[Queue] Worker started');
  return worker;
}

/**
 * Enqueue a job — called by ctx.enqueue() in SkillContext.
 * Returns the job ID.
 */
export async function enqueueJob(
  jobType: string,
  payload: Record<string, unknown>
): Promise<string> {
  const q = getQueue();
  const job = await q.add(jobType, payload);
  console.info(`[Queue] Enqueued job ${job.id} (${jobType})`);
  return job.id!;
}

/**
 * Get job status by ID.
 */
export async function getJobStatus(jobId: string): Promise<{
  id: string;
  name: string;
  status: string;
  progress: number;
  data: unknown;
  result: unknown;
  failedReason?: string;
  attemptsMade: number;
  timestamp: number;
} | null> {
  const q = getQueue();
  const job = await q.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id!,
    name: job.name,
    status: state,
    progress: job.progress as number,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
  };
}

export async function getQueueDepth(): Promise<number> {
  const q = getQueue();
  const counts = await q.getJobCounts('waiting', 'active', 'delayed');
  return counts.waiting + counts.active + counts.delayed;
}

export async function closeQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  console.info('[Queue] Closed');
}
```

### framework/queue/index.ts (6 lines)

```typescript
export {
  initQueue, getQueue, closeQueue, startWorker,
  enqueueJob, getJobStatus, getQueueDepth,
  registerJobHandler,
} from './processor.js';
export type { JobHandler } from './processor.js';
```

### framework/redis/client.ts (53 lines)

```typescript
/**
 * Redis Client — Shared ioredis instance for rate limiting, caching, BullMQ
 */

import Redis from 'ioredis';

let redis: Redis | null = null;

export function initRedis(redisUrl: string): Redis {
  if (redis) return redis;

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null; // Stop retrying after 3 attempts
      return Math.min(times * 500, 2000);
    },
  });

  redis.on('error', (err) => {
    if (err.message) console.error('[Redis] Connection error:', err.message);
  });

  redis.on('connect', () => {
    console.info('[Redis] Connected');
  });

  return redis;
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized — call initRedis() first');
  return redis;
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const r = getRedis();
    const pong = await r.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    console.info('[Redis] Closed');
  }
}
```

### framework/redis/index.ts (1 lines)

```typescript
export { initRedis, getRedis, checkRedisHealth, closeRedis } from './client.js';
```

### framework/recipes/registry.ts (33 lines)

```typescript
/**
 * Recipe Registry — Stores and serves recipe definitions
 * Task: F-15
 *
 * Recipes define how skill results are rendered in the UI shell.
 * Products register recipes at startup; the shell fetches them via API.
 */

import type { Recipe, RecipeRegistry } from '../../shared/types/index.js';

export class RecipeRegistryImpl implements RecipeRegistry {
  recipes: Map<string, Recipe> = new Map();

  register(recipe: Recipe): void {
    this.recipes.set(recipe.name, recipe);
    console.info(`[RecipeRegistry] Registered: ${recipe.name} (${recipe.layout})`);
  }

  get(name: string): Recipe | null {
    return this.recipes.get(name) ?? null;
  }

  /**
   * Return all registered recipe names (useful for the /api/v1/recipes endpoint).
   */
  list(): { name: string; title: string; layout: string }[] {
    return Array.from(this.recipes.values()).map((r) => ({
      name: r.name,
      title: r.title,
      layout: r.layout,
    }));
  }
}
```

### framework/recipes/index.ts (5 lines)

```typescript
/**
 * Recipe Registry — Loads and serves recipe definitions
 * Task: F-15
 */
export { RecipeRegistryImpl } from './registry.js';
```

### framework/routes/chat.ts (49 lines)

```typescript
/**
 * Chat Route — /api/v1/chat
 * Task: F-16 — Wires the full pipeline
 *
 * POST /api/v1/chat
 * Headers: Authorization: Bearer <jwt>  (or X-Dev-Tenant-Id + X-Dev-User-Id in dev)
 * Body: { message: string, entity_id?: string, channel?: Channel, recipe_override?: string }
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Orchestrator } from '../orchestrator.js';
import { HTTP_STATUS, ERROR_CODES } from '../../shared/constants/index.js';

export function createChatRouter(orchestrator: Orchestrator): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const { message } = req.body || {};
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Request body must include a non-empty "message" string',
          code: 'INVALID_REQUEST',
          status: HTTP_STATUS.BAD_REQUEST,
        });
        return;
      }

      const response = await orchestrator.handleChat(req);
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Backward-compatible stub router for when orchestrator isn't initialized yet
export const chatRouter = Router();
chatRouter.post('/', (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Orchestrator not initialized. Use createChatRouter() instead.',
    code: ERROR_CODES.VANI_ENGINE_ERROR,
    status: 501,
  });
});
```

### framework/routes/health.ts (62 lines)

```typescript
/**
 * Health Check Endpoints
 * GET /health — basic liveness check
 * GET /health/ready — deep readiness check (DB + Redis + vLLM)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadConfig } from '../config.js';
import { checkPoolHealth, isPoolReady } from '../db/index.js';
import { checkRedisHealth } from '../redis/index.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const config = loadConfig();
  res.json({
    status: 'ok',
    service: 'vani-framework',
    version: '0.1.0',
    environment: config.nodeEnv,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const config = loadConfig();
  const checks: Record<string, boolean> = {};
  const errors: Record<string, string> = {};

  // DB check
  if (!isPoolReady()) {
    checks.postgres = false;
    errors.postgres = 'Pool not initialized (DATABASE_URL empty?)';
  } else {
    checks.postgres = await checkPoolHealth();
    if (!checks.postgres) errors.postgres = 'SELECT 1 failed — see server logs for details';
  }

  // Redis check
  checks.redis = await checkRedisHealth();

  // vLLM check
  try {
    const vllmRes = await fetch(`${config.vllmEndpoint.replace('/v1', '')}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    checks.vllm = vllmRes.ok;
  } catch {
    checks.vllm = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    checks,
    ...(Object.keys(errors).length > 0 && { errors }),
    timestamp: new Date().toISOString(),
  });
});
```

### framework/routes/jobs.ts (24 lines)

```typescript
/**
 * Jobs Route — /api/v1/jobs/:id
 * Check async job status.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getJobStatus } from '../queue/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

export const jobsRouter = Router();

jobsRouter.get('/jobs/:id', async (req: Request, res: Response) => {
  const job = await getJobStatus(req.params.id as string);
  if (!job) {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Job not found',
      code: 'JOB_NOT_FOUND',
      status: HTTP_STATUS.NOT_FOUND,
    });
    return;
  }
  res.json(job);
});
```

### framework/routes/recipes.ts (27 lines)

```typescript
/**
 * Recipes Route — /api/v1/recipes
 * Returns list of registered recipes for sidebar navigation.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { RecipeRegistryImpl } from '../recipes/registry.js';

export function createRecipesRouter(registry: RecipeRegistryImpl): Router {
  const router = Router();

  router.get('/recipes', (_req: Request, res: Response) => {
    res.json(registry.list());
  });

  router.get('/recipes/:name', (req: Request, res: Response) => {
    const recipe = registry.get(req.params.name as string);
    if (!recipe) {
      res.status(404).json({ error: `Recipe "${req.params.name}" not found` });
      return;
    }
    res.json(recipe);
  });

  return router;
}
```

### framework/routes/skills.ts (77 lines)

```typescript
/**
 * Skills Route — /api/v1/skills/:skillName/:functionName
 * Direct skill execution endpoint that bypasses VaNi/LLM.
 *
 * POST /api/v1/skills/client-skill/get_clients
 * Headers: Authorization or X-Dev-Tenant-Id
 * Body: { "params": { ... } }
 *
 * Returns the SkillResult (success, data, recipe, error).
 */

import type { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Orchestrator } from '../orchestrator.js';
import type { SkillCall } from '../../shared/types/index.js';
import { executeSkill } from '../skill-executor/executor.js';
import { buildSkillContext } from '../context-builder/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

/**
 * Register the direct skill execution route on the given router.
 * Mounted on the protectedRouter so auth/tenant/rate-limit middleware apply.
 */
export function registerSkillsRoute(router: Router, orchestrator: Orchestrator): void {
  router.post('/skills/:skillName/:functionName', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const skillName = req.params.skillName as string;
      const functionName = req.params.functionName as string;
      const params = req.body?.params ?? {};

      console.info(`[DEBUG][SkillsRoute] POST /skills/${skillName}/${functionName}`);
      console.info(`[DEBUG][SkillsRoute]   req.auth present: ${!!req.auth}`);
      console.info(`[DEBUG][SkillsRoute]   req.auth.tenant_id: "${req.auth?.tenant_id}"`);
      console.info(`[DEBUG][SkillsRoute]   req.auth.sub (userId): "${req.auth?.sub}"`);
      console.info(`[DEBUG][SkillsRoute]   params: ${JSON.stringify(params)}`);

      // Build context from authenticated request (same as chat endpoint)
      console.info(`[DEBUG][SkillsRoute] Calling buildSkillContext...`);
      const noopEscalate = async (prompt: string) => `Escalation not available in direct skill mode: ${prompt}`;
      let ctx;
      try {
        ctx = buildSkillContext(
          req,
          noopEscalate,
          orchestrator.memoryStore
        );
        console.info(`[DEBUG][SkillsRoute] buildSkillContext succeeded: tenantId="${ctx.tenantId}" userId="${ctx.userId}"`);
      } catch (ctxErr) {
        const msg = ctxErr instanceof Error ? ctxErr.message : String(ctxErr);
        console.error(`[DEBUG][SkillsRoute] buildSkillContext FAILED: ${msg}`);
        throw ctxErr;
      }

      // Build the skill call
      const call: SkillCall = {
        skill: skillName,
        function: functionName,
        params,
      };

      // Execute directly via the skill executor
      console.info(`[DEBUG][SkillsRoute] Calling executeSkill...`);
      const result = await executeSkill(call, ctx, orchestrator.skillRegistry);
      console.info(`[DEBUG][SkillsRoute] executeSkill returned: success=${result.success} recipe="${result.recipe}" error="${result.error || 'none'}"`);

      if (!result.success) {
        const status = result.error?.includes('not found') ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.BAD_REQUEST;
        res.status(status).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
```

---

## SECTION 10: Environment & Config

### .env.example (52 lines)

```typescript
# ============================================================
# VaNi Product Framework — Environment Variables
# Copy to .env and fill in values for your product
# ============================================================

# --- Product Identity ---
PRODUCT_SLUG=my-product
NODE_ENV=development

# --- Ports ---
API_PORT=3001
SHELL_PORT=3000
PG_PORT=5432
REDIS_PORT=6379
VLLM_PORT=8000

# --- PostgreSQL (skill data + memory) ---
# Option A: Individual params (preferred — avoids URL-encoding issues)
DB_HOST=localhost
DB_PORT=5432
DB_USER=vani
DB_PASSWORD=changeme_in_production
DB_NAME=vani
# Option B: Connection string (fallback — special chars must be URL-encoded)
# DATABASE_URL=postgresql://vani:changeme@localhost:5432/vani

# Legacy Docker vars (used by docker-compose.yml)
PG_USER=vani
PG_PASSWORD=changeme_in_production
PG_DATABASE=vani

# --- Supabase (auth + realtime) ---
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# --- vLLM (self-hosted LFM2) ---
VLLM_MODEL=liquidai/lfm2-2.6b
VLLM_ENDPOINT=http://localhost:8000/v1

# --- Mock mode (set to 'true' to skip vLLM and use keyword-based intent) ---
VANI_MOCK=false

# --- Claude API (escalation) ---
CLAUDE_API_KEY=sk-ant-your-key
CLAUDE_MODEL=claude-sonnet-4-20250514

# --- JWT ---
JWT_SECRET=changeme_use_a_32_char_random_string

# --- Redis ---
REDIS_URL=redis://localhost:6379
```

### docker-compose.yml (150 lines)

```yaml
# ============================================================
# VaNi Product Framework — Docker Compose Template
# Task: F-05 | Copy into each product repo and customize .env
# ============================================================
# Usage:
#   Dev:  docker compose --profile dev up
#   Prod: docker compose --profile prod up
# ============================================================

services:

  # --- API Server (Express + TypeScript) ---
  api:
    build:
      context: .
      dockerfile: infra/Dockerfile.api
    ports:
      - "${API_PORT:-3001}:3001"
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 3001
      DATABASE_URL: postgresql://${PG_USER:-vani}:${PG_PASSWORD:-vani}@postgres:5432/${PG_DATABASE:-vani}
      REDIS_URL: redis://redis:6379
      VLLM_ENDPOINT: ${VLLM_ENDPOINT:-mock}
      VLLM_MODEL: ${VLLM_MODEL:-liquidai/lfm2-2.6b}
      VANI_MOCK: ${VANI_MOCK:-true}
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY}
      CLAUDE_API_KEY: ${CLAUDE_API_KEY}
      CLAUDE_MODEL: ${CLAUDE_MODEL:-claude-sonnet-4-20250514}
      JWT_SECRET: ${JWT_SECRET}
      PRODUCT_SLUG: ${PRODUCT_SLUG}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./skills:/app/skills:ro          # Mount skills for hot-reload in dev
      - ./recipes:/app/recipes:ro        # Mount recipes
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # --- Next.js Shell (UI) ---
  shell:
    build:
      context: .
      dockerfile: infra/Dockerfile.shell
    ports:
      - "${SHELL_PORT:-3000}:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://api:3001
      NEXT_PUBLIC_SUPABASE_URL: ${SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
      NEXT_PUBLIC_PRODUCT_SLUG: ${PRODUCT_SLUG}
    depends_on:
      - api
    restart: unless-stopped

  # --- PostgreSQL 16 (skill data + memory) ---
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "${PG_PORT:-5432}:5432"
    environment:
      POSTGRES_USER: ${PG_USER:-vani}
      POSTGRES_PASSWORD: ${PG_PASSWORD:-vani}
      POSTGRES_DB: ${PG_DATABASE:-vani}
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d:ro
      - ./seeds:/seeds:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USER:-vani}"]
      interval: 5s
      timeout: 3s
      retries: 5

  # --- Redis 7 (cache, sessions, BullMQ) ---
  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # --- vLLM Inference Server (GPU required) ---
  vllm:
    image: vllm/vllm-openai:latest
    profiles:
      - gpu                              # Only start with: --profile gpu
    ports:
      - "${VLLM_PORT:-8000}:8000"
    environment:
      MODEL: ${VLLM_MODEL:-liquidai/lfm2-2.6b}
      MAX_MODEL_LEN: 4096
      GPU_MEMORY_UTILIZATION: "0.9"
    command: >
      --model ${VLLM_MODEL:-liquidai/lfm2-2.6b}
      --max-model-len 4096
      --gpu-memory-utilization 0.9
      --enable-auto-tool-choice
      --tool-call-parser hermes
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - vllm_cache:/root/.cache/huggingface
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 120s            # vLLM takes time to load model

  # --- BullMQ Dashboard (dev only) ---
  bull-board:
    image: deadly0/bull-board
    profiles:
      - dev
    ports:
      - "3002:3000"
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - redis

volumes:
  pg_data:
  redis_data:
  vllm_cache:
```

### tsconfig.json (30 lines)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./shared/*"],
      "@framework/*": ["./framework/*"],
      "@shell/*": ["./shell/*"]
    }
  },
  "include": [
    "framework/**/*.ts",
    "shared/**/*.ts",
    "vani.config.template.ts"
  ],
  "exclude": ["node_modules", "dist", "shell"]
}
```

---

## SECTION 11: Demo Skill

### skills/demo-skill/functions/get-greeting.ts (38 lines)

```typescript
/**
 * Demo Skill — get_greeting function
 * Queries vn_tenants for the tenant name and returns a greeting.
 */

import type { SkillContext, SkillResult } from '../../../shared/types/index.js';

export async function getGreeting(
  params: Record<string, unknown>,
  ctx: SkillContext
): Promise<SkillResult> {
  const name = (params.name as string) || 'there';

  // Query tenant name from the database
  let tenantName = 'Unknown Tenant';
  try {
    const tenant = await ctx.db.queryOne<{ name: string }>(
      'SELECT name FROM vn_tenants WHERE id = :tenantId',
      { tenantId: ctx.tenantId }
    );
    if (tenant) tenantName = tenant.name;
  } catch {
    // DB may not be available in dev — use fallback
    tenantName = `Tenant ${ctx.tenantId.slice(0, 8)}`;
  }

  return {
    success: true,
    recipe: 'demo-dashboard',
    data: {
      message: `Hello ${name}! Welcome to VaNi.`,
      tenant_name: tenantName,
      timestamp: new Date().toISOString(),
      greeting_for: name,
    },
    summary: `Greeted ${name} on behalf of ${tenantName}`,
  };
}
```

### skills/demo-skill/functions/get-stats.ts (47 lines)

```typescript
/**
 * Demo Skill — get_stats function
 * Returns framework runtime stats: skill count, uptime.
 */

import type { SkillContext, SkillResult } from '../../../shared/types/index.js';

export async function getStats(
  _params: Record<string, unknown>,
  ctx: SkillContext
): Promise<SkillResult> {
  // Query tenant name
  let tenantName = 'Unknown Tenant';
  try {
    const tenant = await ctx.db.queryOne<{ name: string }>(
      'SELECT name FROM vn_tenants WHERE id = :tenantId',
      { tenantId: ctx.tenantId }
    );
    if (tenant) tenantName = tenant.name;
  } catch {
    tenantName = `Tenant ${ctx.tenantId.slice(0, 8)}`;
  }

  const uptimeSeconds = Math.floor(process.uptime());

  return {
    success: true,
    recipe: 'demo-dashboard',
    data: {
      tenant_name: tenantName,
      uptime_seconds: uptimeSeconds,
      uptime_display: formatUptime(uptimeSeconds),
      node_version: process.version,
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    summary: `${tenantName} — uptime ${formatUptime(uptimeSeconds)}`,
  };
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
```

---

## SECTION 12: Known Issues & Integration Points

### 12.1 No TODO/FIXME Comments
Grep found zero TODO/FIXME/HACK comments in any source file.

### 12.2 Known Issues

1. **Auth: JWT not verified** — `framework/gateway/auth.ts` decodes the JWT payload (`Buffer.from(parts[1], 'base64url')`) but does NOT verify the signature. No `jsonwebtoken` or `bcrypt` package is installed. Dev bypass hardcodes `role='owner'`, `tier='professional'`.

2. **Execution log write fails in mock mode** — `framework/skill-executor/executor.ts:95` fires-and-forgets an INSERT to `vn_skill_execution_log`. When DB is unavailable (stub mode), this silently fails via `.catch()`. Non-blocking.

3. **DEBUG console.log lines everywhere** — `framework/gateway/auth.ts`, `framework/routes/skills.ts`, `framework/context-builder/build-context.ts`, `framework/db/pool.ts` all have verbose `[DEBUG]` logging. Remove before production.

4. **Shell layout.tsx hardcodes KI-Prime config** — `shell/src/app/layout.tsx` has a `productConfig` object with KI-Prime recipe list, tenant IDs, and product name. Should use webpack alias `@product-config` pointing to product repo's `shell.config.ts`.

5. **ShellConfig type mismatch** — `shell/src/lib/shell-config.ts` defines `auth.customHeaders?: Record<string, string>` but `shell/src/lib/shell-config-types.ts` defines `auth.headerName?: string` without `customHeaders`. The two should be unified.

6. **Memory store saveTurn bug** — `framework/memory/store.ts:77` has `VALUES ($1, $1, $2, $3)` — uses `tenant_id` as both `tenant_id` AND `user_id` in the conversation INSERT. Should use the actual `user_id`.

7. **toPositional regex** — `framework/db/pool.ts:127` uses `/:paramName/g` pattern. The current regex is `/(?::|\$)(\w+)/g` which also matches `$paramName` — could collide with PostgreSQL's native `$1` positional params if used carelessly.

8. **No bcrypt package** — Password hashing is needed before auth API can be built. Must add `bcrypt` or `argon2` to dependencies.

9. **RLS on vn_tenants/vn_users** — `migrations/001_framework_base.sql` enables RLS on ALL tables including `vn_tenants` and `vn_users`. But CLAUDE.md says "RLS disabled on vn_tenants and vn_users (needed for pre-auth lookup)". The migration contradicts the documented intent.

10. **Express 5** — The codebase uses Express 5.2.1 (not 4.x). Some middleware patterns differ (e.g., `express.Router()` instead of `express.router()`). Route params typing is `string | string[]` not just `string`.

### 12.3 Where New Auth Routes Should Mount

```
framework/routes/auth.ts          — NEW FILE
```

- Export a factory: `createAuthRouter(db: Pool) => Router`
- Register on the **main app** (NOT protectedRouter) since login/register are pre-auth
- Mount at `/api/v1/auth` before the protectedRouter
- Pattern matches existing route factories (e.g., `createChatRouter`, `createRecipesRouter`)

```typescript
// In framework/server.ts, add:
import { createAuthRouter } from './routes/auth.js';

// After public routes, before protectedRouter:
app.use('/api/v1/auth', createAuthRouter(/* deps */));
```

### 12.4 Where Theme System Hooks In

- `shell/src/components/theme-provider.tsx` — Already has `ThemeProvider` context with `theme` and `colorMode` state
- `shell/src/app/globals.css` — Defines 6 themes × light/dark via CSS custom properties on `[data-theme="..."]` selectors
- Theme preference source chain: `VN_tenant_profiles.theme_id` → `VN_users.preferences.theme_override` → localStorage fallback
- `ThemeProvider` currently reads from localStorage only — needs to accept initial theme from API/auth response
- `sidebar.tsx` already has theme picker UI with all 6 themes

### 12.5 Where Auth Context Hooks Into Shell

- `shell/src/app/layout.tsx` wraps children in `ShellConfigProvider` → `ShellLayout`
- Need to add `AuthProvider` wrapping `ShellLayout` (or inside it)
- `shell/src/lib/skill-fetcher.ts:buildAuthHeaders()` already supports `customHeaders` — needs to use real JWT token from auth context instead of hardcoded dev headers
- The `RecipePage` component calls `buildAuthHeaders(config)` — once AuthProvider exists, it should get the token from auth context

### 12.6 Key Handler Signature

```typescript
// framework/skill-executor/executor.ts
export type SkillHandler = (
  params: Record<string, unknown>,
  ctx: SkillContext
) => Promise<SkillResult>;
```

**params FIRST, ctx SECOND** — this is the canonical contract. All skill functions must follow this.

### 12.7 SkillContext Shape (from shared/types/index.ts)

```typescript
export interface SkillContext {
  tenantId: string;              // From JWT, NEVER from LLM
  userId: string;                // Authenticated user
  tier: SubscriptionTier;
  db: TenantScopedDB;           // Pre-scoped database client
  memory: MemoryStore;
  escalate: (prompt: string) => Promise<string>;
  enqueue: (jobType: string, payload: Record<string, unknown>) => Promise<string>;
  entityId?: string;
  entityType?: string;
  channel: Channel;
}
```

### 12.8 Database Configuration

- Prefer individual params: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Fallback: `DATABASE_URL` connection string (strips `sslmode` param)
- Pool: max=20, idle timeout 30s, connection timeout 5s, ssl `rejectUnauthorized: false`
- Every query calls `SELECT set_tenant_context($1)` before executing
- Named params `:paramName` converted to positional `$N` via `toPositional()`

---
*End of audit report*
