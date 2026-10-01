/**
 * Turning a delivered row into a staging row — ONE implementation for both
 * paths: the request path (small files, `POST /etl/sessions`) and the worker
 * path (large CSVs, `IMPORT_STAGE_REQUESTED`, stage-job.ts). Moved out of
 * etl.routes.ts unchanged, so a row stages identically whichever path took it.
 *
 * Quality is scored HERE, before anything lands — the whole point of staging.
 */
import type { Pool, PoolClient } from 'pg';
import { mapCustomerRow } from './customer-processor';
import { mapCompanyRow } from './company-processor';
import { mapContactRow } from './contact-processor';
import {
  companyRowFor, personRowForSlot, identityMapping, unmappedColumns,
  type ResolvedMapping,
} from './mapping-plan';

export interface StagingContext {
  importType: string;
  /** The human's assignment, or the detector's plan in the same shape. */
  explicit: ResolvedMapping | null;
  /** Legacy customer field map. */
  mappings: Record<string, string>;
}

export interface StagingRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  completeness: number | null;
  validity: number | null;
  rejects: unknown[];
  dedupKey: string | null;
}

export function buildStagingRow(raw: Record<string, unknown>, rowNumber: number, ctx: StagingContext): StagingRow {
  let mappedData: Record<string, unknown>;
  let completeness: number | null = null;
  let validity: number | null = null;
  let rejects: unknown[] = [];
  let dedupKey: string | null = null;
  const explicit = ctx.explicit;

  if (ctx.importType === 'company' && explicit) {
    // One source row can produce a company AND the people at it, so
    // mapped_data carries both.
    const companyRow = companyRowFor(raw as Record<string, any>, explicit.company);
    const company = Object.keys(explicit.company).length > 0
      ? mapCompanyRow(companyRow, identityMapping(companyRow))
      : null;

    const people = explicit.people
      .map((slot) => {
        const personRow = personRowForSlot(raw as Record<string, any>, slot, explicit.company);
        return mapContactRow(personRow, identityMapping(personRow));
      })
      .filter((p) => p.mapped.name);

    const claimed = [
      ...Object.keys(explicit.company),
      ...explicit.people.flatMap((slot) => Object.keys(slot)),
    ];
    mappedData = {
      company: company?.mapped ?? null,
      people: people.map((p) => p.mapped),
      // Everything no field claimed, kept for future use.
      metadata: unmappedColumns(raw as Record<string, any>, claimed),
    };

    const primary = company ?? people[0] ?? null;
    completeness = primary?.quality.completeness ?? null;
    validity = primary?.quality.validity ?? null;
    rejects = [
      ...(company?.quality.reject_reasons ?? []),
      ...people.flatMap((p) => p.quality.reject_reasons),
    ];
    dedupKey = primary?.dedup_key ?? null;
  } else {
    // MFD customer import — untouched legacy path.
    mappedData = mapCustomerRow(raw as Record<string, any>, ctx.mappings);
  }
  return { rowNumber, raw, mappedData, completeness, validity, rejects, dedupKey };
}

/** One multi-row INSERT. Runs on whatever it is given — a pool, or a client inside a transaction. */
export async function insertStagingRows(db: Pool | PoolClient, sessionId: number, rows: StagingRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  rows.forEach((r, idx) => {
    const o = idx * 8;
    placeholders.push(
      `($${o + 1}, $${o + 2}, $${o + 3}::jsonb, $${o + 4}::jsonb,` +
      ` $${o + 5}, $${o + 6}, $${o + 7}::jsonb, $${o + 8})`,
    );
    values.push(
      sessionId, r.rowNumber, JSON.stringify(r.raw), JSON.stringify(r.mappedData),
      r.completeness, r.validity, JSON.stringify(r.rejects), r.dedupKey,
    );
  });
  await db.query(
    `INSERT INTO ki_import_staging
       (session_id, row_number, raw_data, mapped_data,
        completeness, validity, reject_reasons, dedup_key)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}
