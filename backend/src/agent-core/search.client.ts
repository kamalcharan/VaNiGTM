/**
 * Vikuna Agent Core — Web Search Client (SearXNG)
 *
 * Thin client over a self-hosted SearXNG instance (JSON API). Used by
 * research agents (competitor research today) to look outward — the VPS
 * LLM has no web access of its own.
 *
 * Env:
 *   SEARXNG_URL — base URL of the SearXNG instance, e.g. http://vps:3011
 *
 * NO SILENT FALLBACKS (CLAUDE.md rule 12): missing config or a failed
 * search throws loudly; callers surface the real cause to the user.
 *
 * SearXNG gotcha: the JSON API is DISABLED by default — the instance's
 * settings.yml must list `json` under search.formats or every request
 * 403s. See docs/searxng-setup.md.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
}

interface SearxngResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    engine?: string;
  }>;
}

export function searchConfigured(): boolean {
  return Boolean(process.env.SEARXNG_URL);
}

export async function searchWeb(
  query: string,
  limit = 8,
): Promise<WebSearchResult[]> {
  const base = process.env.SEARXNG_URL;
  if (!base) {
    throw new Error(
      'SEARCH_NOT_CONFIGURED: SEARXNG_URL is not set — deploy SearXNG ' +
      '(docs/searxng-setup.md) and point SEARXNG_URL at it.',
    );
  }

  const url = `${base.replace(/\/$/, '')}/search?` + new URLSearchParams({
    q: query,
    format: 'json',
    safesearch: '1',
  }).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SEARCH_FAILED: SearXNG unreachable at ${base} — ${msg}`);
  }

  if (response.status === 403) {
    throw new Error(
      'SEARCH_FAILED: SearXNG returned 403 — the JSON API is disabled. ' +
      "Add 'json' to search.formats in the instance's settings.yml " +
      '(docs/searxng-setup.md).',
    );
  }
  if (!response.ok) {
    throw new Error(`SEARCH_FAILED: SearXNG HTTP ${response.status} for "${query}"`);
  }

  let data: SearxngResponse;
  try {
    data = (await response.json()) as SearxngResponse;
  } catch {
    throw new Error('SEARCH_FAILED: SearXNG returned non-JSON — check the instance');
  }

  return (data.results ?? [])
    .filter((r) => r.url && r.title)
    .slice(0, limit)
    .map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.content ?? '').slice(0, 300),
      engine: r.engine,
    }));
}
