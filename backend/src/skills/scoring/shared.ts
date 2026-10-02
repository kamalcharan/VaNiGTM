/** scoring skill shared: who may change what. */
import type { SkillContext } from '../../types/skill.types';

export const canEdit = (ctx: SkillContext) => ctx.role === 'owner' || ctx.role === 'admin';

export function requireEditor(ctx: SkillContext): void {
  if (!canEdit(ctx)) throw new Error('Only a workspace owner or admin can change how companies are scored.');
}
export function requireAdmin(ctx: SkillContext): void {
  if (!ctx.is_admin) throw new Error('The platform default is managed by admin tenants only.');
}
