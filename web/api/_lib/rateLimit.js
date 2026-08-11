// api/_lib/rateLimit.js
//
// Best-effort per-IP rate limiter for a single-prospect POC link.
//
// LIMITATION: this counts requests in the memory of one warm serverless
// instance. It works correctly for the common case (one instance handling a
// demo session), but a cold start resets its counters, and Vercel may run
// more than one instance concurrently under real load — so this is a
// deterrent against a runaway script or an accidentally-shared link, not a
// hard cap. If this playground moves beyond a single prospect's POC, swap
// this for a shared store (Vercel KV or the existing Postgres via PostgREST
// on the Main VPS) — everything below the `checkRateLimit` call site is
// unaffected by that swap.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_LIMIT = 40;

const buckets = new Map();

export function checkRateLimit(ip) {
  const limit = Number(process.env.ADVISOR_RATE_LIMIT_PER_HOUR) || DEFAULT_LIMIT;
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(ip, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.windowStart + WINDOW_MS };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.windowStart + WINDOW_MS };
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
