/**
 * readSiteGraph — the homepage into a graph, with the ingestion extractor
 * mocked. What is tested is what the funnel adds on top of it: the chunk
 * ceiling (FUNNEL_GRAPH_MAX_CHUNKS), local ids and edges resolved between
 * them, and failures that say so instead of returning an empty graph.
 */
const calls: { chunks: number; urls: (string | null | undefined)[] }[] = [];
let result: { nodes: unknown[]; relations: unknown[]; truncatedChunks: number[] } = { nodes: [], relations: [], truncatedChunks: [] };
jest.mock('../../skills/ingestion-skill/pipeline/extractor', () => ({
  EXTRACT_CHUNK_CAP: 4000,
  EXTRACTION_PROMPT: 'prompt',
  extractMaxTokens: () => 1000,
  extractFromChunks: jest.fn(async (_p: unknown, _t: string, _r: string, chunks: { source_url?: string | null }[]) => {
    calls.push({ chunks: chunks.length, urls: chunks.map((c) => c.source_url) });
    return result;
  }),
}));
let room = 4000;
jest.mock('../../agent-core/llm.gate', () => ({ charBudgetFor: () => room }));

import { readSiteGraph } from '../site-graph';

const para = (i: number) => `Paragraph ${i}: ${'Acme sends invoices for plumbers and gets them paid on time. '.repeat(20)}`;
const longText = Array.from({ length: 12 }, (_, i) => para(i)).join('\n\n');
const node = (label: string, name: string) => ({ label, name, description: `${name} described`, properties: {} });

beforeEach(() => { calls.length = 0; room = 4000; });

it('sends at most maxChunks chunks, each tagged with the page, and says the graph is from part of the page', async () => {
  result = { nodes: [node('Product', 'Acme')], relations: [], truncatedChunks: [] };
  const g = await readSiteGraph({} as never, 't', '1', longText, 'https://acme.in/', 2);
  expect(calls).toEqual([{ chunks: 2, urls: ['https://acme.in/', 'https://acme.in/'] }]);
  expect(g).toMatchObject({ status: 'read', chunks_read: 2, truncated: false });
  if (g.status === 'read') expect(g.chunks_total).toBeGreaterThan(2);
});

it('gives nodes local ids and keeps only edges whose both ends were extracted', async () => {
  result = {
    nodes: [node('Product', 'Acme'), node('ICP', 'Plumbers')],
    relations: [
      { from: 'Product:Acme', type: 'TARGETS', to: 'ICP:Plumbers' },
      { from: 'product:ACME', type: 'SOLVES', to: 'PainPoint:Late payments' },   // other end never extracted
    ],
    truncatedChunks: [1],
  };
  const g = await readSiteGraph({} as never, 't', '1', para(1), 'https://acme.in/', 3);
  expect(g).toMatchObject({
    status: 'read', truncated: true,
    nodes: [{ id: 'n1', name: 'Acme' }, { id: 'n2', name: 'Plumbers' }],
    edges: [{ id: 'e1', from_node_id: 'n1', to_node_id: 'n2', relationship: 'TARGETS' }],
  });
});

it('no nodes is a failure with its reason, never an empty graph', async () => {
  result = { nodes: [], relations: [], truncatedChunks: [] };
  expect(await readSiteGraph({} as never, 't', '1', para(1), 'https://acme.in/', 3))
    .toEqual({ status: 'failed', failure: expect.stringMatching(/nothing specific enough/) });
});

it('a window too small to fit the prompt fails before any call', async () => {
  room = 100;
  expect(await readSiteGraph({} as never, 't', '1', para(1), 'https://acme.in/', 3)).toMatchObject({ status: 'failed' });
  expect(calls).toHaveLength(0);
});
