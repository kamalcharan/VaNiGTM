/**
 * Change a family the tenant owns.
 *
 * The copy is only meaningful if it can be changed — otherwise taking a family
 * is just bookmarking one. This is where a tenant moves a weight, drops a
 * must-have the industry cares about and they do not, or raises the bar.
 *
 * APPEND-ONLY. An edit writes a new `vara_scoring_config` version and moves
 * `vara_family_profile.active_config_id` to it; v1 stays readable. That is not
 * bookkeeping: a JD published in March was scored against the shape as it was
 * in March, and "why was this candidate rejected" is unanswerable if the
 * contract was edited in place.
 *
 * THE PLATFORM PACK IS NEVER TOUCHED. `vani_domain_pack` is read-only to every
 * tenant (user ruling, 2026-09-17: "enrichment is global data ... tenant
 * copies to his own tenant workspace and modifies -- global wont").
 */

import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';
import { ACTOR_UNRESOLVED, audit } from '../actor';

const q = (f: string) => fs.readFileSync(path.join(__dirname, '../queries/', f), 'utf-8');
const VANI_TENANT_SQL = q('vani-tenant.sql');
const NEXT_CONFIG_SQL = q('next-scoring-config.sql');

interface MustHave { name: string; weight: number; years?: number; why?: string }
interface Knockout { label: string; rule: string }

/** What a shape must satisfy before it is allowed to score anyone. */
function validate(musthaves: MustHave[], knockouts: Knockout[], threshold: number): string | null {
  if (!musthaves.length) {
    // A family with nothing to score gives every candidate the same number,
    // which is worse than no family at all — it looks like a judgement.
    return 'A family needs at least one must-have — Vara has nothing to score without one.';
  }
  if (musthaves.length > 20) return 'At most 20 must-haves.';
  for (const m of musthaves) {
    if (!m.name?.trim()) return 'Every must-have needs a name.';
    if (!Number.isFinite(m.weight) || m.weight < 0 || m.weight > 100) {
      return `"${m.name}" needs a weight between 0 and 100.`;
    }
  }
  for (const k of knockouts) {
    if (!k.label?.trim() || !k.rule?.trim()) {
      return 'A knockout needs both a label and the rule it applies.';
    }
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    return 'The handover threshold is a percentage between 0 and 100.';
  }
  return null;
}

export async function update_family_shape(
  params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const familyId = String(params.family_id ?? '').trim();
  if (!familyId) return { ok: false, reason: 'NO_FAMILY', detail: 'Which family?' };

  const musthaves = (Array.isArray(params.musthaves) ? params.musthaves : []) as MustHave[];
  const knockouts = (Array.isArray(params.knockouts) ? params.knockouts : []) as Knockout[];
  const threshold = typeof params.threshold === 'number' ? Math.trunc(params.threshold) : 30;

  const bad = validate(musthaves, knockouts, threshold);
  if (bad) return { ok: false, reason: 'INVALID_SHAPE', detail: bad };

  const vani = await ctx.db.query<{ id: string }>(VANI_TENANT_SQL, { tenant_id: ctx.tenant_id });
  if (!vani.rows.length) {
    return {
      ok: false, reason: 'TENANT_NOT_PROVISIONED',
      detail: 'Complete the Domain step first — it is what creates your workspace.',
    };
  }
  const vaniTenantId = vani.rows[0].id;

  return ctx.db.transaction(async (tx) => {
    // Theirs, and taken. A family row without a profile was never taken, so
    // there is no shape to version — and another tenant's family is simply
    // not found, which is the same answer as not existing.
    const own = await tx.query<{
      name: string; components: Record<string, any>; weights: Record<string, any>;
    }>(
      `SELECT rf.name, sc.components, sc.weights
         FROM vani_role_family rf
         JOIN vara_family_profile fp ON fp.family_id = rf.id
         LEFT JOIN vara_scoring_config sc ON sc.id = fp.active_config_id
        WHERE rf.id = $family_id AND rf.tenant_id = $vani_tenant_id`,
      { family_id: familyId, vani_tenant_id: vaniTenantId },
    );
    if (!own.rows.length) {
      return {
        ok: false, reason: 'NOT_YOURS',
        detail: 'That is not a family in your workspace.',
      };
    }
    const prev = own.rows[0];

    const cfg = await tx.query<{ id: string; version: number }>(NEXT_CONFIG_SQL, {
      vani_tenant_id: vaniTenantId,
      family_id: familyId,
      weights: JSON.stringify(prev.weights ?? { skill: 55, avail: 25, exp: 20 }),
      components: JSON.stringify({
        musthaves: musthaves.map((m) => ({
          name: m.name.trim(), weight: m.weight,
          ...(m.years ? { years: m.years } : {}),
          ...(m.why ? { why: m.why } : {}),
        })),
        knockouts: knockouts.map((k) => ({ label: k.label.trim(), rule: k.rule.trim() })),
        // Carried forward, not re-sent by the client. These are the pack's
        // words and the tenant is editing the scoring contract, not the copy.
        role_summary_hint: prev.components?.role_summary_hint ?? null,
        band_hint: prev.components?.band_hint ?? null,
        // Where the shape STARTED, kept through every edit, so "your v4 began
        // as Software Development v2" survives.
        from_pack: prev.components?.from_pack ?? null,
      }),
      threshold,
      // The person is recorded in the audit row below, not here — see
      // ACTOR_UNRESOLVED. This column FKs to a spine the JWT cannot reach.
      approved_by: ACTOR_UNRESOLVED,
    });

    // The pointer move is what makes the edit live. Without it the new version
    // exists and nothing reads it, which is how an edit silently does nothing.
    await tx.query(
      `UPDATE vara_family_profile
          SET active_config_id = $config_id, default_threshold = $threshold
        WHERE family_id = $family_id AND tenant_id = $vani_tenant_id`,
      {
        config_id: cfg.rows[0].id, threshold,
        family_id: familyId, vani_tenant_id: vaniTenantId,
      },
    );

    // "Who set this bar" is the first question after a rejected candidate
    // complains, and the append-only version chain is only half the answer.
    await audit(tx, vaniTenantId, ctx.user_id, familyId, 'family_shape_changed', {
      name: prev.name,
      version: cfg.rows[0].version,
      musthaves: musthaves.length,
      knockouts: knockouts.length,
      threshold,
    });

    return {
      ok: true,
      family_id: familyId,
      name: prev.name,
      version: cfg.rows[0].version,
      detail: `${prev.name} is now v${cfg.rows[0].version}. `
        + `Earlier versions stay readable — a JD published against v${cfg.rows[0].version - 1} `
        + 'is still explainable.',
    };
  });
}
