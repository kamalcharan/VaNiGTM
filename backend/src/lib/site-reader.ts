/**
 * The site reader — one page of a public website, read as text.
 *
 * Lifted out of the ingestion agent unchanged (release 4, 2026-10-02) so the
 * pool's enrichment agent reads a company's site with exactly the code the
 * Smart Profile uses: a fix to the layering benefits every caller, and the two
 * can never disagree about what a page says. `IngestionAgent` keeps its static
 * methods as delegates, so every existing caller (and every test that spies on
 * them) is untouched. `tests/site-reader.test.ts` proves the output is
 * byte-identical to the agent's before the move (golden.json was recorded from
 * the old code).
 *
 *   fetchUrlText        static read through the SSRF guard → text + html + health
 *   extractFromHtml     the three layers (meta, body, JSON prose) + health check
 *   renderPageWithBrand the n8n headless render (escalation, never silent)
 *   discoverSitePages   same-domain pages worth reading, best first
 */
import { assertPublicUrl, fetchPublic, NotPublicError } from './public-fetch';

// ── URL fetch → plain text ─────────────────────────────────────────────
// One page at a time. Combines
// three extraction layers so JS-rendered SPAs still yield usable copy:
//   1. visible body text (tags stripped)
//   2. <title> + meta description/og/twitter tags
//   3. prose mined from JSON-LD and framework data blobs
//      (__NEXT_DATA__/__NUXT__) — client-rendered sites ship their copy
//      there even when the body is empty.
// Caps the result so a pathological page can't flood the chunker.

/** Layer 2: title + meta tags that describe the site. */
export function extractMetaText(html: string): string {
  const parts: string[] = [];

  const title = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  if (title && title[1].trim()) parts.push(title[1].trim());

  const WANTED = new Set([
    'description', 'og:description', 'og:title', 'og:site_name',
    'twitter:description', 'twitter:title', 'keywords',
  ]);
  const tagRe = /<meta\s[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html))) {
    const name = tag[0].match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag[0].match(/content\s*=\s*["']([^"']*)["']/i)?.[1]?.trim();
    if (name && content && WANTED.has(name)) parts.push(content);
  }
  return [...new Set(parts)].join('\n');
}

/** Layer 3: prose strings mined from JSON-LD + framework data scripts. */
export function mineJsonProse(html: string): string {
  const scriptRe = /<script[^>]*(?:id=["']__NEXT_DATA__["']|id=["']__NUXT_DATA__["']|type=["']application\/(?:ld\+)?json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let total = 0;
  let script: RegExpExecArray | null;

  while ((script = scriptRe.exec(html)) && total < 15_000) {
    const strRe = /"((?:[^"\\]|\\.){24,400})"/g;
    let m: RegExpExecArray | null;
    while ((m = strRe.exec(script[1])) && total < 15_000) {
      const v = m[1]
        .replace(/\\n/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/\\u[0-9a-fA-F]{4}/g, ' ')
        .trim();
      // Keep only prose: needs spaces, no URLs/paths/markup/code characters.
      if (!/\s/.test(v)) continue;
      if (/https?:\/\/|[{}<>=;\\]/.test(v)) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      total += v.length;
    }
  }
  return out.join('\n');
}

/**
 * Site-health signals — which crawlability/AEO basics the page ships.
 * Doubles as the first Digital Audit finding, surfaced at onboarding:
 * a site invisible to VaNi's crawler is invisible to AI answer engines.
 */
export function analyzeSiteHealth(html: string, bodyChars: number): {
  present: string[]; missing: string[]; summary: string;
} {
  const checks: [key: string, ok: boolean][] = [
    ['title', /<title[^>]*>\s*\S[\s\S]*?<\/title>/i.test(html)],
    ['meta_description', /<meta\s[^>]*(?:name|property)\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']+["']/i.test(html)
      || /<meta\s[^>]*content\s*=\s*["'][^"']+["'][^>]*(?:name|property)\s*=\s*["']description["']/i.test(html)],
    ['og_tags', /<meta\s[^>]*property\s*=\s*["']og:/i.test(html)],
    ['json_ld', /<script[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html)],
    ['body_text', bodyChars >= 200],
  ];
  const present = checks.filter(([, ok]) => ok).map(([k]) => k);
  const missing = checks.filter(([, ok]) => !ok).map(([k]) => k);
  return {
    present,
    missing,
    summary: `present: ${present.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}; body: ${bodyChars} chars`,
  };
}

/**
 * Run the three extraction layers + health check over an HTML document.
 *
 * Public: the account-research agent reuses this on rendered HTML, the
 * same way it reuses fetchUrlText. One extraction implementation, so a
 * fix to the layering benefits every caller.
 */
export function extractFromHtml(html: string): {
  text: string;
  health: { present: string[]; missing: string[]; summary: string };
} {
  // Layers 2 + 3 BEFORE stripping — scripts/meta are removed below.
  const metaText = extractMetaText(html);
  const minedText = mineJsonProse(html);

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Block-level closers become newlines so headings/paragraphs keep separation
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  const text = [metaText, bodyText, minedText].filter(Boolean).join('\n\n').trim();
  const health = analyzeSiteHealth(html, bodyText.length);

  const MAX_CHARS = 200_000;
  return {
    text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text,
    health,
  };
}

/**
 * Headless-render escalation via the user's n8n infra (CLAUDE.md: n8n
 * approved for agent-adjacent jobs; authenticated + environment-routed).
 * Called ONLY when the static read is too thin, and always visible as a
 * run step — never a silent fallback (rule 12). Throws loudly when the
 * renderer is unconfigured, unreachable, or returns nothing.
 */
/** Public for the same reason as extractFromHtml — see its comment. */
export async function renderPageViaN8n(url: string): Promise<string> {
  return (await renderPageWithBrand(url)).html;
}

/**
 * The same render, plus what the browser painted (`brand`, from
 * documents/n8n/brand-collector.js) when the n8n workflow sends it — null
 * from an older workflow. One call, one page load; ingestion uses only the
 * HTML, the brand step uses both.
 */
export async function renderPageWithBrand(url: string): Promise<{ html: string; brand: unknown }> {
  // n8n fetches whatever we hand it — the same guard applies before we do.
  try { await assertPublicUrl(url); }
  catch (err) {
    if (err instanceof NotPublicError) throw new Error(`URL_NOT_PUBLIC: ${url} — ${err.message}`);
    throw err;
  }
  const base = process.env.N8N_RENDER_URL;
  const secret = process.env.N8N_RENDER_SECRET;
  if (!base || !secret) {
    throw new Error(
      'RENDER_NOT_CONFIGURED: this site needs headless rendering — set N8N_RENDER_URL and ' +
      'N8N_RENDER_SECRET (see documents/n8n/README.md) or paste the website copy instead.',
    );
  }
  const prefix = process.env.N8N_ENV === 'live' ? '/webhook' : '/webhook-test';

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, '')}${prefix}/vani-render-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vani-secret': secret },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`RENDER_FAILED: could not reach the n8n renderer — ${msg}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`RENDER_FAILED: n8n responded ${res.status} — ${detail.slice(0, 300)}`);
  }

  let data: { success?: boolean; html?: string; message?: string; brand?: unknown };
  try {
    data = await res.json() as typeof data;
  } catch {
    throw new Error('RENDER_FAILED: n8n returned a non-JSON response');
  }
  if (!data.success || !data.html) {
    throw new Error(`RENDER_FAILED: ${data.message || 'renderer returned no HTML'}`);
  }
  return { html: String(data.html), brand: data.brand ?? null };
}

/**
 * Discover same-domain pages worth crawling from a page's HTML —
 * scored by how likely the path is to carry positioning content
 * (about/services/pricing/case studies…). Bounded to `limit`.
 */
export function discoverSitePages(html: string, baseUrl: string, limit = 6): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const scored: { url: string; score: number }[] = [];

  const CONTENT_HINTS = /about|service|product|pricing|price|plan|case|customer|stor(y|ies)|solution|team|feature|industr|how|faq|why|platform|assessment/i;
  const SKIP_EXT = /\.(png|jpe?g|svg|gif|webp|ico|css|js|json|xml|pdf|zip|mp4|webm|woff2?)($|\?)/i;

  const hrefRe = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) && scored.length < 60) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, base);
    } catch { continue; }
    if (resolved.hostname !== base.hostname) continue;
    if (SKIP_EXT.test(resolved.pathname)) continue;

    resolved.hash = '';
    resolved.search = '';
    const normalized = resolved.href.replace(/\/$/, '');
    const baseNorm = base.href.replace(/\/$/, '');
    if (normalized === baseNorm || seen.has(normalized)) continue;
    seen.add(normalized);

    const depth = resolved.pathname.split('/').filter(Boolean).length;
    let score = CONTENT_HINTS.test(resolved.pathname) ? 10 : 0;
    score -= depth; // prefer shallow pages
    scored.push({ url: normalized, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.url);
}

/** Public: callers must be able to ask before attempting an escalation. */
export function renderConfigured(): boolean {
  return Boolean(process.env.N8N_RENDER_URL && process.env.N8N_RENDER_SECRET);
}

// Public: the competitor-research agent reuses this to verify candidate
// domains against their real sites (static read only — no render leg).
export async function fetchUrlText(url: string): Promise<{
  text: string;
  html: string;
  health: { present: string[]; missing: string[]; summary: string };
}> {
  // Through the SSRF guard (lib/public-fetch, 2026-09-30): these URLs come
  // from tenants, from links inside pages and from web search results, and
  // an unguarded fetch followed redirects to internal addresses too.
  let response: Response;
  try {
    ({ response } = await fetchPublic(url, {
      headers: {
        // Browser-like UA — plain bot UAs get 403'd by common CDN bot rules.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 VaNiGTM-Ingestion/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en',
      },
      timeoutMs: 30_000,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof NotPublicError) throw new Error(`URL_NOT_PUBLIC: ${url} — ${msg}`);
    throw new Error(`URL_FETCH_FAILED: ${url} — ${msg}`);
  }

  if (!response.ok) {
    throw new Error(`URL_FETCH_FAILED: ${url} — HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
    throw new Error(`URL_UNSUPPORTED_CONTENT: ${url} returned '${contentType}' — only HTML/text pages are ingestible`);
  }

  const html = await response.text();
  return { ...extractFromHtml(html), html };
}
