/** Calculations, CSV inspection and formatting — reference `src/lib/model.js`, verbatim. */
import type { Assumptions } from './types';

export interface Estimate { hours: number; freed: number; value: number; annual: number; net: number; breakeven: number | null }

export function estimate({ volume, minutes, rate, coverage, efficiency, setup, monthly }: Assumptions): Estimate {
  const hours = volume * minutes / 60;
  const freed = hours * coverage / 100 * efficiency / 100;
  const value = freed * rate;
  return { hours, freed, value, annual: value * 12, net: value - monthly, breakeven: value > monthly ? setup / (value - monthly) : null };
}

export function parseCSV(text: string): { headers: string[]; rows: number; inconsistent: number } {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('A quoted value is unfinished. Check the CSV export.');
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2) throw Error('Include column headings and at least one data row.');
  return { headers: rows[0].map((s) => s.replace(/^﻿/, '').trim()), rows: rows.length - 1, inconsistent: rows.slice(1).filter((r) => r.length !== rows[0].length).length };
}

export const escapeHTML = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const money = (n: number): string => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
export const number = (n: number): string => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
