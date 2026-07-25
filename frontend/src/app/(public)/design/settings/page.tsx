'use client';

/** /design/settings — workspace settings (POA 1.2). Synthetic data. */

import { DesignShell, Panel } from '../DesignShell';
import s from './settings.module.css';

const TEAM = [
  { name: 'A. Founder', email: 'founder@solsticemetrics.example', role: 'Owner' },
  { name: 'G. Marketer', email: 'growth@solsticemetrics.example', role: 'Member' },
];

const CONNECTORS = [
  { name: 'Email (workspace)', state: 'connected', detail: 'sending as hello@solsticemetrics.example' },
  { name: 'Enrichment · Provider A', state: 'connected', detail: '61% hit rate this month' },
  { name: 'Enrichment · Provider B', state: 'connected', detail: 'fallback, 24% recovery' },
  { name: 'LinkedIn', state: 'soon', detail: 'channel arrives with the outreach expansion' },
];

export default function SettingsDesignPage() {
  return (
    <DesignShell
      path="/design/settings"
      eyebrow="Settings"
      title="Workspace"
      lede="Identity, team, connectors, budgets, appearance — the boring parts, kept boring on purpose."
    >
      <div className={s.grid}>
        <Panel label="Workspace identity">
          <div className={s.fields}>
            <div className={s.field}>
              <span className={s.fieldLabel}>Workspace name</span>
              <span className={s.fieldValue}>Solstice Metrics</span>
            </div>
            <div className={s.field}>
              <span className={s.fieldLabel}>Website</span>
              <span className={s.fieldValue}>solsticemetrics.example</span>
            </div>
            <div className={s.field}>
              <span className={s.fieldLabel}>Environment</span>
              <span className={s.fieldValue}>Live <span className={s.envDot} aria-hidden /></span>
            </div>
          </div>
        </Panel>

        <Panel label="Team">
          <ul className={s.team}>
            {TEAM.map((m) => (
              <li key={m.email} className={s.member}>
                <span className={s.avatar} aria-hidden>{m.name.slice(0, 1)}</span>
                <div className={s.memberMain}>
                  <span className={s.memberName}>{m.name}</span>
                  <span className={s.memberEmail}>{m.email}</span>
                </div>
                <span className={s.role}>{m.role}</span>
              </li>
            ))}
            <li className={s.invite}>+ Invite teammate</li>
          </ul>
        </Panel>

        <Panel label="Connectors">
          <ul className={s.connectors}>
            {CONNECTORS.map((c) => (
              <li key={c.name} className={s.connector}>
                <span className={`${s.connDot} ${c.state === 'connected' ? s.connOk : s.connSoon}`} aria-hidden />
                <div className={s.connMain}>
                  <span className={s.connName}>{c.name}</span>
                  <span className={s.connDetail}>{c.detail}</span>
                </div>
                <span className={s.connState}>{c.state === 'connected' ? 'Connected' : 'Coming soon'}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel label="Agent budget">
          <div className={s.budget}>
            <div className={s.budgetHead}>
              <span className={s.budgetUsed}>212k <span className={s.budgetOf}>/ 500k tokens today</span></span>
            </div>
            <div className={s.budgetTrack} role="img" aria-label="212 thousand of 500 thousand tokens used today">
              <div className={s.budgetFill} style={{ width: '42%' }} />
            </div>
            <p className={s.budgetNote}>
              Agents pause politely at the cap and resume at midnight — nothing is lost,
              runs park as awaiting.
            </p>
          </div>
        </Panel>
      </div>
    </DesignShell>
  );
}
