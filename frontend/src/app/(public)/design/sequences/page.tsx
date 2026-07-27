'use client';

/** /design/sequences — sequence builder + story approval (POA 1.2). Synthetic data. */

import { DesignShell, Panel } from '../DesignShell';
import { VdfFlowCanvas, VdfApprovalCard, type VdfFlowNode } from '@/components/vdf';
import s from './sequences.module.css';

const FLOW: VdfFlowNode[] = [
  { id: 'n1', kind: 'trigger', title: 'Prospect approved', sub: 'blind-spend campaign · email verified' },
  { id: 'n2', kind: 'action', title: 'Email 1 — the blind-spend opener', sub: 'Personalized per prospect · sent 9–11am local' },
  { id: 'n3', kind: 'delay', title: 'Wait 3 days', sub: 'Skip weekends' },
  { id: 'n4', kind: 'branch', title: 'Did they open twice or click?', branches: [
    { label: 'Yes — engaged', nodes: [
      { id: 'n5', kind: 'action', title: 'Email 2 — the proof point', sub: 'Case study matched to their industry' },
      { id: 'n6', kind: 'exit', title: 'Hand to Pulse on reply', sub: 'Meeting workflow takes over' },
    ]},
    { label: 'No — quiet', nodes: [
      { id: 'n7', kind: 'action', title: 'Email 2b — different angle', sub: 'Leads with the agency-graduation pain' },
      { id: 'n8', kind: 'delay', title: 'Wait 5 days' },
      { id: 'n9', kind: 'exit', title: 'Close politely', sub: 'Suppress for 90 days' },
    ]},
  ]},
];

export default function SequencesDesignPage() {
  return (
    <DesignShell
      path="/design/sequences"
      eyebrow="Sequence Builder"
      title="The outreach flow, drawn"
      lede="VaNi drafts the sequence; every message is a story the human approves before anything sends. Approval gates before anything externally visible."
    >
      <div className={s.grid}>
        <Panel label="Flow — blind-spend campaign" className={s.flowPanel}>
          <VdfFlowCanvas nodes={FLOW} />
        </Panel>

        <div className={s.sideCol}>
          <VdfApprovalCard
            eyebrow="Storyteller · drafted email 2 (proof point)"
            title="Story approval"
            subtitle="Approve the narrative once — the sequence personalizes it per prospect."
            onConfirm={() => {}}
            onEdit={() => {}}
            confirmLabel="Approve story"
          >
            <div className={s.draft}>
              <div className={s.draftMeta}>
                <span className={s.draftLabel}>Subject</span>
                <span className={s.draftSubject}>How {'{company}'} sees spend → revenue in one view</span>
              </div>
              <p className={s.draftBody}>
                Quick proof point: a {'{industry}'} team about your size connected their ad
                accounts and CRM on a Tuesday, and had their first full-funnel report before
                Friday standup — without a data engineer touching it.
              </p>
              <p className={s.draftBody}>
                If {'{pain_hook}'} is on your Q3 list, I can show you the exact setup in 20 minutes.
              </p>
              <div className={s.varRow}>
                {['{company}', '{industry}', '{pain_hook}'].map((v) => (
                  <span key={v} className={s.varChip}>{v}</span>
                ))}
              </div>
            </div>
          </VdfApprovalCard>

          <Panel label="Sequence rules">
            <ul className={s.rules}>
              <li>Nothing sends without an approved story — human gate is structural.</li>
              <li>Reply anywhere → sequence stops, Pulse takes the thread.</li>
              <li>Bounce → channel flagged, contact paused, deliverability score updated.</li>
              <li>Send windows respect the prospect’s timezone, never weekends.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </DesignShell>
  );
}
