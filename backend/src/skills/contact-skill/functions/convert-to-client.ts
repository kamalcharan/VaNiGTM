/**
 * contact-skill: convert_to_client
 *
 * Converts a prospect contact to a full client:
 *   1. Validates contact exists, is not already a client
 *   2. Creates ki_clients record (1:1 with contact)
 *   3. Optionally creates ki_families row if is_family_head=true
 *   4. Optionally creates ki_client_addresses row
 *   5. Seeds ki_goals from snapshot.goals_lite (if snapshot exists)
 *   6. Sets ki_contacts.is_client = true
 *
 * All in one transaction.
 */

import { SkillContext } from '../../../shared/types';

interface AddressInput {
  address_type?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country?: string;
  pincode: string;
}

interface ConvertToClientParams {
  contact_id: number;
  pan?: string;
  dob?: string;
  anniversary_date?: string;
  ext_ref_id?: string;
  family_id?: string;        // existing family UUID to join
  is_family_head?: boolean;  // if true AND no family_id, creates new ki_families row
  referred_by_name?: string;
  address?: AddressInput;
}

interface ConvertToClientResult {
  client: {
    id: number;
    client_uid: string;
    client_no: string;
    contact_id: number;
    ext_ref_id: string | null;
    pan: string | null;
    risk_profile: string | null;
    onboarding_status: string;
  };
  goals_seeded: number;
  recipe: 'client-card';
}

const VALID_ADDRESS_TYPES = ['residential', 'office', 'mailing', 'permanent', 'temporary', 'other'] as const;

export async function convert_to_client(
  params: ConvertToClientParams,
  ctx: SkillContext
): Promise<ConvertToClientResult> {
  const { contact_id, pan, dob, anniversary_date, ext_ref_id, family_id,
          is_family_head = false, referred_by_name, address } = params;

  const result = await ctx.db.transaction(async (tx) => {
    // 1. Fetch contact — must exist, be active, and not already a client
    const contactRes = await tx.query<{
      id: number; name: string; prefix: string; is_client: boolean; is_active: boolean;
    }>(
      `SELECT id, name, prefix, is_client, is_active FROM ki_contacts
       WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live`,
      { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
    );
    const contact = contactRes.rows[0];
    if (!contact)          throw new Error(`Contact ${contact_id} not found`);
    if (!contact.is_active) throw new Error(`Contact ${contact_id} is inactive`);
    if (contact.is_client)  throw new Error(`Contact ${contact_id} is already a client`);

    // 2. Fetch snapshot — try new versioned table first, fall back to legacy
    const snapRes = await tx.query<{
      id: number;
      risk_profile: string | null;
    }>(
      `SELECT id, risk_profile FROM ki_contact_snapshots
       WHERE contact_id = $contact_id AND tenant_id = $tenant_id
         AND is_live = $is_live AND status = 'active'
       LIMIT 1`,
      { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
    );
    const snapshot = snapRes.rows[0] ?? null;

    // Fetch tenant default risk profile from settings JSONB for fallback
    const tenantProfileRes = await tx.query<{ default_risk_profile: string | null }>(
      `SELECT settings->>'default_risk_profile' AS default_risk_profile
       FROM vn_tenant_profiles WHERE tenant_id = $tenant_id`,
      { $tenant_id: ctx.tenant_id }
    );
    const tenantDefaultRisk = tenantProfileRes.rows[0]?.default_risk_profile ?? null;

    // Fetch goals from new ki_snapshot_goals (or fall back to legacy goals_lite)
    let goalsFromSnapshot: Array<{ name: string; target_amount: number; timeline_years: number; goal_type: string; snapshot_goal_id: number }> = [];
    if (snapshot?.id) {
      const goalsRes = await tx.query<{
        id: number; goal_type: string; name: string;
        target_amount: number; timeline_years: number;
      }>(
        `SELECT id, goal_type, name, target_amount, timeline_years
         FROM ki_snapshot_goals WHERE snapshot_id = $snapshot_id
         ORDER BY priority, sort_order, id`,
        { $snapshot_id: snapshot.id }
      );
      goalsFromSnapshot = goalsRes.rows.map(r => ({
        name: r.name, target_amount: r.target_amount,
        timeline_years: r.timeline_years, goal_type: r.goal_type,
        snapshot_goal_id: r.id,
      }));
    } else {
      // Legacy fallback: goals_lite from old ki_contact_snapshot table
      const legacyRes = await tx.query<{
        goals_lite: Array<{ name: string; target_amount: number; timeline_years: number }> | null;
      }>(
        `SELECT goals_lite FROM ki_contact_snapshot
         WHERE contact_id = $contact_id AND is_live = $is_live`,
        { $contact_id: contact_id, $is_live: ctx.is_live }
      );
      const legacy = legacyRes.rows[0]?.goals_lite ?? [];
      goalsFromSnapshot = legacy.map(g => ({
        ...g, goal_type: 'custom', snapshot_goal_id: 0,
      }));
    }

    // 3. Resolve family_id — create new family if is_family_head and no family given
    let resolvedFamilyId: string | null = family_id ?? null;
    if (is_family_head && !resolvedFamilyId) {
      const familyRes = await tx.query<{ id: string }>(
        `INSERT INTO ki_families (tenant_id, is_live, created_by)
         VALUES ($tenant_id, $is_live, $created_by)
         RETURNING id`,
        { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $created_by: ctx.user_id }
      );
      resolvedFamilyId = familyRes.rows[0].id;
    }

    // 4. Create ki_clients record
    // name is required (NOT NULL from migration 001) — carry from contact
    const clientRes = await tx.query<{
      id: number; client_uid: string; client_no: string; contact_id: number;
      ext_ref_id: string | null; pan: string | null;
      risk_profile: string | null; onboarding_status: string;
    }>(
      `INSERT INTO ki_clients
         (name, contact_id, tenant_id, is_live, client_no, pan, dob, anniversary_date, ext_ref_id,
          family_id, is_family_head, risk_profile, referred_by_name, created_by)
       VALUES
         ($name, $contact_id, $tenant_id, $is_live,
          ki_next_seq($tenant_id::uuid, 'client'),
          $pan, $dob, $anniversary_date, $ext_ref_id,
          $family_id, $is_family_head, $risk_profile, $referred_by_name, $created_by)
       RETURNING id, client_uid, client_no, contact_id, ext_ref_id, pan, risk_profile, onboarding_status`,
      {
        $name:            contact.name,
        $contact_id:      contact_id,
        $tenant_id:       ctx.tenant_id,
        $is_live:         ctx.is_live,
        $pan:             pan ?? null,
        $dob:             dob ?? null,
        $anniversary_date: anniversary_date ?? null,
        $ext_ref_id:      ext_ref_id ?? null,
        $family_id:       resolvedFamilyId,
        $is_family_head:  is_family_head,
        $risk_profile:    snapshot?.risk_profile ?? tenantDefaultRisk,
        $referred_by_name: referred_by_name ?? null,
        $created_by:      ctx.user_id,
      }
    );
    const client = clientRes.rows[0];

    // 5. Update ki_families.head_client_id if this is the family head
    if (is_family_head && resolvedFamilyId) {
      await tx.query(
        `UPDATE ki_families SET head_client_id = $client_id WHERE id = $family_id`,
        { $client_id: client.id, $family_id: resolvedFamilyId }
      );
    }

    // 6. Add address if provided
    if (address) {
      const addrType = VALID_ADDRESS_TYPES.includes(address.address_type as typeof VALID_ADDRESS_TYPES[number])
        ? address.address_type! : 'residential';
      await tx.query(
        `INSERT INTO ki_client_addresses
           (client_id, tenant_id, is_live, address_type, line1, line2, city, state, country, pincode, is_primary)
         VALUES ($client_id, $tenant_id, $is_live, $address_type, $line1, $line2, $city, $state, $country, $pincode, true)
         ON CONFLICT (client_id, address_type, is_live) DO NOTHING`,
        {
          $client_id:    client.id,
          $tenant_id:    ctx.tenant_id,
          $is_live:      ctx.is_live,
          $address_type: addrType,
          $line1:        address.line1,
          $line2:        address.line2 ?? null,
          $city:         address.city,
          $state:        address.state,
          $country:      address.country ?? 'India',
          $pincode:      address.pincode,
        }
      );
    }

    // 7. Seed ki_goals from ki_snapshot_goals (or legacy goals_lite)
    let goalsSeeded = 0;
    for (const goal of goalsFromSnapshot) {
      const goalRes = await tx.query<{ id: number }>(
        `INSERT INTO ki_goals
           (tenant_id, is_live, client_id, name, goal_type,
            target_amount, target_date, inflation_rate, expected_return,
            current_corpus, monthly_sip, status)
         VALUES ($tenant_id, $is_live, $client_id, $name, $goal_type,
                 $target_amount,
                 (CURRENT_DATE + ($timeline_years || ' years')::INTERVAL)::DATE,
                 6.0, 12.0, 0, 0, 'active')
         RETURNING id`,
        {
          $tenant_id:      ctx.tenant_id,
          $is_live:        ctx.is_live,
          $client_id:      client.id,
          $name:           goal.name,
          $goal_type:      goal.goal_type,
          $target_amount:  goal.target_amount,
          $timeline_years: goal.timeline_years,
        }
      );
      const newGoalId = goalRes.rows[0]?.id;
      goalsSeeded++;

      // Link snapshot goal → ki_goals so history view knows where this goal went
      if (goal.snapshot_goal_id > 0 && newGoalId) {
        await tx.query(
          `UPDATE ki_snapshot_goals SET seeded_goal_id = $goal_id
           WHERE id = $snapshot_goal_id`,
          { $goal_id: newGoalId, $snapshot_goal_id: goal.snapshot_goal_id }
        );
      }
    }

    // 8. Mark contact as converted
    await tx.query(
      `UPDATE ki_contacts SET is_client = true, updated_at = now()
       WHERE id = $contact_id AND tenant_id = $tenant_id`,
      { $contact_id: contact_id, $tenant_id: ctx.tenant_id }
    );

    return { client, goals_seeded: goalsSeeded };
  });

  return { ...result, recipe: 'client-card' };
}
