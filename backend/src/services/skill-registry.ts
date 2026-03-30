/**
 * KI-Prime — Skill Registry & Executor
 * Task: KI-25 | Product-level skill registry that manages KI-Prime skills.
 *
 * Responsibilities:
 *   1. Discover and parse all SKILL.md files
 *   2. Dynamically import function handlers from skills/<name>/functions/
 *   3. Register skills + handlers with the Express route layer
 *   4. Provide standalone execution for testing
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { loadAllSkills, discoverSkillDirs, parseSkillMd } from './skill-loader';
import type {
  SkillDefinition,
  SkillHandler,
  SkillContext,
  SkillResult,
} from './types';

/** Maps "skillName.functionName" → handler */
type HandlerMap = Map<string, SkillHandler>;

export class SkillRegistry {
  readonly skills: Map<string, SkillDefinition> = new Map();
  private handlers: HandlerMap = new Map();

  /** Register a parsed skill definition */
  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  /** Register a function handler */
  registerHandler(skillName: string, functionName: string, handler: SkillHandler): void {
    this.handlers.set(`${skillName}.${functionName}`, handler);
  }

  /** Get a handler by skill + function name */
  getHandler(skillName: string, functionName: string): SkillHandler | undefined {
    return this.handlers.get(`${skillName}.${functionName}`);
  }

  /** Get a skill definition */
  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /** Get all skills available for a given tier */
  getSkillsForTier(tier: string, tierConfig: { skills: string[] }): SkillDefinition[] {
    const allowedSkills = tierConfig.skills;
    const isWildcard = allowedSkills.includes('*');

    return Array.from(this.skills.values()).filter((skill) => {
      if (isWildcard) return true;
      return allowedSkills.includes(skill.name);
    });
  }

  /** Execute a skill function by name */
  async execute(
    skillName: string,
    functionName: string,
    params: Record<string, unknown>,
    ctx: SkillContext
  ): Promise<SkillResult> {
    const handler = this.getHandler(skillName, functionName);
    if (!handler) {
      return {
        success: false,
        skill: skillName,
        function: functionName,
        recipe: '',
        data: {},
        error: `No handler registered for ${skillName}.${functionName}`,
      };
    }

    try {
      const data = await handler(params, ctx);
      const recipe = (data.recipe as string) || this.skills.get(skillName)?.default_recipe || '';
      return {
        success: true,
        skill: skillName,
        function: functionName,
        recipe,
        data,
      };
    } catch (err) {
      return {
        success: false,
        skill: skillName,
        function: functionName,
        recipe: '',
        data: {},
        error: (err as Error).message,
      };
    }
  }

  /** Summary of registered skills and handlers */
  summary(): { skills: number; handlers: number; details: string[] } {
    const details = Array.from(this.skills.values()).map((s) => {
      const handlerCount = s.functions.filter(
        (f) => this.handlers.has(`${s.name}.${f.name}`)
      ).length;
      return `${s.name} v${s.version} (${s.tier}) — ${s.functions.length} functions, ${handlerCount} handlers`;
    });

    return {
      skills: this.skills.size,
      handlers: this.handlers.size,
      details,
    };
  }
}

/**
 * Convert a filename like "get-holdings.ts" to a function name like "get_holdings"
 */
function fileNameToFunctionName(fileName: string): string {
  return fileName.replace(/\.ts$/, '').replace(/-/g, '_');
}

/**
 * Discover and load all skills from a directory.
 * Parses SKILL.md files and dynamically imports function handlers.
 *
 * @param skillsRoot - Path to the skills/ directory
 * @returns Populated SkillRegistry
 */
export async function buildRegistry(skillsRoot: string): Promise<SkillRegistry> {
  const registry = new SkillRegistry();
  const skillDirs = discoverSkillDirs(skillsRoot);

  for (const skillDir of skillDirs) {
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const skill = parseSkillMd(skillMdPath);
    registry.register(skill);

    // Discover and import function handlers
    const functionsDir = path.join(skillDir, 'functions');
    if (!fs.existsSync(functionsDir)) {
      console.warn(`[SkillRegistry] No functions/ dir for ${skill.name}`);
      continue;
    }

    const fnFiles = fs.readdirSync(functionsDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith('.test.ts'));

    for (const fnFile of fnFiles) {
      const fnName = fileNameToFunctionName(fnFile);
      const fnPath = path.join(functionsDir, fnFile);

      try {
        const mod = await import(pathToFileURL(fnPath).href);
        // Handler is the named export matching the function name
        const handler = mod[fnName] || mod.default;
        if (typeof handler === 'function') {
          registry.registerHandler(skill.name, fnName, handler);
        } else {
          console.warn(`[SkillRegistry] No export '${fnName}' in ${fnPath}`);
        }
      } catch (err) {
        console.warn(`[SkillRegistry] Failed to import ${fnPath}: ${(err as Error).message}`);
      }
    }
  }

  return registry;
}

/**
 * Register all KI-Prime skills with an external orchestrator instance.
 * Bridge function for framework integration.
 */
export async function registerWithOrchestrator(
  registry: SkillRegistry,
  orchestrator: {
    skillRegistry: {
      register(skill: SkillDefinition): void;
    };
  },
  frameworkRegisterHandler: (
    skillName: string,
    functionName: string,
    handler: SkillHandler
  ) => void
): Promise<void> {
  for (const [, skill] of registry.skills) {
    orchestrator.skillRegistry.register(skill);

    for (const fn of skill.functions) {
      const handler = registry.getHandler(skill.name, fn.name);
      if (handler) {
        frameworkRegisterHandler(skill.name, fn.name, handler);
      }
    }
  }
}
