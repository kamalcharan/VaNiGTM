/**
 * KI-30: import-skill unit tests
 *
 * 3-check pattern per function:
 *   (a) valid data → correct import counts
 *   (b) empty / invalid file → graceful handling
 *   (c) tenant isolation → wrong tenant sees nothing
 * + idempotent reimport test: same file twice = 0 new rows on second pass
 */

import { SkillContext, QueryResult } from '../../../shared/types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* ── mock helpers ──────────────────────────────────────── */

type MockQueryFn = (
  sql: string,
  params?: Record<string, unknown>
) => Promise<QueryResult>;

function createMockContext(
  tenant_id: string,
  queryFn: MockQueryFn
): SkillContext {
  return {
    tenant_id,
    db: {
      query: queryFn as SkillContext['db']['query'],
      transaction: async <T>(fn: (tx: any) => Promise<T>) => fn({ query: queryFn as SkillContext['db']['query'], transaction: async () => { throw new Error('nested'); } }),
    },
  };
}

const TENANT_A = 'tenant-aaa-1111';
const TENANT_WRONG = 'tenant-zzz-9999';
const CLIENT_ID = 2847;

/* ── temp file helper ──────────────────────────────────── */

function writeTempFile(content: string, ext: string): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `ki-test-${Date.now()}${ext}`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function cleanupFile(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

/* ── sample data ───────────────────────────────────────── */

const INVESTWELL_CSV_FORMAT_A = `scheme_code,scheme_name,txn_date,txn_type,amount,units,nav
INF123K01234,HDFC Top 100 Fund,15/01/2024,Purchase,10000.00,98.52,101.50
INF123K01234,HDFC Top 100 Fund,15/02/2024,SIP,5000.00,48.78,102.50
INF456K05678,ICICI Bluechip Fund,20/01/2024,Purchase,25000.00,195.31,128.00
`;

const INVESTWELL_CSV_FORMAT_B = `Scheme Code,Scheme Name,Date,Type,Amount,Units,NAV,Folio
INF789K09012,SBI Equity Fund,01/03/2024,Buy,15000.00,112.78,133.00,12345
INF789K09012,SBI Equity Fund,01/04/2024,SIP Purchase,5000.00,37.31,134.00,12345
`;

const NSE_CSV = `Order No,Order Date,Scheme Code,Scheme Name,Transaction Type,Amount,Units,NAV,Status
ORD001,10/01/2024,INF123K01234,HDFC Top 100 Fund,Purchase,10000.00,98.52,101.50,Completed
ORD002,15/01/2024,INF123K01234,HDFC Top 100 Fund,SIP,5000.00,48.78,102.50,Completed
ORD003,20/01/2024,INF456K05678,ICICI Bluechip Fund,Purchase,25000.00,195.31,128.00,Pending
`;

const CAS_TEXT = `
Consolidated Account Statement
PAN : ABCDE1234F

Folio No: 12345678 / 90
HDFC Top 100 Fund - Direct Plan Growth (Advisor: ABC) INF123K01234
01-Jan-2024 Purchase 10,000.00 98.520 101.5000 98.520
15-Feb-2024 Systematic Investment 5,000.00 48.780 102.5000 147.300
Valuation on 31-Mar-2024 : INR 15,432.50

Folio No: 87654321
ICICI Bluechip Fund - Growth (Registrar: CAMS) INF456K05678
20-Jan-2024 Purchase 25,000.00 195.310 128.0000 195.310
Valuation on 31-Mar-2024 : INR 26,100.00
`;

/* ═══════════════════════════════════════════════════════ */
/* import_investwell tests                                */
/* ═══════════════════════════════════════════════════════ */

describe('import_investwell', () => {
  let csvPath: string;

  afterEach(() => {
    if (csvPath) cleanupFile(csvPath);
  });

  test('(a) imports valid Format A CSV with correct counts', async () => {
    csvPath = writeTempFile(INVESTWELL_CSV_FORMAT_A, '.csv');

    // Track inserted rows (simulate ON CONFLICT returning id for new rows)
    const inserted = new Set<string>();
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      // INSERT query — return id for new rows, empty for dupes
      if (sql.includes('INSERT INTO ki_transactions')) {
        const key = `${params?.$scheme_code}-${params?.$txn_date}-${params?.$amount}-${params?.$units}`;
        if (inserted.has(key)) return { rows: [] };
        inserted.add(key);
        return { rows: [{ id: inserted.size }] };
      }
      // CREATE TABLE / INSERT log
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_investwell } = await import('../functions/import-investwell');
    const result = await import_investwell({ file_path: csvPath }, ctx);

    expect(result.recipe).toBe('data-table');
    expect(result.imported_count).toBe(3);
    expect(result.skipped_count).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.holdings_summary.schemes).toBe(2);
    expect(result.holdings_summary.total_value).toBe(40000); // 10000+5000+25000
  });

  test('(a2) imports valid Format B CSV', async () => {
    csvPath = writeTempFile(INVESTWELL_CSV_FORMAT_B, '.csv');

    const queryFn: MockQueryFn = async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_investwell } = await import('../functions/import-investwell');
    const result = await import_investwell({ file_path: csvPath }, ctx);

    expect(result.imported_count).toBe(2);
    expect(result.holdings_summary.schemes).toBe(1);
  });

  test('(b) returns empty result for file with no data rows', async () => {
    csvPath = writeTempFile('scheme_code,scheme_name,txn_date,txn_type,amount,units,nav\n', '.csv');

    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_investwell } = await import('../functions/import-investwell');
    const result = await import_investwell({ file_path: csvPath }, ctx);

    expect(result.imported_count).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test('(b2) returns error for unrecognised format', async () => {
    csvPath = writeTempFile('col_a,col_b,col_c\n1,2,3\n', '.csv');

    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_investwell } = await import('../functions/import-investwell');
    const result = await import_investwell({ file_path: csvPath }, ctx);

    expect(result.imported_count).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].reason).toContain('Unrecognised');
  });

  test('(c) uses tenant_id from context, not from file', async () => {
    csvPath = writeTempFile(INVESTWELL_CSV_FORMAT_A, '.csv');

    let capturedTenantId = '';
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) {
        capturedTenantId = String(params?.$tenant_id ?? '');
        return { rows: [{ id: 1 }] };
      }
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_WRONG, queryFn);
    const { import_investwell } = await import('../functions/import-investwell');
    await import_investwell({ file_path: csvPath }, ctx);

    expect(capturedTenantId).toBe(TENANT_WRONG);
  });

  test('(d) idempotent reimport — same file twice = 0 new rows second time', async () => {
    csvPath = writeTempFile(INVESTWELL_CSV_FORMAT_A, '.csv');

    const inserted = new Set<string>();
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) {
        const key = `${params?.$scheme_code}-${params?.$txn_date}-${params?.$amount}-${params?.$units}`;
        if (inserted.has(key)) return { rows: [] }; // ON CONFLICT DO NOTHING
        inserted.add(key);
        return { rows: [{ id: inserted.size }] };
      }
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_investwell } = await import('../functions/import-investwell');

    // First import
    const first = await import_investwell({ file_path: csvPath }, ctx);
    expect(first.imported_count).toBe(3);

    // Second import — all dupes
    const second = await import_investwell({ file_path: csvPath }, ctx);
    expect(second.imported_count).toBe(0);
    expect(second.skipped_count).toBe(3);
  });
});

/* ═══════════════════════════════════════════════════════ */
/* import_cas tests                                       */
/* ═══════════════════════════════════════════════════════ */

describe('import_cas', () => {
  let filePath: string;

  afterEach(() => {
    if (filePath) cleanupFile(filePath);
  });

  test('(a) imports CAS text with correct transaction and holdings counts', async () => {
    filePath = writeTempFile(CAS_TEXT, '.txt');

    const inserted = new Set<string>();
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) {
        const key = `${params?.$scheme_code}-${params?.$txn_date}-${params?.$amount}-${params?.$units}`;
        if (inserted.has(key)) return { rows: [] };
        inserted.add(key);
        return { rows: [{ id: inserted.size }] };
      }
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_cas } = await import('../functions/import-cas');
    const result = await import_cas({ file_path: filePath, client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('data-table');
    expect(result.transactions_imported).toBe(3);
    expect(result.clients_found).toBe(1); // 1 PAN
    expect(result.holdings_snapshot.schemes).toBe(2);
    expect(result.holdings_snapshot.total_value).toBeCloseTo(41532.50, 1);
  });

  test('(b) returns empty result for file with no transactions', async () => {
    filePath = writeTempFile('Some random text with no CAS data\n', '.txt');

    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_cas } = await import('../functions/import-cas');
    const result = await import_cas({ file_path: filePath, client_id: CLIENT_ID }, ctx);

    expect(result.transactions_imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('(c) uses tenant_id from context for all inserts', async () => {
    filePath = writeTempFile(CAS_TEXT, '.txt');

    const capturedTenants: string[] = [];
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) {
        capturedTenants.push(String(params?.$tenant_id ?? ''));
        return { rows: [{ id: 1 }] };
      }
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_WRONG, queryFn);
    const { import_cas } = await import('../functions/import-cas');
    await import_cas({ file_path: filePath, client_id: CLIENT_ID }, ctx);

    expect(capturedTenants.length).toBeGreaterThan(0);
    capturedTenants.forEach((t) => expect(t).toBe(TENANT_WRONG));
  });

  test('(d) idempotent reimport — same CAS twice = 0 new rows second time', async () => {
    filePath = writeTempFile(CAS_TEXT, '.txt');

    const inserted = new Set<string>();
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) {
        const key = `${params?.$scheme_code}-${params?.$txn_date}-${params?.$amount}-${params?.$units}`;
        if (inserted.has(key)) return { rows: [] };
        inserted.add(key);
        return { rows: [{ id: inserted.size }] };
      }
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_cas } = await import('../functions/import-cas');

    const first = await import_cas({ file_path: filePath, client_id: CLIENT_ID }, ctx);
    expect(first.transactions_imported).toBe(3);

    const second = await import_cas({ file_path: filePath, client_id: CLIENT_ID }, ctx);
    expect(second.transactions_imported).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════ */
/* import_nse_transactions tests                          */
/* ═══════════════════════════════════════════════════════ */

describe('import_nse_transactions', () => {
  let csvPath: string;

  afterEach(() => {
    if (csvPath) cleanupFile(csvPath);
  });

  test('(a) imports completed NSE orders, skips pending', async () => {
    csvPath = writeTempFile(NSE_CSV, '.csv');

    const queryFn: MockQueryFn = async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_nse_transactions } = await import('../functions/import-nse-transactions');
    const result = await import_nse_transactions({ file_path: csvPath, client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('data-table');
    expect(result.imported_count).toBe(2); // Only 2 completed orders
    expect(result.date_range.from).toBe('2024-01-10');
    expect(result.date_range.to).toBe('2024-01-15');
    expect(result.errors).toHaveLength(0);
  });

  test('(b) returns empty result for empty file', async () => {
    csvPath = writeTempFile('Order No,Order Date,Scheme Code,Scheme Name,Transaction Type,Amount,Units,NAV,Status\n', '.csv');

    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_nse_transactions } = await import('../functions/import-nse-transactions');
    const result = await import_nse_transactions({ file_path: csvPath, client_id: CLIENT_ID }, ctx);

    expect(result.imported_count).toBe(0);
  });

  test('(c) uses tenant_id from context', async () => {
    csvPath = writeTempFile(NSE_CSV, '.csv');

    let capturedTenantId = '';
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) {
        capturedTenantId = String(params?.$tenant_id ?? '');
        return { rows: [{ id: 1 }] };
      }
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_WRONG, queryFn);
    const { import_nse_transactions } = await import('../functions/import-nse-transactions');
    await import_nse_transactions({ file_path: csvPath, client_id: CLIENT_ID }, ctx);

    expect(capturedTenantId).toBe(TENANT_WRONG);
  });

  test('(d) idempotent reimport — same NSE file twice = 0 new rows', async () => {
    csvPath = writeTempFile(NSE_CSV, '.csv');

    const inserted = new Set<string>();
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO ki_transactions')) {
        const key = `${params?.$scheme_code}-${params?.$txn_date}-${params?.$amount}-${params?.$units}`;
        if (inserted.has(key)) return { rows: [] };
        inserted.add(key);
        return { rows: [{ id: inserted.size }] };
      }
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { import_nse_transactions } = await import('../functions/import-nse-transactions');

    const first = await import_nse_transactions({ file_path: csvPath, client_id: CLIENT_ID }, ctx);
    expect(first.imported_count).toBe(2);

    const second = await import_nse_transactions({ file_path: csvPath, client_id: CLIENT_ID }, ctx);
    expect(second.imported_count).toBe(0);
    expect(second.skipped_count).toBe(2);
  });
});

/* ═══════════════════════════════════════════════════════ */
/* reconcile_holdings tests                               */
/* ═══════════════════════════════════════════════════════ */

describe('reconcile_holdings', () => {
  const existingHoldings = [
    { holding_id: 1, scheme_code: 'INF123K01234', scheme_name: 'HDFC Top 100 Fund', units: 147.3, total_invested: 15000, current_value: 15432 },
    { holding_id: 2, scheme_code: 'INF456K05678', scheme_name: 'ICICI Bluechip Fund', units: 195.31, total_invested: 25000, current_value: 26100 },
    { holding_id: 3, scheme_code: 'INF999K99999', scheme_name: 'Old Scheme Exited', units: 50.0, total_invested: 5000, current_value: 5500 },
  ];

  const importedHoldings = [
    { scheme_code: 'INF123K01234', scheme_name: 'HDFC Top 100 Fund', computed_units: 147.3, net_invested: 15000 },
    { scheme_code: 'INF456K05678', scheme_name: 'ICICI Bluechip Fund', computed_units: 200.0, net_invested: 25600 }, // mismatch!
    { scheme_code: 'INF777K07777', scheme_name: 'New Scheme Added', computed_units: 80.5, net_invested: 10000 },
  ];

  test('(a) correctly identifies matched, mismatched, new, and removed schemes', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('ki_holdings')) return { rows: existingHoldings };
      if (sql.includes('ki_transactions')) return { rows: importedHoldings };
      return { rows: [] };
    };

    const ctx = createMockContext(TENANT_A, queryFn);
    const { reconcile_holdings } = await import('../functions/reconcile-holdings');
    const result = await reconcile_holdings({ client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('data-table');
    expect(result.matched).toBe(1); // HDFC matches
    expect(result.mismatched).toHaveLength(1); // ICICI mismatch
    expect(result.mismatched[0].scheme_code).toBe('INF456K05678');
    expect(result.mismatched[0].difference).toBeCloseTo(4.69, 1);
    expect(result.new_schemes).toHaveLength(1); // New scheme
    expect(result.new_schemes[0].scheme_code).toBe('INF777K07777');
    expect(result.removed_schemes).toHaveLength(1); // Old scheme
    expect(result.removed_schemes[0].scheme_code).toBe('INF999K99999');
  });

  test('(b) returns all zeros when no data exists', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);
    const { reconcile_holdings } = await import('../functions/reconcile-holdings');
    const result = await reconcile_holdings({ client_id: 99999 }, ctx);

    expect(result.matched).toBe(0);
    expect(result.mismatched).toHaveLength(0);
    expect(result.new_schemes).toHaveLength(0);
    expect(result.removed_schemes).toHaveLength(0);
  });

  test('(c) returns empty when querying with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: existingHoldings };
    };

    const ctx = createMockContext(TENANT_WRONG, queryFn);
    const { reconcile_holdings } = await import('../functions/reconcile-holdings');
    const result = await reconcile_holdings({ client_id: CLIENT_ID }, ctx);

    expect(result.matched).toBe(0);
    expect(result.mismatched).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════ */
/* parseCASText unit tests                                */
/* ═══════════════════════════════════════════════════════ */

describe('parseCASText', () => {
  test('extracts PAN, transactions, and holdings from CAS text', async () => {
    const { parseCASText } = await import('../functions/import-cas');
    const { transactions, holdings, clientPANs } = parseCASText(CAS_TEXT);

    expect(clientPANs.size).toBe(1);
    expect(clientPANs.has('ABCDE1234F')).toBe(true);
    expect(transactions).toHaveLength(3);
    expect(transactions[0].scheme_code).toBe('INF123K01234');
    expect(transactions[0].txn_type).toBe('purchase');
    expect(transactions[1].txn_type).toBe('sip');
    expect(holdings).toHaveLength(2);
    expect(holdings[0].value).toBeCloseTo(15432.50, 1);
  });
});
