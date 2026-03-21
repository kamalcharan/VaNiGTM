/**
 * KI-32: Shell lib barrel exports
 */

export { callSkill } from './skill-client';
export type { SkillResponse } from './skill-client';
export { resolveDataPath, resolveSlotData } from './resolve-data-path';
export { recipeRoutes } from './recipe-routes';
export type { RecipeRoute, RecipeSkillCall } from './recipe-routes';
export type { ShellConfig, RecipeConfig, SkillCall } from './shell-config';
