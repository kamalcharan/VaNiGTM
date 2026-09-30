/**
 * The shared fetcher (IngestionAgent.fetchUrlText) goes through the SSRF guard
 * (lib/public-fetch). Used by tenant ingestion, the site crawl, brand
 * extraction, competitor research and account research — URLs chosen by
 * tenants, by links inside pages and by web search results.
 *
 * DNS and the network are mocked: every case is decided before, or instead
 * of, a real request.
 */
import { promises as dns } from 'dns';
import { IngestionAgent } from '../ingestion.agent';

const PUBLIC = '93.184.216.34';
const lookup = jest.spyOn(dns, 'lookup') as unknown as jest.Mock;
const realFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  lookup.mockReset();
  lookup.mockImplementation(async (host: string) =>
    host === 'internal.test' ? [{ address: '10.0.0.7', family: 4 }]
      : host === 'localhost' ? [{ address: '127.0.0.1', family: 4 }]
      : [{ address: PUBLIC, family: 4 }]);
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => { global.fetch = realFetch; lookup.mockRestore(); });

const page = (html: string, type = 'text/html; charset=utf-8', status = 200, headers: Record<string, string> = {}) =>
  new Response(html, { status, headers: { 'content-type': type, ...headers } });

describe('fetchUrlText — refuses internal targets, loudly', () => {
  it.each([
    ['http://localhost:3001/health', /URL_NOT_PUBLIC: .* refused port 3001/],
    ['http://localhost/', /URL_NOT_PUBLIC: .* does not point at a public address/],
    ['http://169.254.169.254/latest/meta-data/', /URL_NOT_PUBLIC: .* given as a number/],
    ['http://internal.test/', /URL_NOT_PUBLIC: .* does not point at a public address/],
  ])('%s', async (url, msg) => {
    await expect(IngestionAgent.fetchUrlText(url)).rejects.toThrow(msg);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a public site redirecting to an internal address is refused at the hop', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://internal.test/admin' } }));
    await expect(IngestionAgent.fetchUrlText('https://acme.test/')).rejects.toThrow(/URL_NOT_PUBLIC/);
    expect(fetchMock).toHaveBeenCalledTimes(1);   // the internal address was never requested
  });
});

describe('fetchUrlText — public sites read exactly as before', () => {
  it('reads a page, following a public redirect', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://www.acme.test/' } }))
      .mockResolvedValueOnce(page(`<html><head><title>Acme</title></head><body><p>${'Acme sends invoices. '.repeat(20)}</p></body></html>`));
    const r = await IngestionAgent.fetchUrlText('https://acme.test/');
    expect(r.text).toContain('Acme sends invoices.');
    expect(fetchMock.mock.calls[1][0].toString()).toBe('https://www.acme.test/');
    // the same identity as before the guard
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/VaNiGTM-Ingestion\/1\.0/);
  });

  it('still accepts text/plain, and keeps its error wording', async () => {
    fetchMock.mockResolvedValueOnce(page('plain words '.repeat(30), 'text/plain'));
    expect((await IngestionAgent.fetchUrlText('https://acme.test/a.txt')).text).toContain('plain words');
    fetchMock.mockResolvedValueOnce(page('x', 'application/pdf'));
    await expect(IngestionAgent.fetchUrlText('https://acme.test/x.pdf')).rejects.toThrow(/^URL_UNSUPPORTED_CONTENT/);
    fetchMock.mockResolvedValueOnce(page('gone', 'text/html', 404));
    await expect(IngestionAgent.fetchUrlText('https://acme.test/gone')).rejects.toThrow(/^URL_FETCH_FAILED: .* HTTP 404/);
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(IngestionAgent.fetchUrlText('https://acme.test/')).rejects.toThrow(/^URL_FETCH_FAILED: .* socket hang up/);
  });
});

describe('renderPageViaN8n — never forwards an internal URL to the renderer', () => {
  it('refuses before calling n8n', async () => {
    await expect(IngestionAgent.renderPageViaN8n('http://internal.test/')).rejects.toThrow(/URL_NOT_PUBLIC/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
