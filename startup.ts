/**
 * KI-Prime — Product Entry Point
 *
 * Imports the VaNiBase framework server, registers all KI-Prime skills
 * and recipes from the product directories, then starts the server.
 *
 * Usage: tsx startup.ts (or npm run dev:api)
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';

/* ── import framework from vani-base submodule ──────────── */

import { createServer } from './vani-base/framework/server';
import config from './vani.config';

/* ── resolve product directories ────────────────────────── */

const PRODUCT_ROOT = __dirname;

// SKILLS_DIR / RECIPES_DIR from env override product root defaults.
// This ensures the framework loads skills from THIS repo, not vani-base/skills/.
const SKILLS_DIR = path.resolve(PRODUCT_ROOT, process.env.SKILLS_DIR || 'skills');
const RECIPES_DIR = path.resolve(PRODUCT_ROOT, process.env.RECIPES_DIR || 'recipes');
const MIGRATIONS_DIR = path.resolve(PRODUCT_ROOT, process.env.MIGRATIONS_DIR || 'migrations');

/* ── discover skills ────────────────────────────────────── */

function discoverSkills(skillsDir: string): string[] {
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
    .map((d) => d.name);
}

/* ── discover recipes ───────────────────────────────────── */

function discoverRecipes(recipesDir: string): string[] {
  if (!fs.existsSync(recipesDir)) return [];
  return fs.readdirSync(recipesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}

/* ── main ───────────────────────────────────────────────── */

async function main(): Promise<void> {
  const skills = discoverSkills(SKILLS_DIR);
  const recipes = discoverRecipes(RECIPES_DIR);

  console.log(`[KI-Prime] Product: ${config.product.name} v${config.product.version}`);
  console.log(`[KI-Prime] Skills directory: ${SKILLS_DIR}`);
  console.log(`[KI-Prime] Recipes directory: ${RECIPES_DIR}`);
  console.log(`[KI-Prime] Discovered ${skills.length} skills: ${skills.join(', ')}`);
  console.log(`[KI-Prime] Discovered ${recipes.length} recipes: ${recipes.join(', ')}`);

  const server = await createServer({
    productConfig: config,
    skillsDir: SKILLS_DIR,
    recipesDir: RECIPES_DIR,
    migrationsDir: MIGRATIONS_DIR,
    port: Number(process.env.PORT) || 3001,
    mock: process.env.VANI_MOCK === 'true',
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[KI-Prime] Shutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[KI-Prime] Server started on port ${Number(process.env.PORT) || 3001}`);
}

main().catch((err) => {
  console.error('[KI-Prime] Failed to start:', err);
  process.exit(1);
});
