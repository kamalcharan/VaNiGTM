/**
 * Which scoring profile is in force — S17 (migration 274), decided 2026-10-02:
 *
 *   the tenant's own latest version, if it has one and it does not say
 *   "follow the platform"; otherwise the platform default's latest version.
 *
 * Nothing is seeded at signup: a tenant who never customises follows every
 * improvement to the default. A tenant's first save copies the default's part
 * weights it changed from and records which platform version it was based on,
 * so "the default changed since — adopt?" is answerable. Item weights and the
 * level boundaries are always the platform's (a level means the same thing
 * across the product).
 */
import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db';
import { checkLevelBounds, checkPartWeights, PART_KEYS, type PartKey, type ScoreProfile } from './score';

interface Row {
  tenant_id: string | null; version: number; follows_platform: boolean;
  part_weights: Record<PartKey, number> | null; item_weights: ScoreProfile['itemWeights'] | null;
  level_bounds: ScoreProfile['levelBounds'] | null; based_on_version: number | null;
  note: string | null; saved_by: string | null; saved_at: string;
}

export interface ResolvedProfile extends ScoreProfile {
  /** The tenant has its own profile in force. */
  own: boolean;
  /** On an own profile: the platform version it was based on. */
  basedOnVersion: number | null;
  /** On an own profile: the platform default has a newer version than the one it was based on. */
  platformChanged: boolean;
  /** The platform default's part weights now — what "adopt" would take. */
  platformPartWeights: Record<PartKey, number>;
}

type Q = Pool | PoolClient;

export async function platformLatest(db: Q): Promise<Row> {
  const r = await db.query<Row>(
    `SELECT * FROM gt_score_profiles WHERE tenant_id IS NULL ORDER BY version DESC LIMIT 1`);
  if (!r.rows[0]) {
    throw new Error('SCORE_PROFILE_MISSING: there is no platform scoring profile — migration 274 seeds v1; apply it with the runner.');
  }
  return r.rows[0];
}

export function asProfile(platform: Row): ScoreProfile {
  return {
    scope: 'platform', version: platform.version, platformVersion: platform.version,
    partWeights: platform.part_weights!, itemWeights: platform.item_weights!, levelBounds: platform.level_bounds!,
  };
}

/** The platform default as a ScoreProfile — what the common pool is always scored with. */
export async function platformProfile(db: Q): Promise<ScoreProfile> {
  return asProfile(await platformLatest(db));
}

/** The profile in force for a tenant, read inside that tenant's context (RLS). */
export async function resolveProfile(pool: Pool, tenantId: string): Promise<ResolvedProfile> {
  return withTenantClient(pool, tenantId, async (c) => {
    const platform = await platformLatest(c);
    const own = (await c.query<Row>(
      `SELECT * FROM gt_score_profiles WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1`, [tenantId])).rows[0];
    const base = asProfile(platform);
    if (!own || own.follows_platform) {
      return { ...base, own: false, basedOnVersion: null, platformChanged: false, platformPartWeights: platform.part_weights! };
    }
    return {
      ...base, scope: 'tenant', version: own.version, partWeights: own.part_weights!,
      own: true, basedOnVersion: own.based_on_version,
      platformChanged: (own.based_on_version ?? 0) < platform.version,
      platformPartWeights: platform.part_weights!,
    };
  });
}

export class ProfileError extends Error {}

/** A tenant saves its own part weights: a new version, based on today's platform default. */
export async function saveTenantProfile(
  pool: Pool, tenantId: string, partWeights: unknown, userId: string | null, note?: string,
): Promise<{ version: number; changed: boolean }> {
  const problems = checkPartWeights(partWeights);
  if (problems.length) throw new ProfileError(problems.join('; '));
  const w = partWeights as Record<PartKey, number>;
  return withTenantClient(pool, tenantId, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gt_score_profiles:${tenantId}`]);
    const platform = await platformLatest(c);
    const cur = (await c.query<Row>(
      `SELECT * FROM gt_score_profiles WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1`, [tenantId])).rows[0];
    const inForce = !cur || cur.follows_platform ? platform.part_weights! : cur.part_weights!;
    // Saving exactly what is in force appends nothing — a double click is not a
    // decision, and a tenant on the default who saves the default's numbers
    // must keep following it rather than freeze on a copy.
    if (PART_KEYS.every((k) => inForce[k] === w[k])) return { version: cur?.version ?? 0, changed: false };
    const version = (cur?.version ?? 0) + 1;
    await c.query(
      `INSERT INTO gt_score_profiles (tenant_id, version, part_weights, based_on_version, note, saved_by)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [tenantId, version, JSON.stringify(w), platform.version, note ?? null, userId]);
    return { version, changed: true };
  });
}

/** A tenant goes back to the platform default (and so follows it from now on). */
export async function followPlatform(pool: Pool, tenantId: string, userId: string | null): Promise<{ changed: boolean }> {
  return withTenantClient(pool, tenantId, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gt_score_profiles:${tenantId}`]);
    const cur = (await c.query<Row>(
      `SELECT * FROM gt_score_profiles WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1`, [tenantId])).rows[0];
    if (!cur || cur.follows_platform) return { changed: false };
    await c.query(
      `INSERT INTO gt_score_profiles (tenant_id, version, follows_platform, note, saved_by)
       VALUES ($1, $2, true, 'back to the platform default', $3)`, [tenantId, cur.version + 1, userId]);
    return { changed: true };
  });
}

/** The admin saves the platform default — a new version for every tenant that follows it, and the pool. */
export async function savePlatformProfile(
  pool: Pool,
  input: { part_weights?: unknown; item_weights?: unknown; level_bounds?: unknown; note?: string },
  userId: string | null,
): Promise<{ version: number }> {
  const cur = await platformLatest(pool);
  const parts = input.part_weights ?? cur.part_weights;
  const items = input.item_weights ?? cur.item_weights;
  const levels = input.level_bounds ?? cur.level_bounds;
  const problems = [...checkPartWeights(parts), ...checkLevelBounds(levels), ...checkItemWeights(items)];
  if (problems.length) throw new ProfileError(problems.join('; '));
  const r = await pool.query<{ v: number }>(
    'SELECT gt_save_platform_score_profile($1::jsonb, $2::jsonb, $3::jsonb, $4, $5) AS v',
    [JSON.stringify(parts), JSON.stringify(items), JSON.stringify(levels), input.note ?? null, userId]);
  return { version: Number(r.rows[0].v) };
}

function checkItemWeights(w: unknown): string[] {
  if (!w || typeof w !== 'object') return ['item weights are required'];
  const o = w as Record<string, Record<string, unknown>>;
  for (const k of PART_KEYS) {
    const items = o[k];
    if (!items || typeof items !== 'object') return [`item weights for ${k} are missing`];
    for (const [ik, v] of Object.entries(items)) {
      if (typeof v !== 'number' || v < 0) return [`item weight ${k}.${ik} must be a number ≥ 0`];
    }
  }
  return [];
}

/** Every version of this tenant's profile and of the platform default, newest first. */
export async function profileHistory(pool: Pool, tenantId: string) {
  return withTenantClient(pool, tenantId, async (c) => (await c.query(
    `SELECT CASE WHEN p.tenant_id IS NULL THEN 'platform' ELSE 'tenant' END AS scope, p.version, p.follows_platform,
            p.part_weights, p.based_on_version, p.note, p.saved_at,
            NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS saved_by_name
       FROM gt_score_profiles p LEFT JOIN vn_users u ON u.id = p.saved_by
      WHERE p.tenant_id IS NULL OR p.tenant_id = $1
      ORDER BY p.saved_at DESC, p.id DESC LIMIT 30`, [tenantId])).rows);
}
