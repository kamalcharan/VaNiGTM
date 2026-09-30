/**
 * What a visitor typed → the site key, and a fetch that cannot be turned
 * against our own network.
 *
 * WHY A GUARDED FETCH: the funnel is PUBLIC — anyone can make this server
 * fetch a URL. The guard lives in lib/public-fetch.ts and is shared with every
 * other server-side fetch of a URL someone else chose (ingestion, brand,
 * research).
 */
import net from 'net';
import { FunnelError } from './funnel.config';
import { fetchPublic, NotPublicError } from '../lib/public-fetch';

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

export { isPrivateAddress } from '../lib/public-fetch';

const MAX_BYTES = 3_000_000;

/** Fetch a public HTML page through the shared SSRF guard (lib/public-fetch). */
export async function fetchPublicHtml(start: string): Promise<{ html: string; finalUrl: string }> {
  let got: { response: Response; finalUrl: string };
  try {
    got = await fetchPublic(start, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 VaNiGTM-Preview/1.0',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en',
      },
      timeoutMs: 20_000,
    });
  } catch (e) {
    const m = (e as Error).message;
    if (e instanceof NotPublicError) {
      throw new FunnelError(m.includes('does not resolve') ? 'SITE_UNREACHABLE' : 'SITE_NOT_PUBLIC', m);
    }
    throw new FunnelError('SITE_UNREACHABLE', `could not reach the site: ${m}`);
  }
  const { response: res, finalUrl } = got;
  const host = new URL(finalUrl).host;
  if (res.status >= 300 && res.status < 400) throw new FunnelError('SITE_UNREACHABLE', `${host} redirected without a destination`);
  if (!res.ok) throw new FunnelError('SITE_UNREACHABLE', `${host} answered HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml/.test(type)) {
    throw new FunnelError('SITE_UNREADABLE', `${host} did not return a web page (${type || 'no content type'})`);
  }
  return { html: (await res.text()).slice(0, MAX_BYTES), finalUrl };
}
