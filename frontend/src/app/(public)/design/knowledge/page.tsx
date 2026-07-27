'use client';

/** /design/knowledge — knowledge base (POA 1.2). Synthetic data. */

import { DesignShell, Panel, StatRow, DataTable } from '../DesignShell';
import s from './knowledge.module.css';

const SOURCES = [
  ['solsticemetrics.example', 'Website crawl', '42 pages', '2h ago', 'fresh'],
  ['Product one-pager.pdf', 'File upload', '9 chunks', '1d ago', 'fresh'],
  ['Sales call notes — Q2.docx', 'File upload', '31 chunks', '3d ago', 'fresh'],
  ['Google Drive · /GTM folder', 'Folder sync', '17 files', '6h ago', 'fresh'],
  ['Old pricing deck (2024)', 'File upload', '12 chunks', '84d ago', 'stale'],
] as const;

const COVERAGE = [
  { area: 'Product & features', pct: 92 },
  { area: 'ICP & personas', pct: 84 },
  { area: 'Competitors', pct: 71 },
  { area: 'Pricing & packaging', pct: 55 },
  { area: 'Case studies & proof', pct: 38 },
];

export default function KnowledgeDesignPage() {
  return (
    <DesignShell
      path="/design/knowledge"
      eyebrow="Knowledge Base"
      title="What VaNi knows, and from where"
      lede="Every answer an agent gives traces back to a source here. Feed it more; watch coverage climb."
    >
      <StatRow stats={[
        { label: 'Sources', value: '23' },
        { label: 'KG nodes', value: '1,204', tone: 'primary' },
        { label: 'KG edges', value: '3,876' },
        { label: 'Last ingestion', value: '2h ago' },
      ]} />

      <div className={s.grid}>
        <Panel label="Sources">
          <DataTable
            columns={['Source', 'Type', 'Extracted', 'Updated', 'Status']}
            rows={SOURCES.map((r) => [
              r[0], r[1], r[2], r[3],
              <span key={r[0]} className={`${s.status} ${r[4] === 'fresh' ? s.fresh : s.stale}`}>
                {r[4] === 'fresh' ? '● fresh' : '◐ stale'}
              </span>,
            ])}
          />
        </Panel>

        <Panel label="Coverage by area">
          <div className={s.coverage}>
            {COVERAGE.map((c) => (
              <div key={c.area} className={s.covRow}>
                <span className={s.covLabel}>{c.area}</span>
                <div className={s.covTrack} role="img" aria-label={`${c.area}: ${c.pct}%`}>
                  <div className={s.covFill} style={{ width: `${c.pct}%` }} />
                </div>
                <span className={s.covPct}>{c.pct}%</span>
              </div>
            ))}
          </div>
          <p className={s.covHint}>
            Case studies are your thinnest area — the Storyteller’s traction slide is running
            on two data points. Upload 2–3 customer stories to unlock stronger decks.
          </p>
        </Panel>
      </div>
    </DesignShell>
  );
}
