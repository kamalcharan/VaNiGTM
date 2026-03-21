/**
 * KI-33: Shell Config Types
 *
 * Mirrors the ShellConfig interface from vani-base/shell/src/lib/shell-config.ts.
 * When the framework submodule is available, this can be replaced with a
 * re-export from vani-base.
 */

export interface SkillCall {
  skill: string;
  fn: string;
  /** Parameter keys to extract from URL search params */
  paramKeys?: string[];
}

export interface RecipeConfig {
  recipe: string;
  path: string;
  title: string;
  layout: string;
  skills: SkillCall[];
  priority: number;
  status: 'wired' | 'deferred';
}

export interface ShellConfig {
  product: {
    name: string;
    tagline: string;
  };
  api: {
    baseUrl: string;
    devHeaders: Record<string, string>;
  };
  recipes: RecipeConfig[];
}
