/**
 * What a visitor typed → the site key, and a fetch that cannot be turned
 * against our own network.
 *
 * WHY A GUARDED FETCH: the funnel is PUBLIC. Anyone can make this server fetch
 * a URL, so an unguarded fetch is an SSRF hole — `http://vani-backend:3001/…`,
 * the database host, a cloud metadata address, or any of those behind a
 * redirect. The guard: http(s) only, ports 80/443 only, no IP-literal hosts,
 * every resolved address must be public, and redirects are followed BY HAND
 * with the same checks on every hop.
 *
 * Residual risk, stated: DNS can change between our lookup and the fetch's own
 * lookup (rebinding). Closing that needs connection pinning; not in this slice.
 *
 * The tenant ingestion path (IngestionAgent.fetchUrlText) has no such guard
 * today; it is reached only by signed-in tenants. Recorded, not changed here.
 */
import { promises as dns } from 'dns';
import net from 'net';
import { FunnelError } from './funnel.config';

export interface Site { host: string; url: string }

const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * `http://www.ContractNest.com/about?x=1` → host `contractnest.com`,
 * url `https://contractnest.com/` (the homepage is what is read; the host is
 * the reuse key, so every spelling of one site shares one read).
 */
export function normaliseSite(input: string): Site {
  const raw = String(input ?? '').trim();
  if (!raw) throw new FunnelError('INVALID_SITE', 'enter your website address');
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { throw new FunnelError('INVALID_SITE', `"${raw}" is not a website address`); }
  if (!/^https?:$/.test(u.protocol)) throw new FunnelError('INVALID_SITE', 'only http and https websites can be read');
  const host = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  if (net.isIP(host.replace(/^\[|\]$/g, '')) || !HOST_RE.test(host)) {
    throw new FunnelError('INVALID_SITE', `"${raw}" is not a public website name`);
  }
  if (u.port && u.port !== '80' && u.port !== '443') {
    throw new FunnelError('INVALID_SITE', 'only websites on the standard ports can be read');
  }
  return { host, url: `https://${host}/` };
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

async function assertPublic(u: URL): Promise<void> {
  if (!/^https?:$/.test(u.protocol)) throw new FunnelError('SITE_NOT_PUBLIC', `refused a ${u.protocol} address`);
  if (u.port && u.port !== '80' && u.port !== '443') throw new FunnelError('SITE_NOT_PUBLIC', `refused port ${u.port}`);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) throw new FunnelError('SITE_NOT_PUBLIC', 'refused an address given as a number');
  let addrs: { address: string }[];
  try { addrs = await dns.lookup(host, { all: true }); }
  catch { throw new FunnelError('SITE_UNREACHABLE', `${host} does not resolve — check the address`); }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new FunnelError('SITE_NOT_PUBLIC', `${host} does not point at a public website`);
  }
}

const MAX_REDIRECTS = 5;
const MAX_BYTES = 3_000_000;

/** Fetch a public HTML page, re-checking every redirect hop. Returns the HTML. */
export async function fetchPublicHtml(start: string): Promise<{ html: string; finalUrl: string }> {
  let current = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(current);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 VaNiGTM-Preview/1.0',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new FunnelError('SITE_UNREACHABLE', `could not reach ${current.host}: ${(e as Error).message}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new FunnelError('SITE_UNREACHABLE', `${current.host} redirected without a destination`);
      current = new URL(loc, current);
      continue;
    }
    if (!res.ok) throw new FunnelError('SITE_UNREACHABLE', `${current.host} answered HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/.test(type)) {
      throw new FunnelError('SITE_UNREADABLE', `${current.host} did not return a web page (${type || 'no content type'})`);
    }
    const html = await res.text();
    return { html: html.slice(0, MAX_BYTES), finalUrl: current.href };
  }
  throw new FunnelError('SITE_UNREACHABLE', `more than ${MAX_REDIRECTS} redirects`);
}
