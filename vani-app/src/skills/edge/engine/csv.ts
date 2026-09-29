/**
 * CSV → rows. The same tolerant reader as the reference's `parseCSV`
 * (quoted fields, doubled quotes, CR/LF, a BOM on the first header) but
 * keeping the rows, because the engine reads them. Header lookup is by
 * trimmed, case-insensitive name so "Invoice No" and "invoice no " match.
 */
export type Row = Record<string, string>;

export interface Table { headers: string[]; rows: Row[]; inconsistent: number }

export function parseTable(text: string): Table {
  const grid: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) grid.push(row);
      row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('A quoted value is unfinished. Check the CSV export.');
  row.push(cell);
  if (row.some((v) => v.trim())) grid.push(row);
  if (grid.length < 2) throw Error('Include column headings and at least one data row.');
  const headers = grid[0].map((s) => s.replace(/^﻿/, '').trim());
  const rows = grid.slice(1).map((r) => { const o: Row = {}; headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); }); return o; });
  return { headers, rows, inconsistent: grid.slice(1).filter((r) => r.length !== headers.length).length };
}

/** Find the actual header for an expected column name, or null. */
export function findHeader(headers: string[], expected: string): string | null {
  const want = expected.trim().toLowerCase();
  return headers.find((h) => h.trim().toLowerCase() === want) ?? null;
}

/** Re-key rows onto the expected column names (drops nothing; missing columns stay absent). */
export function project(table: Table, expected: string[]): Row[] {
  const map = expected.map((e) => [e, findHeader(table.headers, e)] as const).filter(([, h]) => h);
  return table.rows.map((r) => { const o: Row = {}; for (const [e, h] of map) o[e] = r[h!]; return o; });
}
