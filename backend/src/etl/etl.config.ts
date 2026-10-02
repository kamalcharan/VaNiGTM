/**
 * Import pipeline settings, from .env — no defaults (Charan, 2026-09-30: "no
 * hardcoding anywhere … everything comes from .env").
 *
 * Checked when the API and the worker start (assertEtlConfig), read at call
 * time everywhere else so tests can set them per case.
 */
export interface EtlConfig {
  /** Largest file the upload route accepts (the matching nginx location must allow it). */
  uploadMaxBytes: number;
  /** Files larger than this are staged by the worker in chunks, not in the request. */
  syncMaxBytes: number;
  /** Rows per chunk on the worker path; one transaction each. */
  stageChunkRows: number;
  /**
   * Where an upload waits until its rows are staged. Temporary by ruling
   * (Charan, 2026-10-02): the file is deleted once staged; only its metadata
   * stays. The API and the worker must see the SAME folder (one host folder
   * mounted in both containers), or the worker cannot stage a large CSV.
   */
  uploadDir: string;
  /** An upload never staged is deleted after this many hours. */
  uploadTempTtlHours: number;
}

export class EtlConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`ETL_CONFIG_INVALID: ${problems.join('; ')}. Set them in .env — see backend/.env.example.`);
    this.name = 'EtlConfigError';
  }
}

export function readEtlConfig(env: NodeJS.ProcessEnv = process.env): EtlConfig {
  const problems: string[] = [];
  const int = (name: string, min: number): number => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) { problems.push(`${name}=${raw} is not a whole number ≥ ${min}`); return NaN; }
    return n;
  };
  const cfg: EtlConfig = {
    uploadMaxBytes: int('ETL_UPLOAD_MAX_BYTES', 1),
    syncMaxBytes: int('ETL_SYNC_MAX_BYTES', 1),
    stageChunkRows: int('ETL_STAGE_CHUNK_ROWS', 1),
    uploadDir: (() => {
      const raw = (env.ETL_UPLOAD_DIR ?? '').trim();
      if (!raw) problems.push('ETL_UPLOAD_DIR is not set');
      return raw;
    })(),
    uploadTempTtlHours: int('ETL_UPLOAD_TEMP_TTL_HOURS', 1),
  };
  if (problems.length) throw new EtlConfigError(problems);
  return cfg;
}

export function assertEtlConfig(who: string): EtlConfig {
  const c = readEtlConfig();
  console.log(`[${who}] ETL: uploads up to ${c.uploadMaxBytes} bytes, sync up to ${c.syncMaxBytes} bytes, worker chunks of ${c.stageChunkRows} rows, temp files in ${c.uploadDir} for up to ${c.uploadTempTtlHours}h`);
  return c;
}
