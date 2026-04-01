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
