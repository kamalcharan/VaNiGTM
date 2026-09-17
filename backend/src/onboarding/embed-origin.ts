/**
 * An embed origin is an ALLOWLIST ENTRY, not a display string.
 *
 * `vani_tenant_domain.embed_origins` decides which sites may carry a token that
 * names the tenant, so a wrong entry here is a security defect rather than a
 * cosmetic one. That is why this lives in its own file with its own tests
 * instead of inline in the step handler.
 *
 * It was also, until now, written by nothing at all: the column has existed
 * since migration 240, `readinessChecklist` gates Vara's activation on it, and
 * no code path in the repo ever set it. Every tenant therefore failed check 2
 * of 3 forever and `POST /vara/activate` refused them all.
 */

export class OriginError extends Error {}

/** Loopback hosts, the only ones allowed to be plain http. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * "careers.acme.io/jobs?x=1" → "https://careers.acme.io"
 *
 * The browser's `Origin` header is scheme + host + optional port and nothing
 * else, so a path, query or fragment is meaningless in an allowlist and is
 * dropped rather than refused — the same normalisation the domain field
 * already does, and the UI shows the result before saving.
 *
 * A missing scheme becomes https. Plain http is refused on anything but
 * loopback: an http origin means the embed token travels in cleartext, and
 * silently accepting it would put that decision beyond the tenant's notice.
 */
export function normaliseOrigin(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) throw new OriginError('Enter an origin, like https://careers.example.com');

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;

  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new OriginError(`"${raw}" is not a valid origin — try https://careers.example.com`);
  }

  const scheme = u.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'https' && scheme !== 'http') {
    throw new OriginError(`Only http and https origins can be allowlisted, not "${scheme}"`);
  }

  const hostname = u.hostname.toLowerCase();
  const loopback = LOOPBACK.has(hostname);
  if (scheme === 'http' && !loopback) {
    throw new OriginError(
      `${hostname} must be https — an http origin would carry your embed token in the clear`);
  }
  if (!loopback && !hostname.includes('.')) {
    throw new OriginError(`"${hostname}" is not a full host — try https://careers.example.com`);
  }
  if (u.username || u.password) {
    throw new OriginError('An origin cannot carry credentials');
  }

  // u.host keeps a non-default port and drops a default one, which is exactly
  // what a browser puts in the Origin header.
  return `${scheme}://${u.host.toLowerCase()}`;
}

/** How many origins one domain may allowlist. A list this long is a mistake,
 *  not a configuration, and an unbounded one is a slow-growing attack surface. */
export const MAX_ORIGINS = 10;

/**
 * Reads whatever the client sent. Accepts a list, a single string, or a
 * comma-separated string, because all three are things a person types.
 *
 * Returns null when the payload does not MENTION origins at all — the caller
 * uses that to leave an existing allowlist alone, rather than wiping it on a
 * step resubmit that was only changing the purpose. An explicit empty list
 * still clears it.
 */
export function readOrigins(data: Record<string, unknown>): string[] | null {
  const raw = data.embed_origins ?? data.embed_origin;
  if (raw === undefined || raw === null) return null;

  const parts: string[] = Array.isArray(raw)
    ? raw.map((x) => String(x))
    : String(raw).split(',');

  const out: string[] = [];
  for (const p of parts) {
    if (!p.trim()) continue;
    const o = normaliseOrigin(p);
    if (!out.includes(o)) out.push(o);       // already lowercased, so plain dedupe
  }
  if (out.length > MAX_ORIGINS) {
    throw new OriginError(`At most ${MAX_ORIGINS} origins can be allowlisted on one domain`);
  }
  return out;
}
