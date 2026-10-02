/** model-router-skill shared: the admin gate. The router is platform-wide. */
import type { SkillContext } from '../../types/skill.types';

export function requireAdmin(ctx: SkillContext): void {
  if (!ctx.is_admin) throw new Error('Platform models are managed by admin tenants only.');
}
