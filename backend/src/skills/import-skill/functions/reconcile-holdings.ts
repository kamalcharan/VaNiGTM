/**
 * KI-30: reconcile_holdings — Compare imported data against existing holdings
 *
 * Computes holdings from imported transactions (by source = investwell/cas/nse)
 * and compares against existing ki_holdings records.
 * Flags mismatches, new schemes, and removed schemes for manual review.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

/* ── types ─────────────────────────────────────────────── */

interface ExistingHoldingRow {
  holding_id: number;
  scheme_code: string;
  scheme_name: string;
  units: number;
  total_invested: number;
  current_value: number;
}

interface ImportedHoldingRow {
  scheme_code: string;
  scheme_name: string;
  computed_units: number;
  net_invested: number;
}

interface Mismatch {
  scheme_code: string;
  scheme_name: string;
  imported_units: number;
  existing_units: number;
  difference: number;
}

interface SchemeEntry {
  scheme_code: string;
  scheme_name: string;
  units: number;
}

interface ReconcileResult {
  matched: number;
  mismatched: Mismatch[];
  new_schemes: SchemeEntry[];
  removed_schemes: SchemeEntry[];
  recipe: 'data-table';
}

/* ── SQL ───────────────────────────────────────────────── */

const EXISTING_HOLDINGS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/holdings-by-client.sql'),
  'utf-8'
);

const IMPORTED_HOLDINGS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/imported-holdings-by-client.sql'),
  'utf-8'
);

/* ── threshold for unit mismatch (floating point tolerance) */
const UNIT_TOLERANCE = 0.01;

/* ── main function ─────────────────────────────────────── */

export async function reconcile_holdings(
  params: { client_id: number },
  ctx: SkillContext
): Promise<ReconcileResult> {
  const { client_id } = params;

  const [existingResult, importedResult] = await Promise.all([
    ctx.db.query<ExistingHoldingRow>(EXISTING_HOLDINGS_SQL, {
      $tenant_id: ctx.tenant_id,
      $client_id: client_id,
    }),
    ctx.db.query<ImportedHoldingRow>(IMPORTED_HOLDINGS_SQL, {
      $tenant_id: ctx.tenant_id,
      $client_id: client_id,
    }),
  ]);

  // Build lookup maps
  const existingMap = new Map<string, ExistingHoldingRow>();
  for (const row of existingResult.rows) {
    existingMap.set(row.scheme_code, {
      ...row,
      units: Number(row.units),
      total_invested: Number(row.total_invested),
      current_value: Number(row.current_value),
    });
  }

  const importedMap = new Map<string, ImportedHoldingRow>();
  for (const row of importedResult.rows) {
    importedMap.set(row.scheme_code, {
      ...row,
      computed_units: Number(row.computed_units),
      net_invested: Number(row.net_invested),
    });
  }

  let matched = 0;
  const mismatched: Mismatch[] = [];
  const new_schemes: SchemeEntry[] = [];
  const removed_schemes: SchemeEntry[] = [];

  // Compare imported against existing
  for (const [code, imported] of importedMap) {
    const existing = existingMap.get(code);
    if (!existing) {
      new_schemes.push({
        scheme_code: code,
        scheme_name: imported.scheme_name ?? code,
        units: imported.computed_units,
      });
      continue;
    }

    const diff = Math.abs(imported.computed_units - existing.units);
    if (diff <= UNIT_TOLERANCE) {
      matched++;
    } else {
      mismatched.push({
        scheme_code: code,
        scheme_name: existing.scheme_name ?? imported.scheme_name ?? code,
        imported_units: imported.computed_units,
        existing_units: existing.units,
        difference: Number((imported.computed_units - existing.units).toFixed(4)),
      });
    }
  }

  // Schemes in existing but not in imported = removed
  for (const [code, existing] of existingMap) {
    if (!importedMap.has(code)) {
      removed_schemes.push({
        scheme_code: code,
        scheme_name: existing.scheme_name ?? code,
        units: existing.units,
      });
    }
  }

  return {
    matched,
    mismatched,
    new_schemes,
    removed_schemes,
    recipe: 'data-table',
  };
}
