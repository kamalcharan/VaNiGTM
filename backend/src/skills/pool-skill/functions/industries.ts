/** pool-skill: industries — the one industry master as a tree, with pool counts per node. */
import type { SkillContext } from '../../../types/skill.types';
import { requireAdmin, sql } from '../shared';

export async function industries(_params: Record<string, unknown>, ctx: SkillContext) {
  requireAdmin(ctx);
  const r = await ctx.db.query<any>(sql('industries'), {});
  const nodes = r.rows.map((x) => ({ ...x, in_pool: Number(x.in_pool), companies: Number(x.companies), children: [] as any[] }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: any[] = [];
  for (const n of nodes) (n.parent_id && byId.get(n.parent_id) ? byId.get(n.parent_id)!.children : roots).push(n);
  // A sector's counts include its sub-segments'.
  const roll = (n: any): [number, number] => {
    for (const ch of n.children) { const [p, c] = roll(ch); n.in_pool += p; n.companies += c; }
    return [n.in_pool, n.companies];
  };
  roots.forEach(roll);
  return { industries: roots, unmapped: null };
}
