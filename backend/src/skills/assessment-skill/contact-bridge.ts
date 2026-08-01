/**
 * VaNi AI — lead → gt_contacts bridge.
 *
 * A captured lead is a person, and gt_contacts is this codebase's person
 * table. Bridging means VaNi leads appear in /contacts and are reachable by
 * campaigns, sequences, channels and journeys without any of those knowing
 * VaNi exists. gt_lead keeps the assessment facts (band, score, answers,
 * report) — see migration 231 for why both rows exist.
 *
 * Follows contact-skill's promote_from_brief precedent: a person promoted
 * from another subsystem carries provenance saying where they came from
 * (source='vani:<slug>'), so nobody later mistakes an assessment respondent
 * for a hand-typed contact or an uploaded one.
 *
 * DEDUP. Someone can take the assessment twice, or already exist as a
 * contact from an upload. We match on gt_contacts.person_key — the
 * generated blocking key (normalised name | employer) that migration 198
 * defines and etl/contact-processor.ts computes the same way. It is a
 * BLOCKING key, not an identity: it narrows candidates. Inside the block we
 * confirm on email, which is the strong identifier but lives in
 * gt_contact_channels and so cannot be the block itself. Same two-step the
 * ETL path uses — deliberately not a different dedup rule for this door.
 *
 * person_key is GENERATED ALWAYS — read it, never write it.
 */

import type { SkillDb } from '../../types/skill.types';

export interface BridgeInput {
  tenantId: string;
  isLive: boolean;
  name: string;
  email: string;
  company: string;
  roleTitle: string;
  phone?: string | null;
  serviceSlug: string;
}

/** Mirrors gt_contacts.person_key's generated expression (migration 198). */
function personKey(name: string, company: string): string {
  const normName = name
    .replace(/^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+/i, '')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const normCompany = (company || '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return `${normName}|${normCompany}`;
}

/**
 * Creates or reuses a gt_contacts row for this lead, attaches email/phone
 * channels and the 'VaNi assessment' tag, and returns the contact id.
 *
 * Called in its OWN transaction, after the lead capture has already
 * committed — not inside it. A failed statement poisons a Postgres
 * transaction, so bridging inside the capture would mean a bridge error
 * took the lead down with it (and the catch could not even log, since the
 * logging INSERT would fail too). See the call site in assessment.agent.ts.
 */
export async function bridgeLeadToContact(tx: SkillDb, input: BridgeInput): Promise<number> {
  const key = personKey(input.name, input.company);
  const email = input.email.trim().toLowerCase();

  // Candidates in this person's block, then confirm on email. A block hit
  // with a DIFFERENT email is a different person who happens to share a
  // name and employer — that gets its own contact row, which is the safe
  // direction to be wrong in (a duplicate is recoverable; a merged
  // identity is not).
  const existing = await tx.query<{ id: number }>(
    `SELECT c.id
       FROM gt_contacts c
       JOIN gt_contact_channels ch
         ON ch.contact_id = c.id
        AND ch.channel_type = 'email'
        AND LOWER(ch.channel_value) = $email
      WHERE c.tenant_id = $tenant_id
        AND c.is_live = $is_live
        AND c.is_active = true
        AND c.person_key = $person_key
      LIMIT 1`,
    { tenant_id: input.tenantId, is_live: input.isLive, person_key: key, email },
  );

  let contactId = existing.rows[0]?.id;

  if (contactId) {
    // Known person retaking the assessment — refresh the role/company they
    // just told us, without touching provenance (they were not sourced by
    // VaNi originally if they came from an upload, and rewriting `source`
    // would erase that).
    await tx.query(
      `UPDATE gt_contacts
          SET job_title = COALESCE(NULLIF($job_title, ''), job_title),
              company_name = COALESCE(NULLIF($company_name, ''), company_name),
              updated_at = now()
        WHERE id = $id`,
      { id: contactId, job_title: input.roleTitle, company_name: input.company },
    );
  } else {
    const inserted = await tx.query<{ id: number }>(
      `INSERT INTO gt_contacts
         (tenant_id, is_live, name, job_title, company_name, source, external_ref, contact_no)
       VALUES
         ($tenant_id, $is_live, $name, $job_title, $company_name, $source, $external_ref,
          gt_next_seq($tenant_id::uuid, 'contact'))
       RETURNING id`,
      {
        tenant_id: input.tenantId,
        is_live: input.isLive,
        name: input.name,
        job_title: input.roleTitle,
        company_name: input.company,
        source: `vani:${input.serviceSlug}`,
        external_ref: email,
      },
    );
    contactId = inserted.rows[0].id;
  }

  // Channels. Email is primary — it is how the report reaches them and the
  // only channel the assessment actually verifies is theirs.
  await upsertChannel(tx, contactId, input.tenantId, input.isLive, 'email', email, true, input.serviceSlug);
  if (input.phone?.trim()) {
    await upsertChannel(tx, contactId, input.tenantId, input.isLive, 'mobile', input.phone.trim(), false, input.serviceSlug);
  }

  // Tag, so /contacts can filter to assessment-sourced people. The slug is
  // 'vani assessment' with a SPACE — gt_tags.slug is generated from label
  // and turns non-alphanumerics into spaces, so a hyphen is unreachable.
  // Matching on 'vani-assessment' would silently tag nothing.
  await tx.query(
    `INSERT INTO gt_contact_tags (contact_id, tag_id, tenant_id)
     SELECT $contact_id, g.id, $tenant_id
       FROM gt_tags g
      WHERE g.tenant_id = $tenant_id AND g.slug = 'vani assessment'
     ON CONFLICT (contact_id, tag_id) DO NOTHING`,
    { contact_id: contactId, tenant_id: input.tenantId },
  );

  return contactId;
}

async function upsertChannel(
  tx: SkillDb, contactId: number, tenantId: string, isLive: boolean,
  type: string, value: string, isPrimary: boolean, serviceSlug: string,
): Promise<void> {
  const existing = await tx.query<{ id: number }>(
    `SELECT id FROM gt_contact_channels
      WHERE contact_id = $contact_id AND channel_type = $type
        AND LOWER(channel_value) = LOWER($value)
      LIMIT 1`,
    { contact_id: contactId, type, value },
  );
  if (existing.rows[0]) return;

  await tx.query(
    `INSERT INTO gt_contact_channels
       (contact_id, tenant_id, is_live, channel_type, channel_value, channel_subtype, is_primary, source)
     VALUES ($contact_id, $tenant_id, $is_live, $type, $value, 'work', $is_primary, $source)`,
    {
      contact_id: contactId, tenant_id: tenantId, is_live: isLive,
      type, value, is_primary: isPrimary, source: `vani:${serviceSlug}`,
    },
  );
}
