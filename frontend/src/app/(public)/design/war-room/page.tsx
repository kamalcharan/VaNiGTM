'use client';

/** /design/war-room — live operational dashboard (POA 1.2). Synthetic data. */

import { DesignShell, Panel, StatRow } from '../DesignShell';
import { VdfLiveFeed, VdfScoreRing, type VdfLiveFeedItem } from '@/components/vdf';
import s from './war-room.module.css';

const FEED: VdfLiveFeedItem[] = [
  { id: 'f1', time: '14:32:08', agent: 'Sequence', message: 'Step 2 email sent to Maya Reston (Brightpath CRM) — blind-spend campaign', kind: 'action' },
  { id: 'f2', time: '14:31:44', agent: 'Pulse', message: 'Reply detected from Jonas Feld — sentiment positive, meeting intent', kind: 'success' },
  { id: 'f3', time: '14:29:10', agent: 'Lead Finder', message: '18 new prospects matched agency-graduation criteria, queued for review', kind: 'action' },
  { id: 'f4', time: '14:25:51', agent: 'Enrichment', message: 'Waterfall exhausted for Priya Anand — no verified email, retry in 72h', kind: 'warn' },
  { id: 'f5', time: '14:22:33', agent: 'Storyteller', message: 'Deck v3 approved and shared — 2 external views in the last hour', kind: 'success' },
  { id: 'f6', time: '14:18:02', agent: 'Sequence', message: 'Bounce on t.okafor@fieldnote.example — contact paused, channel flagged', kind: 'error' },
  { id: 'f7', time: '14:11:47', agent: 'VaNi', message: 'Profile completion recalculated: 82 → 86 after competitor confirmation', kind: 'info' },
];

const AGENTS = [
  { name: 'VaNi', role: 'Orchestrator', state: 'live', runs: 214 },
  { name: 'Storyteller', role: 'Pitch decks', state: 'live', runs: 37 },
  { name: 'Lead Finder', role: 'Prospecting', state: 'live', runs: 122 },
  { name: 'Sequence', role: 'Outreach', state: 'live', runs: 483 },
  { name: 'Pulse', role: 'Follow-ups', state: 'idle', runs: 96 },
  { name: 'Auditor', role: 'Digital audit', state: 'queued', runs: 8 },
] as const;

export default function WarRoomDesignPage() {
  return (
    <DesignShell
      path="/design/war-room"
      eyebrow="War Room"
      title="Mission control, live"
      lede="Everything the agent fleet did in the last hour, mission health at a glance, and where a human is needed."
    >
      <StatRow stats={[
        { label: 'Active sequences', value: '12', tone: 'primary' },
        { label: 'Emails today', value: '148' },
        { label: 'Replies', value: '9', tone: 'success' },
        { label: 'Meetings booked', value: '3', tone: 'success' },
        { label: 'Needs attention', value: '2', tone: 'warning' },
      ]} />

      <div className={s.grid}>
        <Panel label="Operational stream" className={s.feedPanel}>
          <VdfLiveFeed items={FEED} />
        </Panel>

        <div className={s.sideCol}>
          <Panel label="Mission health">
            <div className={s.healthRow}>
              <VdfScoreRing value={86} label="ICP score" size={88} />
              <VdfScoreRing value={72} label="Deliverability" size={88} />
              <VdfScoreRing value={64} label="AEO visibility" size={88} />
            </div>
          </Panel>

          <Panel label="Agent fleet">
            <ul className={s.fleet}>
              {AGENTS.map((a) => (
                <li key={a.name} className={s.agentRow}>
                  <span className={`${s.stateDot} ${s[`state_${a.state}`]}`} aria-hidden />
                  <span className={s.agentName}>{a.name}</span>
                  <span className={s.agentRole}>{a.role}</span>
                  <span className={s.agentRuns}>{a.runs} runs</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel label="Awaiting human">
            <ul className={s.awaitList}>
              <li className={s.awaitRow}>
                <span className={s.awaitTitle}>Approve step-3 email variant B</span>
                <span className={s.awaitMeta}>Sequence · blind-spend campaign</span>
              </li>
              <li className={s.awaitRow}>
                <span className={s.awaitTitle}>Review 18 new prospects</span>
                <span className={s.awaitMeta}>Lead Finder · agency-graduation</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </DesignShell>
  );
}
