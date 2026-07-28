/**
 * VaNi GTM — Import Landing
 *
 * Staged rows -> the tables the product actually reads. This is the step that
 * returned 501 at etl.routes.ts, and the last piece of the import lifecycle.
 *
 *   people    -> gt_contacts (+ gt_contact_channels)   ALWAYS tenant-scoped
 *   companies -> gt_prospects                          tenant's own
 *             -> gt_universe_company_sources           the common pool
 *
 * ── WHAT LANDS AND WHAT WAITS ─────────────────────────────────────────
 *
 * A row lands the moment it is unambiguous. The user does not confirm an
 * import they already confirmed — only genuine clashes come back to them
 * (user ruling, 2026-07-28: "field merge — let user decide"). On a first
 * import into an empty table nothing clashes, so nothing is asked.
 *
 * A row is held at `conflict` when it would change a record that already
 * exists. It is NOT written, and its per-field diff is stored so the review
 * screen can explain the choice rather than just present it.
 *
 * ── CAMPAIGN SAFETY ───────────────────────────────────────────────────
 *
 * "there might already be a campaign running, and changes might impact
 * merge." A target with a live gt_contact_assignments row is flagged
 * campaign_locked and excluded from bulk accept — changing an email or phone
 * mid-sequence misdirects outreach that has already gone out.
 *
 * ── PERFORMANCE ───────────────────────────────────────────────────────
 *
 * Set-based, not row-by-row: the staged rows are read once, every existing
 * record that could collide is fetched in ONE query per entity, the decisions
 * are made in memory, and the writes go out in batches. 2,913 rows is a
 * handful of queries, not 2,913 round trips.
 */

import type { Pool, PoolClient } from 'pg';
import { normalizePersonName, normalizeCompanyName } from './field-normalizers';

/* ── Types ────────────────────────────────────────────────────────────── */

export interface LandingResult {
  session_id: number;
  status: string;
  processed: number;
  successful: number;
  failed: number;
  duplicate: number;
  conflict: number;
  campaign_locked: number;
  orphans: number;
  duration_ms: number;
  landed: { companies: number; people: number; channels: number };
}

interface StagedRow {
  id: number;
  row_number: number;
  mapped_data: any;
  completeness: number | null;
  validity: number | null;
  dedup_key: string | null;
}

interface FieldDiff {
  [field: string]: {
    existing: unknown;
    incoming: unknown;
    recommended: 'keep' | 'take';
    reason: string;
  };
}

/* ── Quality model — a RECOMMENDATION, never a decision ───────────────── */

/**
 * Banded freshness decay on source_as_of (design note §5).
 * FTCCI at 33 months scores 0.6 today and keeps decaying.
 */
export function freshnessWeight(asOf: Date | string | null): number {
  if (!asOf) return 0.5; // undated is treated as stale, not as current
  const months =
    (Date.now() - new Date(asOf).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months <= 6) return 1.0;
  if (months <= 18) return 0.8;
  if (months <= 36) return 0.6;
  return 0.4;
}

/** Fields compared when deciding whether an incoming row changes anything. */
const COMPANY_FIELDS = [
  'domain_normalized', 'website', 'email', 'phone', 'address_line', 'city',
  'state_code', 'pin', 'country', 'industry_raw', 'employees_band',
  'revenue_band', 'linkedin_url', 'year_founded', 'description',
] as const;

const CONTACT_FIELDS = [
  'job_title', 'company_name', 'company_domain', 'linkedin_url', 'location',
] as const;

/**
 * Fields that a live campaign is actually sending to. Changing one of these
 * under a running sequence misdirects real outreach; changing an industry
 * label does not.
 */
const CONTACTABLE = new Set(['email', 'phone', 'mobile', 'linkedin_url']);

/**
 * Compare an incoming row against what is already held.
 *
 * Returns null when the incoming row says nothing new — that is a duplicate,
 * not a conflict, and it must not be put in front of a human.
 */
export function buildFieldDiff(
  existing: Record<string, any>,
  incoming: Record<string, any>,
  fields: readonly string[],
  incomingWeight: number,
  existingWeight: number,
): FieldDiff | null {
  const diff: FieldDiff = {};

  for (const f of fields) {
    const inc = incoming[f];
    const exi = existing[f];

    // Absent in the incoming row: it is not proposing anything.
    if (inc === null || inc === undefined || inc === '') continue;
    if (String(inc) === String(exi ?? '')) continue;

    // Filling a hole is not a conflict — nothing is lost.
    if (exi === null || exi === undefined || exi === '') {
      diff[f] = {
        existing: exi ?? null,
        incoming: inc,
        recommended: 'take',
        reason: 'Nothing recorded for this field yet.',
      };
      continue;
    }

    const takes = incomingWeight > existingWeight;
    diff[f] = {
      existing: exi,
      incoming: inc,
      recommended: takes ? 'take' : 'keep',
      reason: takes
        ? `The new file is fresher (${incomingWeight.toFixed(2)} vs ${existingWeight.toFixed(2)}).`
        : `What you already hold is at least as fresh (${existingWeight.toFixed(2)} vs ${incomingWeight.toFixed(2)}).`,
    };
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

/** True when any field under dispute is one a live sequence sends to. */
function touchesContactable(diff: FieldDiff): boolean {
  return Object.keys(diff).some((f) => CONTACTABLE.has(f));
}

/* ── The landing step ─────────────────────────────────────────────────── */

export async function landSession(
  pool: Pool,
  session: any,
  auth: { tenant_id: string; is_live: boolean; user_id: string },
): Promise<LandingResult> {
  const started = Date.now();
  const sessionId = session.id;
  const isPool = session.destination === 'universe_companies';
  const relationship: string = session.relationship || 'contacts';

  // A customers upload states a fact about the company that a prospects
  // upload does not: they already buy.
  const prospectRelationship = relationship === 'customers' ? 'customer' : 'prospect';

  const load = await pool.query(
    'SELECT id, source_id, as_of FROM gt_source_loads WHERE id = $1',
    [session.load_id],
  );
  const loadRow = load.rows[0] as any | undefined;
  const sourceAsOf: string | null = loadRow?.as_of ?? null;
  const incomingWeight = freshnessWeight(sourceAsOf);

  const staged = await pool.query<StagedRow>(
    `SELECT id, row_number, mapped_data, completeness, validity, dedup_key
     FROM   ki_import_staging
     WHERE  session_id = $1
       AND  processing_status IN ('pending', 'failed', 'conflict')
     ORDER  BY row_number`,
    [sessionId],
  );
  const rows = staged.rows;

  const counts = { successful: 0, failed: 0, duplicate: 0, conflict: 0, campaignLocked: 0 };
  const landed = { companies: 0, people: 0, channels: 0 };

  // ── Pre-load every record that could collide, in one query per entity ──

  const companyKeys = rows.map((r) => r.dedup_key).filter(Boolean) as string[];
  const peopleKeys: string[] = [];
  for (const r of rows) {
    for (const p of (r.mapped_data?.people ?? [])) {
      const k = personKeyOf(p);
      if (k) peopleKeys.push(k);
    }
  }

  const existingCompanies = new Map<string, any>();
  if (!isPool && companyKeys.length > 0) {
    const r = await pool.query(
      `SELECT * FROM gt_prospects
       WHERE tenant_id = $1 AND is_live = $2 AND is_active = true`,
      [auth.tenant_id, auth.is_live],
    );
    for (const row of r.rows as any[]) {
      const key = row.domain_normalized
        ? `d:${row.domain_normalized}`
        : `n:${row.name_key}|${(row.pin ?? '').replace(/\D/g, '')}`;
      existingCompanies.set(key, row);
    }
  }

  const existingPeople = new Map<string, any>();
  if (peopleKeys.length > 0) {
    const r = await pool.query(
      `SELECT * FROM gt_contacts
       WHERE tenant_id = $1 AND is_live = $2 AND is_active = true`,
      [auth.tenant_id, auth.is_live],
    );
    for (const row of r.rows as any[]) {
      if (row.person_key) existingPeople.set(row.person_key, row);
    }
  }

  // Which existing contacts are mid-campaign. One query, not one per row.
  const lockedContacts = new Set<number>();
  if (existingPeople.size > 0) {
    const r = await pool.query(
      `SELECT DISTINCT a.contact_id
       FROM   gt_contact_assignments a
       JOIN   gt_campaigns c ON c.id = a.campaign_id
       WHERE  a.tenant_id = $1
         AND  a.is_live = $2
         AND  a.stage NOT IN ('converted', 'lost')
         AND  c.status IN ('active', 'running', 'live')`,
      [auth.tenant_id, auth.is_live],
    );
    for (const row of r.rows as any[]) lockedContacts.add(Number(row.contact_id));
  }

  // Keys already consumed by an earlier row of THIS file.
  const seenCompanyKeys = new Set<string>();
  const seenPersonKeys = new Set<string>();

  /* ── Decide and write, row by row inside one transaction per batch ──── */

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of rows) {
      try {
        const company = row.mapped_data?.company ?? null;
        const people: any[] = row.mapped_data?.people ?? [];

        let rowStatus: 'success' | 'duplicate' | 'conflict' | 'failed' = 'success';
        let conflictKind: string | null = null;
        let conflictTable: string | null = null;
        let conflictTargetId: number | null = null;
        let diff: FieldDiff | null = null;
        let locked = false;
        let createdId: string | null = null;
        let createdType: string | null = null;
        const errors: string[] = [];

        /* ── Company ── */
        if (company && company.name) {
          if (isPool) {
            const id = await upsertUniverseSource(
              client, company, row, loadRow, sourceAsOf,
            );
            createdId = String(id);
            createdType = 'universe_company_source';
            landed.companies++;
          } else if (row.dedup_key) {
            const existing = existingCompanies.get(row.dedup_key);
            const seenInFile = seenCompanyKeys.has(row.dedup_key);

            if (existing || seenInFile) {
              const target = existing ?? null;
              diff = target
                ? buildFieldDiff(
                    target, company, COMPANY_FIELDS, incomingWeight,
                    freshnessWeight(target.source_as_of),
                  )
                : null;

              if (diff) {
                rowStatus = 'conflict';
                conflictKind = existing ? 'existing' : 'in_file';
                conflictTable = 'gt_prospects';
                conflictTargetId = target ? Number(target.id) : null;
              } else {
                rowStatus = 'duplicate';
              }
            } else {
              const id = await insertProspect(
                client, company, row, auth, session, prospectRelationship, sourceAsOf,
              );
              createdId = String(id);
              createdType = 'gt_prospects';
              landed.companies++;
              seenCompanyKeys.add(row.dedup_key);
              // So a later row in the same file sees it.
              existingCompanies.set(row.dedup_key, {
                ...company, id, source_as_of: sourceAsOf, name_key: normalizeCompanyName(company.name),
              });
            }
          } else {
            rowStatus = 'failed';
            errors.push('No name or domain — the row cannot be identified.');
          }
        }

        /* ── People ── */
        for (const person of people) {
          if (!person?.name) continue;
          const pKey = personKeyOf(person);
          if (!pKey) continue;

          const existing = existingPeople.get(pKey);
          if (existing) {
            const pDiff = buildFieldDiff(
              existing, person, CONTACT_FIELDS, incomingWeight,
              freshnessWeight(existing.source_as_of),
            );
            if (pDiff) {
              // A person conflict outranks a clean company on the same row:
              // the row cannot land while part of it is undecided.
              rowStatus = 'conflict';
              conflictKind = 'existing';
              conflictTable = 'gt_contacts';
              conflictTargetId = Number(existing.id);
              diff = { ...(diff ?? {}), ...pDiff };
              if (lockedContacts.has(Number(existing.id)) && touchesContactable(pDiff)) {
                locked = true;
              }
            } else if (rowStatus === 'success' && !company) {
              rowStatus = 'duplicate';
            }
          } else if (!seenPersonKeys.has(pKey)) {
            const contactId = await insertContact(
              client, person, row, auth, session, sourceAsOf,
              createdType === 'gt_prospects' ? Number(createdId) : null,
            );
            landed.people++;
            landed.channels += await insertChannels(client, contactId, person, auth);
            seenPersonKeys.add(pKey);
            existingPeople.set(pKey, { ...person, id: contactId, source_as_of: sourceAsOf });
            if (!createdType) { createdId = String(contactId); createdType = 'gt_contacts'; }
          }
        }

        if (!company && people.length === 0) {
          rowStatus = 'failed';
          errors.push('Nothing to import from this row.');
        }

        if (rowStatus === 'conflict') counts.conflict++;
        else if (rowStatus === 'duplicate') counts.duplicate++;
        else if (rowStatus === 'failed') counts.failed++;
        else counts.successful++;
        if (locked) counts.campaignLocked++;

        await client.query(
          `UPDATE ki_import_staging
           SET processing_status = $2, conflict_kind = $3, conflict_target_table = $4,
               conflict_target_id = $5, field_diff = $6::jsonb, campaign_locked = $7,
               created_record_id = $8, created_record_type = $9,
               error_messages = $10, processed_at = now()
           WHERE id = $1`,
          [
            row.id, rowStatus, conflictKind, conflictTable, conflictTargetId,
            diff ? JSON.stringify(diff) : null, locked,
            createdId, createdType, errors.length ? errors : null,
          ],
        );
      } catch (rowErr: any) {
        // One bad row must not take the import down, and it must not be
        // silently skipped either (rule 12).
        counts.failed++;
        await client.query(
          `UPDATE ki_import_staging
           SET processing_status = 'failed', error_messages = $2, processed_at = now()
           WHERE id = $1`,
          [row.id, [rowErr.message || 'Unknown error']],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const status = counts.conflict > 0
    ? 'needs_review'
    : counts.failed > 0 ? 'completed_with_errors' : 'completed';

  await pool.query(
    `UPDATE ki_import_sessions
     SET status = $2, processed_records = $3, successful_records = $4,
         failed_records = $5, duplicate_records = $6,
         processing_completed_at = now()
     WHERE id = $1`,
    [sessionId, status, rows.length, counts.successful, counts.failed, counts.duplicate],
  );

  return {
    session_id: sessionId,
    status,
    processed: rows.length,
    successful: counts.successful,
    failed: counts.failed,
    duplicate: counts.duplicate,
    conflict: counts.conflict,
    campaign_locked: counts.campaignLocked,
    orphans: 0,
    duration_ms: Date.now() - started,
    landed,
  };
}

/* ── Writers ──────────────────────────────────────────────────────────── */

function personKeyOf(p: any): string | null {
  const name = normalizePersonName(p?.name);
  if (!name) return null;
  const employer =
    (p.company_domain ? String(p.company_domain).toLowerCase().trim() : '') ||
    normalizeCompanyName(p.company_name) || '';
  return `${name}|${employer}`;
}

async function insertProspect(
  client: PoolClient, c: any, row: StagedRow, auth: any, session: any,
  relationship: string, sourceAsOf: string | null,
): Promise<number> {
  // Tenant-facing id: PROS-0001. Raw PKs are never exposed (CLAUDE.md).
  const seq = await client.query('SELECT gt_next_seq($1, $2) AS ref', [auth.tenant_id, 'prospect']);
  const ref = (seq.rows[0] as any).ref;

  const r = await client.query(
    `INSERT INTO gt_prospects
       (tenant_id, is_live, ref, load_id, source, relationship,
        name, domain_normalized, website, email, phone, address_line, city,
        state_code, pin, country, industry_raw, employees_band, revenue_band,
        linkedin_url, year_founded, description, raw,
        completeness, validity, source_as_of, created_by)
     VALUES ($1,$2,$3,$4,'upload',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             $17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,$26)
     RETURNING id`,
    [
      auth.tenant_id, auth.is_live, ref, session.load_id, relationship,
      c.name, c.domain_normalized, c.website, c.email, c.phone, c.address_line,
      c.city, c.state_code, c.pin, c.country, c.industry_raw, c.employees_band,
      c.revenue_band, c.linkedin_url, c.year_founded, c.description,
      JSON.stringify(row.mapped_data ?? {}),
      row.completeness, row.validity, sourceAsOf, auth.user_id,
    ],
  );
  return Number((r.rows[0] as any).id);
}

async function insertContact(
  client: PoolClient, p: any, row: StagedRow, auth: any, session: any,
  sourceAsOf: string | null, prospectId: number | null,
): Promise<number> {
  const r = await client.query(
    `INSERT INTO gt_contacts
       (tenant_id, is_live, prefix, name, job_title, company_name, company_domain,
        linkedin_url, location, source, raw, prospect_id,
        load_id, source_as_of, completeness, validity, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'upload',$10::jsonb,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      auth.tenant_id, auth.is_live, p.prefix, p.name, p.job_title,
      p.company_name, p.company_domain, p.linkedin_url, p.location,
      JSON.stringify(row.mapped_data ?? {}), prospectId,
      session.load_id, sourceAsOf, row.completeness, row.validity, auth.user_id,
    ],
  );
  return Number((r.rows[0] as any).id);
}

/** Email and mobile are channels, not columns — gt_contacts has no email. */
async function insertChannels(
  client: PoolClient, contactId: number, p: any, auth: any,
): Promise<number> {
  let n = 0;
  const channels: [string, string | null][] = [
    ['email', p.email],
    ['mobile', p.mobile],
  ];
  for (const [type, value] of channels) {
    if (!value) continue;
    await client.query(
      `INSERT INTO gt_contact_channels
         (contact_id, tenant_id, is_live, channel_type, channel_value, is_primary, source)
       VALUES ($1,$2,$3,$4,$5,true,'upload')`,
      [contactId, auth.tenant_id, auth.is_live, type, value],
    );
    n++;
  }
  return n;
}

/**
 * The pool keeps every source's own row, immutable. The golden record is
 * DERIVED from them (design note §3) — that resolution is the Phase B merge
 * engine and is not run here.
 *
 * Upsert on (source_id, source_record_id) is what makes re-ingest idempotent.
 */
async function upsertUniverseSource(
  client: PoolClient, c: any, row: StagedRow, loadRow: any, sourceAsOf: string | null,
): Promise<number> {
  // Sources without a stable id get a hash of the row, per the design note.
  const recordId =
    row.mapped_data?.source_record_id ||
    row.dedup_key ||
    `row:${loadRow?.id}:${row.row_number}`;

  const r = await client.query(
    `INSERT INTO gt_universe_company_sources
       (source_id, load_id, source_record_id, name, domain_normalized, website,
        email, phone, address_line, city, state_code, pin, country,
        industry_raw, employees_band, revenue_band, linkedin_url, year_founded,
        description, raw, source_as_of, completeness, validity, blocking_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
             $19,$20::jsonb,$21,$22,$23,$24)
     ON CONFLICT (source_id, source_record_id) DO UPDATE SET
       name = EXCLUDED.name,
       domain_normalized = EXCLUDED.domain_normalized,
       website = EXCLUDED.website, email = EXCLUDED.email, phone = EXCLUDED.phone,
       address_line = EXCLUDED.address_line, city = EXCLUDED.city,
       state_code = EXCLUDED.state_code, pin = EXCLUDED.pin,
       country = EXCLUDED.country, industry_raw = EXCLUDED.industry_raw,
       employees_band = EXCLUDED.employees_band, revenue_band = EXCLUDED.revenue_band,
       linkedin_url = EXCLUDED.linkedin_url, year_founded = EXCLUDED.year_founded,
       description = EXCLUDED.description, raw = EXCLUDED.raw,
       source_as_of = EXCLUDED.source_as_of, completeness = EXCLUDED.completeness,
       validity = EXCLUDED.validity, blocking_key = EXCLUDED.blocking_key,
       updated_at = now()
     RETURNING id`,
    [
      loadRow?.source_id, loadRow?.id, String(recordId), c.name, c.domain_normalized,
      c.website, c.email, c.phone, c.address_line, c.city, c.state_code, c.pin,
      c.country, c.industry_raw, c.employees_band, c.revenue_band, c.linkedin_url,
      c.year_founded, c.description, JSON.stringify(row.mapped_data ?? {}),
      sourceAsOf, row.completeness, row.validity, row.dedup_key,
    ],
  );
  return Number((r.rows[0] as any).id);
}
