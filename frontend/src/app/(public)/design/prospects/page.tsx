'use client';

/** /design/prospects — pipeline + import + connector setup (POA 1.2). Synthetic data. */

import { DesignShell, Panel, StatRow } from '../DesignShell';
import { VdfPipelineKanban, VdfEnrichmentWaterfall, type VdfKanbanColumn } from '@/components/vdf';
import s from './prospects.module.css';

const COLUMNS: VdfKanbanColumn[] = [
  { id: 'sourced', title: 'Sourced', cards: [
    { id: 'p1', title: 'Harborline Systems', sub: 'Logistics SaaS · Rotterdam', meta: ['blind-spend', 'fit 82'] },
    { id: 'p2', title: 'Copperfield Ops', sub: 'Field-service platform · Denver', meta: ['blind-spend', 'fit 76'] },
    { id: 'p3', title: 'Mireille & Co', sub: 'E-commerce tooling · Lyon', meta: ['agency-grad', 'fit 71'] },
  ]},
  { id: 'approved', title: 'Approved', cards: [
    { id: 'p4', title: 'Brightpath CRM', sub: 'Sales CRM · Austin', meta: ['blind-spend', 'fit 91'] },
    { id: 'p5', title: 'Orbital HQ', sub: 'Remote ops · Berlin', meta: ['blind-spend', 'fit 88'] },
  ]},
  { id: 'contacted', title: 'In sequence', cards: [
    { id: 'p6', title: 'Quill & Ledger', sub: 'Step 2 of 4 · opened twice', meta: ['agency-grad'] },
    { id: 'p7', title: 'Lanternworks', sub: 'Step 1 of 4 · sent today', meta: ['agency-grad'] },
  ]},
  { id: 'replied', title: 'Replied', cards: [
    { id: 'p8', title: 'Fieldnote Labs', sub: 'Positive · Pulse scheduling', meta: ['meeting intent'] },
  ]},
  { id: 'meeting', title: 'Meeting', accent: 'success', cards: [
    { id: 'p9', title: 'Solara Freight', sub: 'Thu 11:00 · demo booked', meta: ['won stage'] },
  ]},
];

export default function ProspectsDesignPage() {
  return (
    <DesignShell
      path="/design/prospects"
      eyebrow="Prospects Pipeline"
      title="From sourced to meeting"
      lede="Lead Finder fills the left edge; humans approve; sequences move cards right. Import and the connector waterfall feed the pipeline."
    >
      <StatRow stats={[
        { label: 'In pipeline', value: '459' },
        { label: 'Approved', value: '38', tone: 'primary' },
        { label: 'In sequence', value: '24' },
        { label: 'Reply rate', value: '6.1%', tone: 'success' },
      ]} />

      <Panel label="Pipeline — all campaigns">
        <VdfPipelineKanban columns={COLUMNS} />
      </Panel>

      <div className={s.grid}>
        <Panel label="Import prospects">
          <div className={s.dropzone}>
            <span className={s.dropIcon} aria-hidden>⬆</span>
            <span className={s.dropTitle}>Drop a CSV, or connect a source</span>
            <span className={s.dropSub}>Columns map automatically — you confirm the mapping before staging.</span>
          </div>
          <div className={s.importMeta}>
            <span>Last import: 214 rows · 9 fixed by VaNi · 3 rejected (missing company)</span>
          </div>
        </Panel>

        <Panel label="Connector waterfall — email enrichment">
          <p className={s.connectorLede}>
            Providers are tried in order per contact until one verifies. Drag to reorder;
            the waterfall stops at the first hit.
          </p>
          <VdfEnrichmentWaterfall
            providers={[
              { name: '1 · Provider A', state: 'hit', detail: '61% hit rate' },
              { name: '2 · Provider B', state: 'hit', detail: '24% recovery' },
              { name: '3 · Provider C', state: 'idle' },
            ]}
          />
          <div className={s.connectorFoot}>
            <span className={s.connectorStat}>Verified emails this month: <strong>312</strong></span>
            <span className={s.connectorStat}>Unresolved after full waterfall: <strong>41</strong> (retry in 72h)</span>
          </div>
        </Panel>
      </div>
    </DesignShell>
  );
}
