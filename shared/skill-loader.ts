/**
 * KI-Prime — SKILL.md Parser
 * Task: KI-25 | Parses skill definition files into SkillDefinition objects
 *
 * Each skill directory contains a SKILL.md with:
 *   - YAML frontmatter (name, version, description, tier, default_recipe)
 *   - Markdown body with ## Functions section containing ### per function
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SkillDefinition, SkillFunctionDef, SkillParam, SubscriptionTier } from './types';

/** Parse YAML-like frontmatter between --- delimiters */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

/**
 * Parse a parameter string from SKILL.md function definition.
 * Format: "param_name (required|optional, type[, description/default])"
 * Examples:
 *   "client_id (required, number)"
 *   "filters (optional, object: { search?: string, ... })"
 *   "period (optional, string: '1m' | '3m' | '6m' | '1y' | 'ytd', default '1y')"
 */
function parseParam(paramStr: string): SkillParam {
  // Match: name (required/optional, type[: details][, default value])
  const match = paramStr.match(
    /^(\w+)\s*\(\s*(required|optional)\s*,\s*(\w+)(?:[^)]*?)(?:,\s*default\s+([^)]+))?\)/
  );

  if (match) {
    return {
      name: match[1],
      type: match[3],
      required: match[2] === 'required',
      description: paramStr,
      default: match[4]?.trim(),
    };
  }

  // Fallback: treat as required string
  const name = paramStr.split(/\s/)[0].replace(/[^a-zA-Z0-9_]/g, '');
  return {
    name: name || 'unknown',
    type: 'string',
    required: false,
    description: paramStr,
  };
}

/**
 * Parse function definitions from the markdown body.
 * Looks for ### headings under ## Functions, then extracts:
 *   - Description (first line after heading)
 *   - Parameters line
 *   - Returns line
 */
function parseFunctions(content: string): SkillFunctionDef[] {
  const functions: SkillFunctionDef[] = [];

  // Find the ## Functions section
  const functionsMatch = content.match(/## Functions\s*\n([\s\S]*?)(?=\n## [^#]|$)/);
  if (!functionsMatch) return functions;

  const functionsSection = functionsMatch[1];

  // Split by ### headings
  const fnBlocks = functionsSection.split(/(?=^### )/m).filter((b) => b.startsWith('### '));

  for (const block of fnBlocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

    // First line: ### function_name
    const nameMatch = lines[0].match(/^###\s+(\w+)/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    let description = '';
    let parameters: SkillParam[] = [];
    let returns = '';
    let defaultRecipe: string | undefined;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('- Parameters:')) {
        const paramStr = line.replace('- Parameters:', '').trim();
        if (paramStr === 'none' || paramStr.startsWith('none ')) {
          parameters = [];
        } else {
          // Split on top-level commas (not inside parens/braces)
          const params = splitTopLevel(paramStr);
          parameters = params.map(parseParam);
        }
      } else if (line.startsWith('- Returns:')) {
        returns = line.replace('- Returns:', '').trim();
        // Extract recipe from returns if present
        const recipeMatch = returns.match(/recipe:\s*'([^']+)'/);
        if (recipeMatch) {
          defaultRecipe = recipeMatch[1];
        }
      } else if (!line.startsWith('- ') && !description) {
        description = line;
      }
    }

    functions.push({
      name,
      description,
      parameters,
      returns,
      default_recipe: defaultRecipe,
    });
  }

  return functions;
}

/**
 * Split a parameter string by top-level commas,
 * respecting parentheses and braces nesting.
 */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of str) {
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;

    if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

/**
 * Parse a single SKILL.md file into a SkillDefinition.
 */
export function parseSkillMd(filePath: string): SkillDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);
  const functions = parseFunctions(content);

  return {
    name: fm.name || path.basename(path.dirname(filePath)),
    version: fm.version || '0.0.0',
    description: fm.description || '',
    tier: (fm.tier || 'starter') as SubscriptionTier,
    default_recipe: fm.default_recipe || '',
    functions,
  };
}

/**
 * Discover all skill directories under the given root.
 * A valid skill directory contains a SKILL.md file.
 */
export function discoverSkillDirs(skillsRoot: string): string[] {
  if (!fs.existsSync(skillsRoot)) return [];

  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(skillsRoot, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'SKILL.md')));
}

/**
 * Load all skills from a directory. Returns parsed SkillDefinition array.
 */
export function loadAllSkills(skillsRoot: string): SkillDefinition[] {
  return discoverSkillDirs(skillsRoot).map((dir) =>
    parseSkillMd(path.join(dir, 'SKILL.md'))
  );
}
