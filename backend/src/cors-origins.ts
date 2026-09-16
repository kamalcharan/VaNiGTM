/**
 * Allowed browser origins for CORS.
 *
 * Its own module rather than a helper inside server.ts, because server.ts
 * boots the app and the pool on import: a test that reached in for this
 * function started a server and exited the process. A pure function that
 * decides who may talk to the API should be testable without any of that.
 */

/**
 * Allowed browser origins, from a comma-separated CORS_ORIGIN.
 *
 * One API now serves more than one console — the GTM frontend on :3000 and
 * the VaNi console (vikunawebsite/vani-app) on :3100 — and this used to take a
 * single exact string, so whichever one was not configured had every preflight
 * refused. The browser reports that as a network-level failure, which in the
 * console surfaces as "Cannot reach the VaNi service. Check your connection." —
 * indistinguishable from the API being down, and curl never reproduces it
 * because curl sends no Origin header.
 *
 * Matching stays EXACT per entry. No wildcards, no prefix matching, no
 * regex: `credentials: true` means these origins may hold a session cookie,
 * and a pattern that accidentally admits an attacker's origin hands them
 * authenticated requests. A new origin is a deliberate entry in an env var.
 *
 * A request with no Origin (curl, health checks, server-to-server) is
 * unchanged — cors sets no headers and the request proceeds, exactly as
 * before.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))   // a trailing slash never matches an Origin header
    .filter(Boolean);

  // Default unchanged: a deployment that sets nothing keeps working.
  return parsed.length ? parsed : ['http://localhost:3000'];
}

