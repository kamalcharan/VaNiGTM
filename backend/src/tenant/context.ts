/**
 * The tenant context — D-Q10 (Charan, 2026-10-02): "a single context for
 * tenant which can be reused across".
 *
 * ONE read that every agent, route and screen can use to know who it is
 * working for: commercial status, tokens, agents, model, scoring profile,
 * brand, industry, consent, domains, Smart Profile completion.
 *
 * Read-only and owned by nobody: each fact stays in the table that owns it
 * (vn_tenants, vani_tenant, vani_tenant_agent, vani_llm_provider via
 * llm.provider, gt_tenant_context + gt_token_topups via token.budget,
 * gt_score_profiles via scoring/profiles, gt_tenant_brand, vn_tenant_profiles,
 * gt_tenant_profile, vani_tenant_domain, the outreach acknowledgement). Nothing
 * here is copied or cached in a table of its own — a second copy of the brand
 * or the budget would be the bug the Brain rule names.
 *
 * Two tenant ids: the JWT carries vn_tenants.id; the vani_* spine stores
 * vani_tenant.id, bridged by slug (migration 248). Every read runs inside the
 * tenant's context, so RLS applies.
 *
 * A part that cannot be read says so (`error`) instead of failing the whole
 * context or reporting an empty value as the truth (rule 12).
 */
import type { Pool } from 'pg';
import { createTenantDb, withTenantClient } from '../db';
import { getTokenBudget } from '../agent-core/token.budget';
import { resolveProvider } from '../agent-core/llm.provider';
import { resolveProfile } from '../scoring/profiles';
import { readState as readOutreach } from '../skills/gtm/outreach-notice';
import type { SkillContext } from '../types/skill.types';

type Part<T> = T | { error: string };
const safe = async <T>(fn: () => Promise<T>): Promise<Part<T>> => {
  try { return await fn(); } catch (e) { return { error: (e as Error).message.slice(0, 300) }; }
};

export async function getTenantContext(pool: Pool, tenantId: string, ctx?: Pick<SkillContext, 'role' | 'user_id' | 'is_admin' | 'is_live'>) {
  const base = await withTenantClient(pool, tenantId, async (c) => {
    const t = (await c.query(
      `SELECT t.id, t.slug, t.is_admin, p.name, p.display_name, p.industry, p.website, p.brand_color, p.logo_url
         FROM vn_tenants t LEFT JOIN vn_tenant_profiles p ON p.tenant_id = t.id
        WHERE t.id = $1`, [tenantId])).rows[0];
    if (!t) throw new Error(`TENANT_NOT_FOUND: ${tenantId}`);
    const vt = (await c.query(`SELECT id, status FROM vani_tenant WHERE slug = $1`, [t.slug])).rows[0] ?? null;
    const agents = vt ? (await c.query(
      `SELECT a.code, a.name, ta.status, ta.activated_at
         FROM vani_tenant_agent ta JOIN vani_agent a ON a.id = ta.agent_id
        WHERE ta.tenant_id = $1 ORDER BY a.code`, [vt.id])).rows : [];
    const domains = vt ? (await c.query(
      `SELECT domain, purpose, verified_at FROM vani_tenant_domain WHERE tenant_id = $1 ORDER BY created_at`, [vt.id])).rows : [];
    const brand = (await c.query(
      `SELECT voice_tone, visual, approved_at, version FROM gt_tenant_brand WHERE tenant_id = $1
        ORDER BY version DESC NULLS LAST LIMIT 1`, [tenantId])).rows[0] ?? null;
    const profile = (await c.query(
      `SELECT completion_score, is_complete FROM gt_tenant_profile WHERE tenant_id = $1`, [tenantId])).rows[0] ?? null;
    let industryId: number | null = null;
    if (t.industry) {
      // The onboarding choice, resolved against the one industry master
      // (migration 267) — by code, name or alias. Unresolved stays visible.
      const m = (await c.query(
        `SELECT i.id FROM gt_industries i
          WHERE lower(i.code) = lower($1) OR lower(i.name) = lower($1)
             OR EXISTS (SELECT 1 FROM gt_industry_aliases a WHERE a.industry_id = i.id AND lower(a.raw_value) = lower($1))
          ORDER BY i.id LIMIT 1`, [t.industry])).rows[0];
      industryId = m?.id ?? null;
    }
    return { t, vt, agents, domains, brand, profile, industryId };
  });

  const [tokens, model, scoring, consent] = await Promise.all([
    safe(async () => {
      const b = await getTokenBudget(pool, tenantId);
      return {
        capped: b.capped, daily_limit: b.limit, used_today: b.used, monthly_limit: b.monthly_limit,
        used_this_month: b.month_used, topup_balance: Math.max(0, b.topup_balance),
        remaining: b.capped ? b.remaining : null, daily_source: b.daily_source, monthly_source: b.monthly_source,
      };
    }),
    safe(async () => {
      const p = await resolveProvider(pool, tenantId);
      return { posture: p.posture, provider: p.providerCode, model: p.model };   // never the key
    }),
    safe(async () => {
      const p = await resolveProfile(pool, tenantId);
      return {
        scope: p.scope, version: p.version, platform_version: p.platformVersion, own: p.own,
        based_on_version: p.basedOnVersion, platform_changed: p.platformChanged, part_weights: p.partWeights,
      };
    }),
    safe(async () => {
      const s = await readOutreach(createTenantDb(pool, tenantId),
        { tenant_id: tenantId, role: ctx?.role, user_id: ctx?.user_id ?? '', is_admin: ctx?.is_admin ?? false, is_live: ctx?.is_live ?? false } as SkillContext);
      return { status: s.status, in_force: s.in_force, notice_version: s.notice?.version ?? null };
    }),
  ]);

  const { t, vt, agents, domains, brand, profile, industryId } = base;
  return {
    tenant: { id: t.id, slug: t.slug, name: t.display_name || t.name, is_admin: t.is_admin === true, website: t.website },
    // D-Q11: billing is not built; every tenant is treated as paid. vani_tenant.status is the switch.
    commercial: vt
      ? { status: vt.status, paid: true, provisioned: true }
      : { status: null, paid: true, provisioned: false, note: 'No platform record yet — created by the Domain step of the Smart Profile.' },
    tokens,
    agents: agents.map((a: any) => ({ code: a.code, name: a.name, status: a.status, activated_at: a.activated_at })),
    model,
    scoring,
    brand: brand
      ? { voice_tone: brand.voice_tone, visual: brand.visual, approved: Boolean(brand.approved_at), version: brand.version, brand_color: t.brand_color, logo_url: t.logo_url }
      : { approved: false, brand_color: t.brand_color, logo_url: t.logo_url, note: 'No brand captured yet — the Mission Wizard\'s brand step writes it.' },
    industry: { declared: t.industry ?? null, industry_id: industryId, linked: industryId !== null },
    consent,
    domains,
    smart_profile: profile ? { completion_score: profile.completion_score, is_complete: profile.is_complete } : { completion_score: 0, is_complete: false },
  };
}

export type TenantContext = Awaited<ReturnType<typeof getTenantContext>>;
