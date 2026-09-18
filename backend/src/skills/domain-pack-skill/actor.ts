/**
 * Who did this, when the schema cannot be told.
 *
 * TWO IDENTITY SPINES, and they are not joinable. `vn_users.id` is what the
 * JWT carries and what `SkillContext.user_id` holds. `vani_user.id` is what
 * `vara_scoring_config.approved_by` and `vani_tenant_pack_binding.bound_by`
 * reference. Nothing populates `vani_user` yet and no bridge exists (migration
 * 245 calls it out in a comment; `vara.routes.ts` hits it twice, on
 * `vara_jd.created_by` and `vani_prompt.approved_by`).
 *
 * Passing the JWT id into either column is a foreign-key violation — which is
 * exactly what a tenant got: "insert or update on table vara_scoring_config
 * violates foreign key constraint vara_scoring_config_approved_by_fkey", with
 * the whole take rolled back. It did not surface in tests because every test
 * passed `user_id: null`, the one value that cannot violate the constraint.
 *
 * So the FK column stays NULL — the same answer the two existing sites give —
 * and the actor goes in `vani_audit_log.actor_id`, which is a bare uuid with
 * no FK and therefore CAN hold a vn_users id. "Who set this bar" stays
 * answerable, which is the whole reason the column exists.
 *
 * Widening the FK, or writing a vn_user → vani_user bridge, is a schema
 * change and needs Charan. Until then this is the seam, named once so the
 * next person does not re-derive it from a constraint error.
 */
export const ACTOR_UNRESOLVED = null;

interface Tx {
  query<T = unknown>(sql: string, params?: Record<string, unknown>): Promise<{ rows: T[] }>;
}

/**
 * One audit row. `agent_id` is a subselect rather than a join in the INSERT:
 * the SELECT form used elsewhere writes NOTHING when the vara agent row is
 * missing, so the audit silently disappears exactly when something is already
 * wrong. A subselect yields NULL instead, which the column allows ("null =
 * platform event").
 */
export async function audit(
  tx: Tx,
  vaniTenantId: string,
  actorId: string | null,
  entityId: string,
  action: string,
  after: Record<string, unknown>,
): Promise<void> {
  await tx.query(
    `INSERT INTO vani_audit_log
       (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, before, after)
     VALUES ($vani_tenant_id, (SELECT id FROM vani_agent WHERE code = 'vara'),
             $actor_type, $actor_id, 'vani_role_family', $entity_id, $action,
             '{}'::jsonb, $after::jsonb)`,
    {
      vani_tenant_id: vaniTenantId,
      // "model" is not a legal actor (migration 240). A skill call always has
      // a person behind it; an unauthenticated one is 'system', not a fake human.
      actor_type: actorId ? 'human' : 'system',
      actor_id: actorId,
      entity_id: entityId,
      action,
      after: JSON.stringify(after),
    },
  );
}
