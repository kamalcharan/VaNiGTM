import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readCsvRecords, CsvFormatError } from '../csv-stream';

const dir = mkdtempSync(path.join(tmpdir(), 'csv-stream-'));
let n = 0;
const file = (text: string) => { const p = path.join(dir, `f${++n}.csv`); writeFileSync(p, text, 'utf8'); return p; };
const all = async (p: string, from = 0) => { const out = []; for await (const r of readCsvRecords(p, from)) out.push(r); return out; };

describe('readCsvRecords', () => {
  it('reads plain rows keyed by header, numbering data rows from 1', async () => {
    const rows = await all(file('NAME,CITY\nAcme,Hyderabad\nBeta,Pune\n'));
    expect(rows).toEqual([
      { rowNumber: 1, record: { NAME: 'Acme', CITY: 'Hyderabad' } },
      { rowNumber: 2, record: { NAME: 'Beta', CITY: 'Pune' } },
    ]);
  });

  it('handles quotes, escaped quotes, commas and newlines inside quotes, CRLF', async () => {
    const rows = await all(file('NAME,NOTE\r\n"Acme, Pvt Ltd","said ""hi""\r\nline two"\r\nBeta,x\r\n'));
    expect(rows[0].record).toEqual({ NAME: 'Acme, Pvt Ltd', NOTE: 'said "hi"\r\nline two' }); // kept as delivered (RFC 4180)
    expect(rows[1].record).toEqual({ NAME: 'Beta', NOTE: 'x' });
  });

  it('drops a BOM on the first header and skips blank lines (same numbering as the xlsx path)', async () => {
    const rows = await all(file('﻿NAME,PIN\n\nAcme,500004\n   ,  \nBeta,500055\n'));
    expect(rows.map((r) => [r.rowNumber, r.record.NAME])).toEqual([[1, 'Acme'], [2, 'Beta']]);
    expect(rows[0].record.PIN).toBe('500004');   // a string — leading zeros would survive
  });

  it('keeps cells beyond the header instead of dropping them', async () => {
    const rows = await all(file('A,B\n1,2,3\n'));
    expect(rows[0].record).toEqual({ A: '1', B: '2', __extra_3: '3' });
  });

  it('fills a short row with empty strings', async () => {
    const rows = await all(file('A,B,C\n1\n'));
    expect(rows[0].record).toEqual({ A: '1', B: '', C: '' });
  });

  it('a last row without a trailing newline is still read', async () => {
    expect((await all(file('A\nlast'))).map((r) => r.record.A)).toEqual(['last']);
  });

  it('resumes after a row without yielding the earlier ones', async () => {
    const p = file('A\n1\n2\n3\n4\n');
    expect((await all(p, 2)).map((r) => [r.rowNumber, r.record.A])).toEqual([[3, '3'], [4, '4']]);
  });

  it('refuses a file that ends inside a quoted field', async () => {
    await expect(all(file('A,B\n"open,1\n'))).rejects.toBeInstanceOf(CsvFormatError);
  });

  it('refuses a header that repeats a column name', async () => {
    await expect(all(file('A,A\n1,2\n'))).rejects.toThrow(/repeats a column name/);
  });
});
