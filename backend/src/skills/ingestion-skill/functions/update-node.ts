/**
 * ingestion-skill: update_node — a person corrects what VaNi learned.
 *
 * Charan, 2026-09-26: "can the nodes in KG be edited?" Yes, now. The name
 * and the description; the kind stays (a Competitor that is really a
 * Partner is a delete and a re-read, not a relabel, because every edge on
 * it was extracted under the old kind).
 *
 * The edit is recorded on the node (`properties.human_edited`, who, when)
 * and kg.store's upsert respects it: a later read of the same page keeps
 * the human's description instead of overwriting it with the model's.
 * Human edits always win — the same rule the profile drafter follows.
 */
import { SkillContext } from '../../../shared/types';

interface UpdateNodeParams { node_id: string; name?: string; description?: string; }

export async function update_node(params: UpdateNodeParams, ctx: SkillContext) {
  const nodeId = String(params.node_id ?? '').trim();
  if (!nodeId) throw new Error('MISSING_FIELDS: node_id is required');
  const name = params.name === undefined ? undefined : String(params.name).trim();
  const description = params.description === undefined ? undefined : String(params.description).trim();
  if (name === undefined && description === undefined) throw new Error('MISSING_FIELDS: name or description is required');
  if (name !== undefined && !name) throw new Error('INVALID_NAME: a node needs a name');
  if (name !== undefined && name.length > 200) throw new Error('INVALID_NAME: at most 200 characters');

  return ctx.db.transaction(async (tx) => {
    const cur = await tx.query<{ id: string; label: string; name: string }>(
      `SELECT id, label, name FROM gt_kg_nodes WHERE id = $node_id AND tenant_id = $tenant_id`,
      { node_id: nodeId, tenant_id: ctx.tenant_id },
    );
    if (!cur.rows[0]) throw new Error('NODE_NOT_FOUND: No such entry for this tenant');
    const node = cur.rows[0];

    // (tenant, label, name) is unique. A rename onto an existing entry is a
    // merge decision, not a rename — refuse with the name so the person can
    // delete one instead.
    if (name !== undefined && name !== node.name) {
      const clash = await tx.query(
        `SELECT 1 FROM gt_kg_nodes WHERE tenant_id = $tenant_id AND label = $label AND name = $name AND id <> $node_id`,
        { tenant_id: ctx.tenant_id, label: node.label, name, node_id: nodeId },
      );
      if (clash.rows[0]) throw new Error(`NAME_TAKEN: another ${node.label} entry is already called "${name}" — remove one rather than merging them by rename`);
    }

    const r = await tx.query<Record<string, unknown>>(
      `UPDATE gt_kg_nodes
          SET name        = COALESCE($name, name),
              description = COALESCE($description, description),
              properties  = properties || jsonb_build_object('human_edited'::text, true, 'edited_by'::text, $user_id::text, 'edited_at'::text, now()::text),
              updated_at  = now()
        WHERE id = $node_id AND tenant_id = $tenant_id
        RETURNING id, label, name, description, properties, updated_at`,
      { node_id: nodeId, tenant_id: ctx.tenant_id, name: name ?? null, description: description ?? null, user_id: ctx.user_id ?? null },
    );
    return { node: r.rows[0], recipe: 'knowledge-node' as const };
  });
}
