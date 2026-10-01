/**
 * KI-Prime — Excel/CSV Parser for ETL
 *
 * Parses .xlsx/.xls/.csv files and returns headers + rows.
 * Used by ETL routes for header detection and staging.
 */

import * as XLSX from 'xlsx';

interface ParsedHeaders {
  headers: string[];
  sampleRows: Record<string, any>[];
  totalRows: number;
}

/**
 * Parse Excel file — return headers + first 10 rows for preview.
 */
export function parseExcelHeaders(filePath: string): ParsedHeaders {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

  if (data.length === 0) {
    return { headers: [], sampleRows: [], totalRows: 0 };
  }

  const headers = Object.keys(data[0]);
  const sampleRows = data.slice(0, 10);

  return { headers, sampleRows, totalRows: data.length };
}

/**
 * Parse all rows from Excel file — returns array of objects keyed by header name.
 */
export function parseExcelRows(filePath: string): Record<string, any>[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
}

/**
 * Headers, a sample and a row count — streaming for CSV, so a large file is
 * never held in memory just to show its columns. Workbooks still go through
 * the xlsx library, which cannot stream; their size is bounded by the upload
 * limit and the sync threshold (etl.config.ts).
 */
export async function readHeadersAndSample(filePath: string, opts: { count?: boolean } = {}): Promise<ParsedHeaders> {
  if (!/\.csv$/i.test(filePath)) return parseExcelHeaders(filePath);
  const { readCsvRecords } = await import('./csv-stream');
  const sampleRows: Record<string, any>[] = [];
  let headers: string[] = [];
  let totalRows = 0;
  for await (const { record } of readCsvRecords(filePath)) {
    totalRows++;
    if (sampleRows.length < 10) {
      sampleRows.push(record);
      if (headers.length === 0) headers = Object.keys(record).filter((k) => !k.startsWith('__extra_'));
    }
    // A caller that needs only the columns and a sample stops here — the
    // count would read the whole file (and the worker reads it anyway).
    if (opts.count === false && sampleRows.length >= 10) break;
  }
  return { headers, sampleRows, totalRows };
}
