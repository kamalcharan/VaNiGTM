/**
 * ingestion-skill: knowledge — what VaNi knows, as a list a person can check.
 *
 * The graph (gt_kg_nodes) is fed by the wizard's crawl, Teach VaNi and
 * competitor research, and read by the profile projection, research and the
 * storyteller — but nothing let a tenant SEE it (Charan, 2026-09-22 and
 * again 2026-09-25: "knowledge / knowledge graph still blank"). This is the
 * check: nodes grouped by kind, each with the source it was read from.
 *
 * Nodes AND edges. The Knowledge page lists the nodes by kind; the Knowledge
 * Graph page draws the relationships between them (Charan, 2026-09-26: both
 * surfaces were asked for; a list alone was not the ask).
 */
import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL_NODES = fs.readFileSync(path.join(__dirname, '..', 'queries', 'get-knowledge.sql'), 'utf-8');
const SQL_COUNTS = fs.readFileSync(path.join(__dirname, '..', 'queries', 'count-knowledge.sql'), 'utf-8');
const SQL_EDGES = fs.readFileSync(path.join(__dirname, '..', 'queries', 'get-knowledge-edges.sql'), 'utf-8');

interface KnowledgeParams { label?: string; limit?: number; offset?: number; }

export async function knowledge(params: KnowledgeParams, ctx: SkillContext) {
  const label = String(params.label ?? '').trim() || null;
  const limit = Math.min(Math.max(Number(params.limit ?? 200) || 200, 1), 500);
  const offset = Math.max(Number(params.offset ?? 0) || 0, 0);

  const [nodes, counts, edges] = await Promise.all([
    ctx.db.query<Record<string, unknown>>(SQL_NODES, { tenant_id: ctx.tenant_id, label, limit, offset }),
    ctx.db.query<{ label: string; count: number }>(SQL_COUNTS, { tenant_id: ctx.tenant_id }),
    ctx.db.query<Record<string, unknown>>(SQL_EDGES, { tenant_id: ctx.tenant_id }),
  ]);

  const total = counts.rows.reduce((n, r) => n + Number(r.count), 0);
  return {
    nodes: nodes.rows.map(({ filtered_total: _f, ...n }) => n),
    filtered_total: nodes.rows.length ? Number(nodes.rows[0].filtered_total) : 0,
    labels: counts.rows.map((r) => ({ label: r.label, count: Number(r.count) })),
    /** Every relationship in the graph; the console joins them to the nodes it shows. */
    edges: edges.rows,
    total,
    recipe: 'knowledge-list' as const,
  };
}
