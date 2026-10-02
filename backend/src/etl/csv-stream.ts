/**
 * Streaming CSV reader — the chunked-loading path (common pool P1).
 *
 * The synchronous path reads a whole workbook into memory (`parseExcelRows`),
 * which is fine at FTCCI's 2,913 rows and wrong at MCA's ~160,000 per state
 * or Udyam's millions. This reads one record at a time from a file stream.
 *
 * RFC 4180: quoted fields, "" as an escaped quote, commas and newlines inside
 * quotes, CRLF or LF. A UTF-8 BOM on the first header is dropped. Blank lines
 * are skipped, the same as `sheet_to_json` does, so row numbers mean the same
 * thing on both paths: the n-th DATA row, header excluded.
 *
 * Values stay strings. (The xlsx path coerces "500004" to a number and drops
 * leading zeros; the normalisers accept either.) A row with more cells than
 * the header keeps the extras under `__extra_<n>` — never dropped silently.
 */
import { createReadStream } from 'fs';

export interface CsvRecord {
  /** 1-based data row number (header excluded, blank lines skipped). */
  rowNumber: number;
  record: Record<string, string>;
}

export class CsvFormatError extends Error {
  constructor(message: string) { super(message); this.name = 'CsvFormatError'; }
}

/** Parse fields from a stream of text chunks; yields one string[] per row. */
async function* rowsOf(chunks: AsyncIterable<string>): AsyncGenerator<string[]> {
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let quotePending = false; // saw a quote inside quotes; next char decides
  let sawAny = false;

  for await (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      sawAny = true;
      if (inQuotes) {
        if (quotePending) {
          quotePending = false;
          if (ch === '"') { field += '"'; continue; }
          inQuotes = false; // closing quote; fall through to handle ch normally
        } else if (ch === '"') { quotePending = true; continue; }
        else { field += ch; continue; }
      }
      if (ch === '"') {
        if (field.length === 0) { inQuotes = true; continue; }
        field += ch; // a stray quote mid-field is kept as text
        continue;
      }
      if (ch === ',') { row.push(field); field = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(field); field = ''; yield row; row = []; continue; }
      field += ch;
    }
  }
  if (quotePending) { quotePending = false; inQuotes = false; }
  if (inQuotes) throw new CsvFormatError('the file ends inside a quoted field — it is cut short or a quote is unbalanced');
  if (sawAny && (field.length > 0 || row.length > 0)) { row.push(field); yield row; }
}

const isBlank = (cells: string[]) => cells.every((c) => c.trim() === '');

/**
 * Read a CSV file record by record. `fromRow` skips data rows already staged
 * (resume after a crash) without holding them in memory.
 */
export async function* readCsvRecords(path: string, fromRow = 0): AsyncGenerator<CsvRecord> {
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 16 });
  let headers: string[] | null = null;
  let rowNumber = 0;
  for await (const cells of rowsOf(stream as AsyncIterable<string>)) {
    if (!headers) {
      if (isBlank(cells)) continue;
      headers = cells.map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h));
      if (new Set(headers).size !== headers.length) {
        throw new CsvFormatError(`the header row repeats a column name (${headers.join(', ')})`);
      }
      continue;
    }
    if (isBlank(cells)) continue;
    rowNumber++;
    if (rowNumber <= fromRow) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, i) => { record[h] = cells[i] ?? ''; });
    for (let i = headers.length; i < cells.length; i++) record[`__extra_${i + 1}`] = cells[i];
    yield { rowNumber, record };
  }
}
