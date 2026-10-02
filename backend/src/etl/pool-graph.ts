/**
 * The common pool's company graph (S16 revised, Charan 2026-10-02) — pool rows
 * in the existing gt_kg_nodes / gt_kg_edges, marked by universe_company_id
 * with no tenant (migration 271).
 *
 *   writePoolGraph      the enrichment agent writes what it read on a company's
 *                       site (same extractor, same labels as the Smart Profile)
 *   readPoolGraph       one company's graph
 *   withdrawPoolRun     a run's facts out, except those another run also found
 *   findOwnPoolCompany  the pool company that IS a tenant's own website
 *   seedTenantFromPool  a tenant who signs up as a company the pool already
 *                       read gets that graph straight away, by COPY, before the
 *                       refresh read runs
 *
 * Every pool write and read goes through migration 271's SECURITY DEFINER
 * functions: the tenant isolation policy refuses rows with no tenant, which is
 * what keeps pool rows out of every tenant's Brain.
 *
 * The copy is one-way. Seeded rows are the tenant's own from then on (their
 * corrections never reach the pool) and nothing a tenant holds is ever written
 * here — their documents and conversations are tenant data (rule 13).
 */
import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db';
import { normalizeDomain } from './field-normalizers';

export interface PoolNodeIn { label: string; name: string; description?: string | null; properties?: Record<string, unknown> }
export interface PoolEdgeIn { from: { label: string; name: string }; relationship: string; to: { label: string; name: string }; properties?: Record<string, unknown> }

export interface PoolGraph {
  nodes: { id: string; label: string; name: string; description: string | null; properties: Record<string, unknown>; updated_at: string }[];
  edges: { from: string; to: string; relationship: string; properties: Record<string, unknown> }[];
}

const key = (label: string, name: string) => `${label}\u0000${name}`;

/** Write nodes then edges for one company, in the caller's transaction or its own. */
export async function writePoolGraph(
  db: Pool | PoolClient, companyId: string | number, nodes: PoolNodeIn[], edges: PoolEdgeIn[], runId: string | number | null,
): Promise<{ nodes: number; edges: number; edges_skipped: string[] }> {
  const ids = new Map<string, string>();
  for (const n of nodes) {
    const r = await db.query<{ id: string }>(
      `SELECT gt_pool_kg_upsert_node($1, $2, $3, $4, $5::jsonb, $6) AS id`,
      [companyId, n.label, n.name, n.description ?? '', JSON.stringify(n.properties ?? {}), runId]);
    ids.set(key(n.label, n.name), r.rows[0].id);
  }
  // An edge whose end was not written in this call is reported, never guessed
  // into existence.
  const skipped: string[] = [];
  let written = 0;
  for (const e of edges) {
    const from = ids.get(key(e.from.label, e.from.name));
    const to = ids.get(key(e.to.label, e.to.name));
    if (!from || !to) { skipped.push(`${e.from.name} ${e.relationship} ${e.to.name}`); continue; }
    await db.query(`SELECT gt_pool_kg_upsert_edge($1, $2, $3, $4, $5::jsonb, $6)`,
      [companyId, from, e.relationship, to, JSON.stringify(e.properties ?? {}), runId]);
    written++;
  }
  return { nodes: ids.size, edges: written, edges_skipped: skipped };
}

export async function readPoolGraph(db: Pool | PoolClient, companyId: string | number): Promise<PoolGraph> {
  const r = await db.query<{ g: PoolGraph }>(`SELECT gt_pool_kg_read($1) AS g`, [companyId]);
  return r.rows[0].g;
}

export async function withdrawPoolRun(db: Pool | PoolClient, runId: string | number) {
  const r = await db.query(`SELECT * FROM gt_pool_kg_withdraw_run($1)`, [runId]);
  return r.rows[0] as { nodes_removed: number; edges_removed: number; nodes_kept: number; edges_kept: number };
}

export type OwnPoolCompany =
  | { found: true; company_id: string; name: string; domain: string }
  | { found: false; reason: 'not_own_site' | 'no_website' | 'not_in_pool' | 'ambiguous'; detail: string };

/**
 * The pool company that is this tenant's own website — only when the URL being
 * read is on the tenant's declared website. A tenant teaching VaNi a
 * competitor's page is not that competitor, and its graph must not become
 * their Brain. Several live companies on one domain (sister companies, flagged
 * not merged) is not guessed between.
 */
export async function findOwnPoolCompany(pool: Pool, tenantId: string, url: string): Promise<OwnPoolCompany> {
  const site = await withTenantClient(pool, tenantId, async (c) =>
    (await c.query<{ website: string | null }>(`SELECT website FROM vn_tenant_profiles WHERE tenant_id = $1`, [tenantId])).rows[0]?.website ?? null);
  const own = normalizeDomain(site);
  const read = normalizeDomain(url);
  if (!own) return { found: false, reason: 'no_website', detail: 'the workspace has no website on its profile' };
  if (!read || read !== own) return { found: false, reason: 'not_own_site', detail: `${read ?? url} is not ${own}` };
  const rows = (await pool.query<{ id: string; name: string }>(
    `SELECT id::text, name FROM gt_universe_companies
      WHERE domain_normalized = $1 AND merged_into_id IS NULL AND lifecycle_state <> 'junk'
      ORDER BY id LIMIT 5`, [own])).rows;
  if (!rows.length) return { found: false, reason: 'not_in_pool', detail: `${own} is not in the common pool` };
  if (rows.length > 1) return { found: false, reason: 'ambiguous', detail: `${rows.length} pool companies share ${own} (${rows.map((r) => r.name).join(', ')}) — not guessing between them` };
  return { found: true, company_id: rows[0].id, name: rows[0].name, domain: own };
}

/**
 * Copy one pool company's graph into a tenant's own rows. What the tenant
 * already holds wins: an existing (label, name) is left exactly as it is, so a
 * fact the tenant corrected is never overwritten by the pool's version.
 */
export async function seedTenantFromPool(pool: Pool, tenantId: string, companyId: string | number, runId: string | number | null) {
  const g = await readPoolGraph(pool, companyId);
  if (!g.nodes.length) return { nodes_added: 0, nodes_already_known: 0, edges_added: 0, read_at: null as string | null };
  const readAt = g.nodes.map((n) => n.updated_at).sort().at(-1) ?? null;
  return withTenantClient(pool, tenantId, async (c) => {
    const map = new Map<string, string>();   // pool node id → tenant node id
    let added = 0;
    for (const n of g.nodes) {
      const { runs, ...props } = n.properties ?? {};
      const fromPool = { company_id: String(companyId), runs: runs ?? [], read_at: n.updated_at };
      const ins = await c.query<{ id: string }>(
        `INSERT INTO gt_kg_nodes (tenant_id, label, name, description, properties, source_run_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (tenant_id, label, name) DO NOTHING RETURNING id`,
        [tenantId, n.label, n.name, n.description ?? '', JSON.stringify({ ...props, from_pool: fromPool }), runId]);
      if (ins.rows[0]) { added++; map.set(n.id, ins.rows[0].id); continue; }
      const had = await c.query<{ id: string }>(
        `SELECT id FROM gt_kg_nodes WHERE tenant_id = $1 AND label = $2 AND name = $3`, [tenantId, n.label, n.name]);
      map.set(n.id, had.rows[0].id);
    }
    let edges = 0;
    for (const e of g.edges) {
      const from = map.get(e.from);
      const to = map.get(e.to);
      if (!from || !to) continue;
      const { runs: _runs, ...props } = e.properties ?? {};
      const r = await c.query(
        `INSERT INTO gt_kg_edges (tenant_id, from_node_id, to_node_id, relationship, properties, source_run_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (tenant_id, from_node_id, relationship, to_node_id) DO NOTHING`,
        [tenantId, from, to, e.relationship, JSON.stringify({ ...props, from_pool: { company_id: String(companyId) } }), runId]);
      edges += r.rowCount ?? 0;
    }
    return { nodes_added: added, nodes_already_known: g.nodes.length - added, edges_added: edges, read_at: readAt };
  });
}
