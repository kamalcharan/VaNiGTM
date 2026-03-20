/**
 * VaNiBase Framework — HTTP Server
 *
 * Creates an HTTP server that:
 * - Loads skills dynamically from the product's skills directory
 * - Loads recipe layouts from the product's recipes directory
 * - Routes POST /api/skills/:skill/:function to skill handlers
 * - Routes GET /api/recipes/:name to recipe JSON
 * - Injects SkillContext (tenant_id + db) from JWT auth
 * - Supports mock mode for development without DB
 */

import * as http from 'http';
import * as url from 'url';
import type { VaniProductConfig } from '../../shared/types';
import { loadSkills, SkillMeta } from './skill-loader';
import { loadRecipes, Recipe } from './recipe-loader';
import { getPool, createSkillDb, closePool } from './db';
import { verifyToken, extractBearerToken } from './auth';

interface CreateServerOptions {
  productConfig: VaniProductConfig;
  skillsDir: string;
  recipesDir: string;
  migrationsDir: string;
  port: number;
  mock: boolean;
}

interface ServerInstance {
  close(): Promise<void>;
}

/* ── helpers ──────────────────────────────────────────────── */

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(data);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/* ── mock SkillDb for development ─────────────────────────── */

function createMockSkillDb() {
  return {
    async query<T>(): Promise<{ rows: T[] }> {
      console.warn('[framework] Mock mode: returning empty result');
      return { rows: [] };
    },
  };
}

/* ── server factory ───────────────────────────────────────── */

export async function createServer(options: CreateServerOptions): Promise<ServerInstance> {
  const { productConfig, skillsDir, recipesDir, port, mock } = options;
  const jwtSecret = process.env.JWT_SECRET || '';

  // Load skills and recipes
  const skills: Map<string, SkillMeta> = await loadSkills(skillsDir);
  const recipes: Map<string, Recipe> = loadRecipes(recipesDir);

  // Database pool (skip in mock mode)
  const dbPool = !mock && productConfig.database.skillDbUrl
    ? getPool(productConfig.database.skillDbUrl)
    : null;

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url || '', true);
    const pathname = parsed.pathname || '/';
    const method = req.method || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      json(res, 204, null);
      return;
    }

    try {
      // ── GET /api/health ───────────────────────────────
      if (method === 'GET' && pathname === '/api/health') {
        json(res, 200, {
          status: 'ok',
          product: productConfig.product.name,
          version: productConfig.product.version,
          skills: Array.from(skills.keys()),
          recipes: Array.from(recipes.keys()),
          mock,
        });
        return;
      }

      // ── GET /api/recipes/:name ────────────────────────
      const recipeMatch = pathname.match(/^\/api\/recipes\/([a-z0-9-]+)$/);
      if (method === 'GET' && recipeMatch) {
        const recipeName = recipeMatch[1];
        const recipe = recipes.get(recipeName);
        if (!recipe) {
          json(res, 404, { error: `Recipe '${recipeName}' not found` });
          return;
        }
        json(res, 200, recipe);
        return;
      }

      // ── POST /api/skills/:skill/:function ─────────────
      const skillMatch = pathname.match(/^\/api\/skills\/([a-z0-9-]+)\/([a-z0-9_]+)$/);
      if (method === 'POST' && skillMatch) {
        const [, skillName, funcName] = skillMatch;

        // Auth
        let tenantId = 'demo-tenant';
        if (!mock && jwtSecret) {
          const token = extractBearerToken(req.headers.authorization);
          if (!token) {
            json(res, 401, { error: 'Missing Authorization header' });
            return;
          }
          try {
            const payload = verifyToken(token, jwtSecret);
            tenantId = payload.tenant_id;
          } catch (err) {
            json(res, 401, { error: (err as Error).message });
            return;
          }
        }

        // Resolve skill
        const skill = skills.get(skillName);
        if (!skill) {
          json(res, 404, { error: `Skill '${skillName}' not found` });
          return;
        }

        const handler = skill.functions.get(funcName);
        if (!handler) {
          json(res, 404, { error: `Function '${funcName}' not found in skill '${skillName}'` });
          return;
        }

        // Parse body
        const body = await readBody(req);
        const params = body ? JSON.parse(body) : {};

        // Build context
        const db = mock || !dbPool ? createMockSkillDb() : createSkillDb(dbPool, tenantId);
        const ctx = { tenant_id: tenantId, db };

        // Execute
        const result = await handler(params, ctx);
        json(res, 200, { ok: true, data: result });
        return;
      }

      // ── GET /api/skills — list all skills ─────────────
      if (method === 'GET' && pathname === '/api/skills') {
        const list = Array.from(skills.entries()).map(([name, meta]) => ({
          name,
          tier: meta.tier,
          functions: Array.from(meta.functions.keys()),
        }));
        json(res, 200, list);
        return;
      }

      // ── 404 ───────────────────────────────────────────
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[framework] Request error:', err);
      json(res, 500, { error: 'Internal server error' });
    }
  });

  return new Promise<ServerInstance>((resolve) => {
    server.listen(port, () => {
      console.log(`[framework] Server listening on port ${port}`);
      resolve({
        async close() {
          return new Promise<void>((res, rej) => {
            server.close(async (err) => {
              await closePool();
              if (err) rej(err); else res();
            });
          });
        },
      });
    });
  });
}
