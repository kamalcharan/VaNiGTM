/**
 * Fetch a URL only if it is the public internet — the SSRF guard for every
 * server-side fetch of a URL that someone else chose.
 *
 * Who needs it: the website preview (public, anonymous), tenant ingestion and
 * its site crawl, brand extraction (including stylesheet links found INSIDE a
 * page), competitor research (URLs from web search results), account research
 * (imported domains), and anything forwarded to the headless renderer. Before
 * 2026-09-30 only the preview was guarded; the rest followed redirects to
 * anywhere, including the API container, the database host and cloud
 * metadata addresses.
 *
 * The guard: http(s) only; ports 80/443 only; no hosts given as numbers;
 * every address the name resolves to must be public; redirects are followed
 * BY HAND, re-checking each hop.
 *
 * Residual risk, stated: DNS can change between our lookup and the fetch's
 * own (rebinding). Closing that needs connection pinning.
 */
import { promises as dns } from 'dns';
import net from 'net';

export class NotPublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotPublicError';
  }
}

/** True for any address that is not the public internet. */
export function isPrivateAddress(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||                 // carrier-grade NAT
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = addr.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') ||
    v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

/** Throws NotPublicError unless `url` is http(s) on 80/443 and resolves only to public addresses. */
export async function assertPublicUrl(url: string | URL): Promise<URL> {
  let u: URL;
  try { u = url instanceof URL ? url : new URL(url); }
  catch { throw new NotPublicError(`"${String(url)}" is not a URL`); }
  if (!/^https?:$/.test(u.protocol)) throw new NotPublicError(`refused a ${u.protocol} address`);
  if (u.port && u.port !== '80' && u.port !== '443') throw new NotPublicError(`refused port ${u.port}`);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) throw new NotPublicError('refused an address given as a number');
  let addrs: { address: string }[];
  try { addrs = await dns.lookup(host, { all: true }); }
  catch { throw new NotPublicError(`${host} does not resolve`); }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new NotPublicError(`${host} does not point at a public address`);
  }
  return u;
}

export interface PublicFetchOptions {
  headers: Record<string, string>;
  timeoutMs: number;
  maxRedirects?: number;
}

/**
 * fetch() with the guard applied to the first URL and to every redirect hop.
 * Returns the final response (never a redirect) and the URL it came from.
 * Network errors propagate as they would from fetch(); guard refusals throw
 * NotPublicError — callers decide the wording.
 */
export async function fetchPublic(start: string, opts: PublicFetchOptions): Promise<{ response: Response; finalUrl: string }> {
  const max = opts.maxRedirects ?? 5;
  let current = new URL(start);
  for (let hop = 0; hop <= max; hop++) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: 'manual',
      headers: opts.headers,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (!loc) return { response, finalUrl: current.href };
      current = new URL(loc, current);
      continue;
    }
    return { response, finalUrl: current.href };
  }
  throw new NotPublicError(`more than ${max} redirects`);
}
