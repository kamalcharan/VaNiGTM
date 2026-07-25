'use client';

/**
 * /design — index of the Phase 1.2 pixel-final screen designs.
 * Internal review only; all screens use VDF + theme tokens + synthetic data.
 */

import Link from 'next/link';
import { DesignShell } from './DesignShell';
import s from './design-index.module.css';

const SCREENS = [
  { href: '/design/wizard', title: 'Mission Onboarding', desc: 'Six-step agent-led wizard — agent produces, human confirms' },
  { href: '/design/icp', title: 'Profile / ICP Config', desc: 'Typed profile sections, sub-scores, VaNi chat surface' },
  { href: '/design/knowledge', title: 'Knowledge Base', desc: 'Sources, ingestion runs, knowledge-graph coverage' },
  { href: '/design/research', title: 'Research & Competitors', desc: 'Competitor intel cards and positioning angles' },
  { href: '/design/audit', title: 'Digital Audit', desc: 'Presence scores, AEO visibility matrix, fix list' },
  { href: '/design/campaigns', title: 'Campaigns Suite', desc: 'Campaign cards, funnel, qualification criteria' },
  { href: '/design/prospects', title: 'Prospects Pipeline', desc: 'Kanban stages, import, connector waterfall setup' },
  { href: '/design/sequences', title: 'Sequence Builder', desc: 'Flow canvas with branches + story approval' },
  { href: '/design/war-room', title: 'War Room', desc: 'Live feed, agent fleet status, mission health' },
  { href: '/design/agent-logs', title: 'Agent Logs', desc: 'Observability — expandable run decisions' },
  { href: '/design/analytics', title: 'Analytics', desc: 'Funnel, reply trend, recommendations' },
  { href: '/design/settings', title: 'Settings', desc: 'Workspace, team, budgets, appearance' },
];

export default function DesignIndexPage() {
  return (
    <DesignShell
      path="/design"
      eyebrow="Phase 1 · UX Foundation"
      title="Screen designs"
      lede="Every screen of the GTM engine as an approved design — VDF components, theme tokens, synthetic data. Flip the theme on any screen."
    >
      <div className={s.grid}>
        {SCREENS.map((sc, i) => (
          <Link
            key={sc.href}
            href={sc.href}
            className={`${s.card} vdf-glow-card`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <span className={s.cardNum}>{String(i + 1).padStart(2, '0')}</span>
            <span className={s.cardTitle}>{sc.title}</span>
            <span className={s.cardDesc}>{sc.desc}</span>
          </Link>
        ))}
      </div>
    </DesignShell>
  );
}
