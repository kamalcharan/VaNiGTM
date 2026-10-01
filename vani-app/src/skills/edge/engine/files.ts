/**
 * The registers behind a mission, in memory for this tab only.
 *
 * Raw files are never persisted (the prototype's rule, and the honest one:
 * a 2.6 MB register does not belong in localStorage). What persists is the
 * analysis they produced (`mission.analysis`) and a summary per file. After
 * a reload the tenant reattaches to re-run; until then the last analysis
 * stands, labelled with when it was made.
 */
import { parseTable, project, type Table } from './csv';
import { SCHEMA, reportColumns, readiness, type FileKind, type ColumnReport } from './schema';
import { analyse, type Analysis, type Rulebook, DEFAULT_RULEBOOK } from './analyse';

const KINDS: FileKind[] = ['ap', 'po', 'grn', 'vendor'];
const raw = new Map<FileKind, Table>();
let sample: Partial<Record<FileKind, Table>> | null = null;

export function setTable(kind: FileKind, table: Table): void { raw.set(kind, table); }
export function dropTable(kind: FileKind): void { raw.delete(kind); }
export function ownTables(): Partial<Record<FileKind, Table>> { return Object.fromEntries(raw) as Partial<Record<FileKind, Table>>; }

/** The four sample registers, fetched once per tab. */
export async function sampleTables(): Promise<Partial<Record<FileKind, Table>>> {
  if (sample) return sample;
  const entries = await Promise.all(KINDS.map(async (k) => {
    const r = await fetch(`/edge/data/p2p-${k}-sample.csv`);
    if (!r.ok) throw Error(`Sample register ${k} unavailable (${r.status})`);
    return [k, parseTable(await r.text())] as const;
  }));
  sample = Object.fromEntries(entries);
  return sample;
}

export function columnReports(tables: Partial<Record<FileKind, Table>>): Record<FileKind, ColumnReport> {
  return Object.fromEntries(KINDS.map((k) => [k, reportColumns(k, tables[k] ?? null)])) as Record<FileKind, ColumnReport>;
}

/** Run the rulebook over a set of tables. Throws, with the reasons, when the required registers are not there. */
export function runAnalysis(tables: Partial<Record<FileKind, Table>>, rb: Rulebook = DEFAULT_RULEBOOK): Analysis {
  const ready = readiness(columnReports(tables));
  if (!ready.ok) throw Error(ready.reasons.join('; '));
  const rows = (k: FileKind) => tables[k] ? project(tables[k]!, SCHEMA[k].columns.map((c) => c.name)) : undefined;
  return analyse({ ap: rows('ap')!, po: rows('po')!, grn: rows('grn'), vendor: rows('vendor') }, rb);
}
