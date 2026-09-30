import { SkillContext } from '../../../types/skill.types';

type Status = 'active' | 'attention' | 'not_activated';

function statusOf(sub: string | null): Status {
  if (sub === 'live') return 'active';
  if (sub === 'activating' || sub === 'provisioned') return 'attention';
  return 'not_activated';
}

export async function list(_params: Record<string, unknown>, ctx: SkillContext) {
  const registry = await ctx.db.query<{
    code: string; name: string; version: string; subscription: string | null; activated_at: string | null;
  }>(
    `SELECT a.code, a.name, a.version, ta.status AS subscription, ta.activated_at
       FROM vani_agent a
       LEFT JOIN vani_tenant vt ON vt.slug = (SELECT slug FROM vn_tenants WHERE id = $tenant_id)
       LEFT JOIN vani_tenant_agent ta ON ta.agent_id = a.id AND ta.tenant_id = vt.id
      WHERE a.status = 'active'
      ORDER BY a.code`,
    { tenant_id: ctx.tenant_id },
  );
  const profile = await ctx.db.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM gt_tenant_profile WHERE tenant_id = $tenant_id) AS exists`,
    { tenant_id: ctx.tenant_id },
  );

  type Row = { id: string; name: string; version: string; status: Status; subscription: string; activated_at: string | null; source: 'registry' | 'derived' };
  const agents: Row[] = registry.rows.map((a) => ({
    id: a.code, name: a.name, version: a.version,
    status: statusOf(a.subscription), subscription: a.subscription ?? 'none',
    activated_at: a.activated_at, source: 'registry',
  }));
  const seen = new Set(agents.map((a) => a.id));
  if (!seen.has('gtm')) {
    // GTM has no subscription row: it is live for anyone with a Brain.
    agents.push({ id: 'gtm', name: 'GTM', version: '1.0', status: profile.rows[0]?.exists ? 'active' : 'not_activated',
      subscription: 'none', activated_at: null, source: 'derived' });
  }
  if (!seen.has('edge')) {
    // Edge keeps its mission in the browser; the server has nothing to report.
    agents.push({ id: 'edge', name: 'Edge', version: '1.0', status: 'not_activated',
      subscription: 'none', activated_at: null, source: 'derived' });
  }
  return { agents };
}
