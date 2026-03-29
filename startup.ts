/**
 * KI-Prime — Product Entry Point
 *
 * Discovers all KI-Prime skills from skills/, parses SKILL.md definitions,
 * dynamically imports function handlers, then registers everything with
 * the VaNiBase framework's Orchestrator and starts the server.
 *
 * Usage: tsx startup.ts (or npm run dev:api)
 */

import 'dotenv/config';
import * as path from 'path';
import config from './vani.config';
import { buildRegistry, registerWithOrchestrator } from './shared/skill-registry';

/* ── resolve product directories ────────────────────────── */

const PRODUCT_ROOT = __dirname;
const SKILLS_DIR = path.resolve(PRODUCT_ROOT, process.env.SKILLS_DIR || 'skills');
const RECIPES_DIR = path.resolve(PRODUCT_ROOT, process.env.RECIPES_DIR || 'recipes');

/* ── main ───────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(`[KI-Prime] Product: ${config.product.name} v${config.product.version}`);
  console.log(`[KI-Prime] Skills directory: ${SKILLS_DIR}`);
  console.log(`[KI-Prime] Recipes directory: ${RECIPES_DIR}`);

  // --- Build product skill registry ---
  const registry = await buildRegistry(SKILLS_DIR);
  const summary = registry.summary();
  console.log(`[KI-Prime] Loaded ${summary.skills} skill(s), ${summary.handlers} handler(s)`);
  for (const detail of summary.details) {
    console.log(`  ${detail}`);
  }

  // --- Wire into VaNiBase framework (if submodule available) ---
  try {
    // Dynamic import so startup doesn't fail when submodule is absent
    const { Orchestrator } = await import('./vani-base/framework/orchestrator');
    const { registerHandler } = await import('./vani-base/framework/skill-executor/index');
    const { boot } = await import('./vani-base/framework/boot');
    const { loadConfig } = await import('./vani-base/framework/config');
    const { initPools } = await import('./vani-base/framework/db/index');
    const { healthRouter } = await import('./vani-base/framework/routes/health');
    const { createChatRouter } = await import('./vani-base/framework/routes/chat');
    const { createRecipesRouter } = await import('./vani-base/framework/routes/recipes');
    const { jobsRouter } = await import('./vani-base/framework/routes/jobs');
    const { registerSkillsRoute } = await import('./vani-base/framework/routes/skills');
    const { createAuthRouter } = await import('./vani-base/framework/routes/auth');
    const { createOnboardingRouter } = await import('./vani-base/framework/routes/onboarding');
    const { createTenantRouter } = await import('./vani-base/framework/routes/tenant');
    const { authMiddleware } = await import('./vani-base/framework/gateway/auth');
    const { tenantContext } = await import('./vani-base/framework/gateway/tenant-context');
    const { rateLimitMiddleware } = await import('./vani-base/framework/middleware/rate-limiter');
    const { errorHandler } = await import('./vani-base/framework/middleware/error-handler');
    const { requestLogger } = await import('./vani-base/framework/middleware/request-logger');
    const { metricsMiddleware, metricsRouter } = await import('./vani-base/framework/middleware/metrics');
    const { initRedis } = await import('./vani-base/framework/redis/index');
    const { initQueue, startWorker } = await import('./vani-base/framework/queue/index');
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;
    const { readFileSync } = await import('fs');

    const fwConfig = loadConfig();
    const port = Number(process.env.PORT) || fwConfig.port || 3001;

    // --- Infrastructure ---
    await initPools();

    if (fwConfig.redisUrl && fwConfig.redisUrl.startsWith('redis://')) {
      try {
        const redis = initRedis(fwConfig.redisUrl);
        await Promise.race([
          redis.connect().then(() => redis.ping()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        initQueue();
        startWorker();
        console.log('[KI-Prime] Redis + Queue ready');
      } catch (err) {
        try { (await import('./vani-base/framework/redis/index')).closeRedis(); } catch { /* ignore */ }
        console.warn('[KI-Prime] Redis unavailable:', (err as Error).message);
      }
    }

    // --- Orchestrator ---
    const orchestrator = new Orchestrator({ systemPrompt: config.vani.systemPrompt });

    // Register KI-Prime skills with the framework
    await registerWithOrchestrator(registry, orchestrator, registerHandler);

    // Load KI-Prime recipes
    const recipesDir = RECIPES_DIR;
    const { readdirSync } = await import('fs');
    for (const file of readdirSync(recipesDir).filter((f: string) => f.endsWith('.json'))) {
      try {
        const recipe = JSON.parse(readFileSync(path.join(recipesDir, file), 'utf-8'));
        orchestrator.recipeRegistry.register(recipe);
      } catch (err) {
        console.warn(`[KI-Prime] Failed to load recipe ${file}:`, (err as Error).message);
      }
    }

    const skillCount = orchestrator.skillRegistry.skills.size;
    const recipeCount = orchestrator.recipeRegistry.recipes.size;
    console.log(`[KI-Prime] Orchestrator ready — ${skillCount} skill(s), ${recipeCount} recipe(s)`);

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
    app.use('/api/v1/auth', createAuthRouter());
    app.use('/api/v1', createRecipesRouter(orchestrator.recipeRegistry));

    // Protected routes
    const protectedRouter = express.Router();
    protectedRouter.use(authMiddleware);
    protectedRouter.use(tenantContext);
    protectedRouter.use(rateLimitMiddleware);
    protectedRouter.use('/chat', createChatRouter(orchestrator));
    protectedRouter.use('/onboarding', createOnboardingRouter());
    protectedRouter.use('/tenant', createTenantRouter());
    registerSkillsRoute(protectedRouter, orchestrator);
    protectedRouter.use(jobsRouter);
    app.use('/api/v1', protectedRouter);

    app.use(errorHandler);

    const server = app.listen(port, () => {
      console.log(`[KI-Prime] Server running on port ${port}`);
      console.log(`[KI-Prime] Health:  http://localhost:${port}/health`);
      console.log(`[KI-Prime] Chat:    POST http://localhost:${port}/api/v1/chat`);
      console.log(`[KI-Prime] Skills:  POST http://localhost:${port}/api/v1/skills/:skill/:function`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('\n[KI-Prime] Shutting down...');
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    // Framework not available — run in standalone skill-only mode
    console.warn('[KI-Prime] VaNiBase framework not available:', (err as Error).message);
    console.log('[KI-Prime] Running in standalone skill registry mode (no server)');
    console.log('[KI-Prime] Skills available for direct execution via buildRegistry()');

    // Export the registry for programmatic use
    (globalThis as Record<string, unknown>).__kiPrimeRegistry = registry;
  }
}

main().catch((err) => {
  console.error('[KI-Prime] Failed to start:', err);
  process.exit(1);
});