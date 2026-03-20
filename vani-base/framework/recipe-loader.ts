/**
 * VaNiBase Framework — Recipe Loader
 *
 * Loads JSON recipe layouts from the recipes directory.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Recipe {
  name: string;
  [key: string]: unknown;
}

export function loadRecipes(recipesDir: string): Map<string, Recipe> {
  const recipes = new Map<string, Recipe>();

  if (!fs.existsSync(recipesDir)) return recipes;

  const files = fs.readdirSync(recipesDir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(recipesDir, file), 'utf-8');
      const recipe: Recipe = JSON.parse(content);
      const name = recipe.name || file.replace('.json', '');
      recipes.set(name, recipe);
    } catch (err) {
      console.warn(`[framework] Failed to load recipe ${file}:`, (err as Error).message);
    }
  }

  console.log(`[framework] Loaded ${recipes.size} recipes`);
  return recipes;
}
