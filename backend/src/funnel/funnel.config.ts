/**
 * Funnel settings (D3, design-notes-funnel-anon-session.md §3.4) — from .env,
 * no defaults (Charan, 2026-09-30: nothing hardcoded without approval).
 *
 * Read at CALL time and NOT asserted at API startup: the funnel is one public
 * feature, and a missing setting must switch it off with a clear 503, not take
 * the whole API down (the 2026-09-30 502 was exactly that).
 */
export interface FunnelConfig {
  /** A site read successfully this recently is reused for every visitor. Approved: 720 (30 days). */
  reuseHours: number;
  /** New reads one IP may start per hour. Reused cards do not count. */
  maxPerIpPerHour: number;
  /** An unclaimed session is deleted after this many days. */
  sessionDays: number;
  /** The funnel system tenant's daily token cap — the ceiling on anonymous spend. */
  dailyTokenLimit: number;
  /** A read still 'queued'/'reading' after this long is treated as dead, not joined. */
  readTimeoutMinutes: number;
  /** HMAC key for visitor IPs (≥32 chars). */
  ipHashKey: string;
  /** How many chunks of homepage text the graph read may send to the model — its cost ceiling per new read. */
  graphMaxChunks: number;
}

export const FUNNEL_ENV_VARS = [
  'FUNNEL_REUSE_HOURS', 'FUNNEL_MAX_PER_IP_PER_HOUR', 'FUNNEL_SESSION_DAYS',
  'FUNNEL_DAILY_TOKEN_LIMIT', 'FUNNEL_READ_TIMEOUT_MINUTES', 'FUNNEL_IP_HASH_KEY',
  'FUNNEL_GRAPH_MAX_CHUNKS',
] as const;

export class FunnelError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(`${code}: ${message}`);
    this.name = 'FunnelError';
  }
}

export function readFunnelConfig(env: NodeJS.ProcessEnv = process.env): FunnelConfig {
  const problems: string[] = [];
  const int = (name: string, min: number): number => {
    const raw = (env[name] ?? '').trim();
    const n = Number(raw);
    if (!raw) problems.push(`${name} is not set`);
    else if (!Number.isInteger(n) || n < min) problems.push(`${name}=${raw} is not a whole number ≥ ${min}`);
    return n;
  };
  const cfg: FunnelConfig = {
    reuseHours:         int('FUNNEL_REUSE_HOURS', 1),
    maxPerIpPerHour:    int('FUNNEL_MAX_PER_IP_PER_HOUR', 1),
    sessionDays:        int('FUNNEL_SESSION_DAYS', 1),
    dailyTokenLimit:    int('FUNNEL_DAILY_TOKEN_LIMIT', 1),
    readTimeoutMinutes: int('FUNNEL_READ_TIMEOUT_MINUTES', 1),
    ipHashKey:          (env.FUNNEL_IP_HASH_KEY ?? '').trim(),
    graphMaxChunks:     int('FUNNEL_GRAPH_MAX_CHUNKS', 1),
  };
  if (cfg.ipHashKey.length < 32) problems.push('FUNNEL_IP_HASH_KEY is not set or shorter than 32 characters');
  if (problems.length) {
    throw new FunnelError('FUNNEL_NOT_CONFIGURED',
      `the website preview is switched off until these are set in .env: ${problems.join('; ')}`, 503);
  }
  return cfg;
}

/**
 * The workspace access requests land in (Charan, 2026-09-30: connect@vikuna.io's).
 * Read on its own, at call time: when it is missing only the Request access
 * form is switched off — with a 503 that names the setting — not the preview.
 */
export function readLeadsTenantSlug(env: NodeJS.ProcessEnv = process.env): string {
  const slug = (env.FUNNEL_LEADS_TENANT_SLUG ?? '').trim();
  if (!slug) {
    throw new FunnelError('FUNNEL_NOT_CONFIGURED',
      'Request access is switched off until FUNNEL_LEADS_TENANT_SLUG is set in .env', 503);
  }
  return slug;
}
