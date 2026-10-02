/** tenant skill shared: the admin gate. */
import type { SkillContext } from '../../types/skill.types';

export function requireAdmin(ctx: SkillContext): void {
  if (!ctx.is_admin) throw new Error('Top-ups are managed by admin tenants only.');
}
