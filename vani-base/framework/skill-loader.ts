/**
 * VaNiBase Framework — Skill Loader
 *
 * Discovers skills from a directory and dynamically loads their function handlers.
 * Each skill folder must contain SKILL.md and functions/*.ts files.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SkillContext } from '../../shared/types';

export type SkillFunction = (
  params: Record<string, unknown>,
  ctx: SkillContext
) => Promise<unknown>;

export interface SkillMeta {
  name: string;
  tier: string;
  functions: Map<string, SkillFunction>;
}

/**
 * Parse frontmatter from SKILL.md to extract name and tier.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      meta[key.trim()] = rest.join(':').trim();
    }
  }
  return meta;
}

/**
 * Load all skills from skillsDir. Returns a Map of skillName → SkillMeta.
 */
export async function loadSkills(skillsDir: string): Promise<Map<string, SkillMeta>> {
  const skills = new Map<string, SkillMeta>();

  if (!fs.existsSync(skillsDir)) return skills;

  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir.name);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) continue;

    const frontmatter = parseFrontmatter(fs.readFileSync(skillMdPath, 'utf-8'));
    const skillName = frontmatter.name || dir.name;
    const tier = frontmatter.tier || 'starter';

    const functions = new Map<string, SkillFunction>();
    const functionsDir = path.join(skillPath, 'functions');

    if (fs.existsSync(functionsDir)) {
      const files = fs.readdirSync(functionsDir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

      for (const file of files) {
        const filePath = path.join(functionsDir, file);
        try {
          const mod = require(filePath);
          // Export each named export that is a function
          for (const [exportName, exportValue] of Object.entries(mod)) {
            if (typeof exportValue === 'function') {
              functions.set(exportName, exportValue as SkillFunction);
            }
          }
        } catch (err) {
          console.warn(`[framework] Failed to load ${filePath}:`, (err as Error).message);
        }
      }
    }

    skills.set(skillName, { name: skillName, tier, functions });
    console.log(`[framework] Loaded skill: ${skillName} (${functions.size} functions, tier: ${tier})`);
  }

  return skills;
}
