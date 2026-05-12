/**
 * Vikuna Agent Core — Knowledge Graph Store
 *
 * Reads/writes gt_kg_nodes and gt_kg_edges.
 *
 * The graph is source-agnostic. Conversation, PDF, DOCX, PPTX, URL all
 * flow through here. The unique key is (tenant_id, label, name) — UPSERT
 * semantics: re-extracting the same fact updates its description and
 * merges properties.
 *
 * source_run_id is BIGINT (FK to gt_agent_runs.id which is BIGSERIAL).
 */

import type { Pool } from 'pg';
import { createTenantDb } from '../db';

export type NodeLabel =
  | 'Product'
  | 'Feature'
  | 'ICP'
  | 'UseCase'
  | 'PainPoint'
  | 'Differentiator'
  | 'Team'
  | 'Competitor';

export interface KGNode {
  id: string;
  tenant_id: string;
  label: string;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
  source_run_id: string | number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ExtractedNode {
  label: string;
  name: string;
  description: string;
  properties?: Record<string, unknown>;
}

export type RelationshipType =
  | 'HAS_FEATURE'
  | 'TARGETS'
  | 'FEELS'
  | 'ADDRESSES'
  | 'SOLVES'
  | 'DIFFERENTIATES_FROM'
  | 'BUILT_BY';

/**
 * Upsert a node by (tenant_id, label, name).
 *
 * - New node: insert
 * - Existing node: description overwrites, properties merged (JSONB ||),
 *   updated_at refreshed, source_run_id replaced with the new run.
 *
 * Returns the node id.
 */
export async function upsertNode(
  pool: Pool,
  tenantId: string,
  node: ExtractedNode,
  sourceRunId?: string | number | null,
): Promise<string> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{ id: string }>(
    `INSERT INTO gt_kg_nodes
         (tenant_id, label, name, description, properties, source_run_id)
       VALUES
         ($tenant_id, $label, $name, $description, $properties::jsonb, $source_run_id)
     ON CONFLICT (tenant_id, label, name) DO UPDATE
         SET description   = EXCLUDED.description,
             properties    = gt_kg_nodes.properties || EXCLUDED.properties,
             source_run_id = COALESCE(EXCLUDED.source_run_id, gt_kg_nodes.source_run_id),
             updated_at    = now()
     RETURNING id`,
    {
      tenant_id:     tenantId,
      label:         node.label,
      name:          node.name,
      description:   node.description ?? '',
      properties:    JSON.stringify(node.properties ?? {}),
      source_run_id: sourceRunId ?? null,
    },
  );
  return result.rows[0].id;
}

/**
 * Upsert an edge by (tenant_id, from_node_id, relationship, to_node_id).
 * Properties merged on conflict.
 */
export async function upsertEdge(
  pool: Pool,
  tenantId: string,
  fromNodeId: string,
  relationship: RelationshipType | string,
  toNodeId: string,
  properties: Record<string, unknown> = {},
  sourceRunId?: string | number | null,
): Promise<string> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{ id: string }>(
    `INSERT INTO gt_kg_edges
         (tenant_id, from_node_id, to_node_id, relationship, properties, source_run_id)
       VALUES
         ($tenant_id, $from_node_id, $to_node_id, $relationship, $properties::jsonb, $source_run_id)
     ON CONFLICT (tenant_id, from_node_id, relationship, to_node_id) DO UPDATE
         SET properties    = gt_kg_edges.properties || EXCLUDED.properties,
             source_run_id = COALESCE(EXCLUDED.source_run_id, gt_kg_edges.source_run_id)
     RETURNING id`,
    {
      tenant_id:     tenantId,
      from_node_id:  fromNodeId,
      to_node_id:    toNodeId,
      relationship,
      properties:    JSON.stringify(properties),
      source_run_id: sourceRunId ?? null,
    },
  );
  return result.rows[0].id;
}

/**
 * Count nodes for a tenant, optionally filtered by label.
 * Used by completion-scoring logic.
 */
export async function countNodes(
  pool: Pool,
  tenantId: string,
  label?: string,
): Promise<number> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{ count: string }>(
    label
      ? `SELECT COUNT(*) AS count FROM gt_kg_nodes WHERE tenant_id = $tenant_id AND label = $label`
      : `SELECT COUNT(*) AS count FROM gt_kg_nodes WHERE tenant_id = $tenant_id`,
    label ? { tenant_id: tenantId, label } : { tenant_id: tenantId },
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Fetch all nodes for a tenant. Sorted by label, name for stable output.
 */
export async function getNodes(pool: Pool, tenantId: string): Promise<KGNode[]> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<KGNode>(
    `SELECT id, tenant_id, label, name, description, properties,
            source_run_id, created_at, updated_at
       FROM gt_kg_nodes
      WHERE tenant_id = $tenant_id
      ORDER BY label, name`,
    { tenant_id: tenantId },
  );
  return result.rows;
}
