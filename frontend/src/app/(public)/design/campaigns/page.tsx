'use client';

/** /design/campaigns — campaigns suite (POA 1.2). Synthetic data. */

import { DesignShell, Panel, StatRow } from '../DesignShell';
import s from './campaigns.module.css';

const CAMPAIGNS = [
  {
    name: 'The blind-spend campaign', status: 'live',
    pain: 'Marketing leaders can’t tie ad spend to closed revenue.',
    prospects: 312, inSeq: 18, replies: 6, meetings: 2,
  },
  {
    name: 'The agency-graduation campaign', status: 'live',
    pain: 'Post-agency teams inherit dashboards nobody can operate.',
    prospects: 147, inSeq: 6, replies: 3, meetings: 1,
  },
  {
    name: 'Board-season CAC pressure', status: 'draft',
    pain: 'Q4 board decks demand CAC by channel; finance and marketing numbers disagree.',
    prospects: 0, inSeq: 0, replies: 0, meetings: 0,
  },
];

const FUNNEL = [
  { stage: 'Sourced', n: 459 },
  { stage: 'Approved', n: 38 },
  { stage: 'Contacted', n: 24 },
  { stage: 'Replied', n: 9 },
  { stage: 'Meeting', n: 3 },
];

export default function CampaignsDesignPage() {
  const max = FUNNEL[0].n;
  return (
    <DesignShell
      path="/design/campaigns"
      eyebrow="Campaigns"
      title="Campaigns are decisions, not folders"
      lede="Each campaign is a pain hypothesis with its own prospects, sequence and numbers — drafted by VaNi, approved by you."
    >
      <StatRow stats={[
        { label: 'Live campaigns', value: '2', tone: 'primary' },
        { label: 'Total prospects', value: '459' },
        { label: 'Replies', value: '9', tone: 'success' },
        { label: 'Meetings', value: '3', tone: 'success' },
      ]} />

      <div className={s.grid}>
        <div className={s.cards}>
          {CAMPAIGNS.map((c) => (
            <Panel
              key={c.name}
              label={c.status === 'live' ? '● live' : '◌ draft — awaiting approval'}
              className={`${s.campaign} ${c.status === 'draft' ? s.draft : ''}`}
            >
              <span className={s.campName}>{c.name}</span>
              <p className={s.campPain}>{c.pain}</p>
              <div className={s.campStats}>
                <span><strong>{c.prospects}</strong> prospects</span>
                <span><strong>{c.inSeq}</strong> in sequence</span>
                <span><strong>{c.replies}</strong> replies</span>
                <span><strong>{c.meetings}</strong> meetings</span>
              </div>
            </Panel>
          ))}
        </div>

        <Panel label="Funnel — all campaigns, this quarter">
          <div className={s.funnel}>
            {FUNNEL.map((f) => (
              <div key={f.stage} className={s.funnelRow}>
                <span className={s.funnelStage}>{f.stage}</span>
                <div className={s.funnelTrack} role="img" aria-label={`${f.stage}: ${f.n}`}>
                  <div className={s.funnelBar} style={{ width: `${Math.max(2, (f.n / max) * 100)}%` }} />
                </div>
                <span className={s.funnelN}>{f.n}</span>
              </div>
            ))}
          </div>
          <p className={s.funnelNote}>
            Approval is your bottleneck — 459 sourced, 38 approved. Lead Finder’s queue has
            18 more matches waiting for review.
          </p>
        </Panel>
      </div>
    </DesignShell>
  );
}
