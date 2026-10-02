/**
 * The site reader was lifted out of the ingestion agent (release 4) so the
 * pool's enrichment agent reads a site with the Smart Profile's own code.
 *
 * golden.json was recorded from IngestionAgent BEFORE the move, on the fixture
 * pages beside it. These tests hold the moved code — and the agent's delegates —
 * to that recording byte for byte: if the reader changes, it changes for the
 * Smart Profile and the pool together, and on purpose (re-record the golden).
 */
import fs from 'fs';
import path from 'path';
import { promises as dns } from 'dns';
import * as siteReader from '../site-reader';
import { IngestionAgent } from '../../skills/ingestion-skill/ingestion.agent';

const DIR = path.join(__dirname, 'fixtures', 'site-reader');
const golden = JSON.parse(fs.readFileSync(path.join(DIR, 'golden.json'), 'utf8'));
const BASES: Record<string, string> = {
  'meta-rich.html': 'https://kavyalab.example/', 'spa-next.html': 'https://acme.example',
  'bare.html': 'https://bare.example/', 'reversed-meta.html': 'https://rev.example/home/',
};
const html = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');
const huge = '<html><body>' + Array.from({ length: 9000 }, (_, i) => `<p>Paragraph ${i} about lab columns and filters.</p>`).join('') + '</body></html>';

describe('site reader = the Smart Profile reader before the move', () => {
  it.each(Object.keys(BASES))('%s: same text, same health, same pages to read next', (f) => {
    expect(siteReader.extractFromHtml(html(f))).toEqual(golden[f].extract);
    expect(siteReader.discoverSitePages(html(f), BASES[f])).toEqual(golden[f].discover);
    expect(siteReader.discoverSitePages(html(f), BASES[f], 2)).toEqual(golden[f].discover2);
  });

  it.each(Object.keys(BASES))('%s: the ingestion agent still says the same through its delegates', (f) => {
    expect(IngestionAgent.extractFromHtml(html(f))).toEqual(golden[f].extract);
    expect((IngestionAgent as any).discoverSitePages(html(f), BASES[f])).toEqual(golden[f].discover);
  });

  it('caps a pathological page at the same length', () => {
    const r = siteReader.extractFromHtml(huge);
    const g = golden['generated-huge'];
    expect(r.text.length).toBe(g.length);
    expect(r.text.slice(0, 200)).toBe(g.head);
    expect(r.text.slice(-200)).toBe(g.tail);
    expect(r.health).toEqual(g.health);
  });
});

describe('the moved fetch keeps the SSRF guard', () => {
  const lookup = jest.spyOn(dns, 'lookup') as unknown as jest.Mock;
  const realFetch = global.fetch;
  afterAll(() => { global.fetch = realFetch; lookup.mockRestore(); });

  it('refuses an internal address before any request, and reads a public page as before', async () => {
    lookup.mockImplementation(async (host: string) =>
      host === 'internal.test' ? [{ address: '10.0.0.7', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);
    const fetchMock = jest.fn(async () => new Response(html('meta-rich.html'), { status: 200, headers: { 'content-type': 'text/html' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(siteReader.fetchUrlText('http://internal.test/')).rejects.toThrow(/URL_NOT_PUBLIC/);
    await expect(siteReader.renderPageWithBrand('http://internal.test/')).rejects.toThrow(/URL_NOT_PUBLIC/);
    expect(fetchMock).not.toHaveBeenCalled();

    const r = await siteReader.fetchUrlText('https://kavyalab.example/');
    expect({ text: r.text, health: r.health }).toEqual(golden['meta-rich.html'].extract);
    expect(r.html).toBe(html('meta-rich.html'));
  });
});
