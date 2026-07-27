'use client';

/** /design/icp — profile / ICP config + VaNi chat surface (POA 1.2). Synthetic data. */

import { DesignShell, Panel } from '../DesignShell';
import { VdfScoreRing } from '@/components/vdf';
import s from './icp.module.css';

const SECTIONS = [
  {
    key: 'product', label: 'Product', score: 38, max: 40,
    fields: [
      { label: 'Product name', value: 'Solstice Metrics' },
      { label: 'Core problem', value: 'Attribution breaks at the CRM boundary — spend and revenue live in different tools.' },
      { label: 'Description', value: 'Joins ad spend, outbound touches and CRM outcomes into one funnel view.' },
    ],
  },
  {
    key: 'icp', label: 'ICP', score: 26, max: 30,
    fields: [
      { label: 'Role', value: 'VP Marketing / Head of Growth' },
      { label: 'Company', value: 'B2B SaaS, 50–500 people, sales-assisted motion' },
      { label: 'Primary pains', value: 'Budget reviews are guesswork · agency dashboards nobody owns · board asks for CAC by channel' },
    ],
  },
  {
    key: 'gtm', label: 'GTM', score: 14, max: 20,
    fields: [
      { label: 'Motion', value: 'Outbound + content, sales-assisted close' },
      { label: 'Channels', value: 'Email first; LinkedIn assist' },
      { label: 'Proof points', value: 'First funnel report < 1 week · no data team needed' },
    ],
  },
  {
    key: 'vision', label: 'Vision', score: 8, max: 10,
    fields: [
      { label: 'Where this goes', value: 'The revenue-truth layer every GTM decision runs on.' },
    ],
  },
];

const CHAT = [
  { from: 'vani', text: 'Your GTM section is the weakest (14/20). One gap: no named competitor angle. Want me to draft one from the research?' },
  { from: 'user', text: 'Yes — position against Northbeam mainly.' },
  { from: 'vani', text: 'Drafted: “Enterprise-grade attribution without the 6-week onboarding — live before Northbeam’s kickoff call.” Added to GTM › proof points as a draft for your confirmation.' },
];

export default function IcpDesignPage() {
  return (
    <DesignShell
      path="/design/icp"
      eyebrow="Profile · ICP"
      title="The foundation every agent stands on"
      lede="Four typed sections mirror the completion score. Edit inline — blur saves — or ask VaNi to fill a gap from what it already knows."
    >
      <div className={s.grid}>
        <div className={s.sections}>
          {SECTIONS.map((sec) => (
            <Panel
              key={sec.key}
              label={`${sec.label} · ${sec.score}/${sec.max}`}
              actions={<div className={s.miniRing}><VdfScoreRing value={Math.round((sec.score / sec.max) * 100)} size={44} /></div>}
            >
              <div className={s.fields}>
                {sec.fields.map((f) => (
                  <div key={f.label} className={s.field}>
                    <span className={s.fieldLabel}>{f.label}</span>
                    <span className={s.fieldValue} role="textbox" aria-label={f.label}>{f.value}</span>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>

        <div className={s.side}>
          <Panel label="Completion">
            <div className={s.completionWrap}>
              <VdfScoreRing value={86} label="ICP score" size={120} />
              <p className={s.completionNote}>
                Complete at 60. Every agent is gated on this — Storyteller, Lead Finder and
                Sequence all read from the confirmed profile.
              </p>
            </div>
          </Panel>

          <Panel label="VaNi">
            <div className={s.chat}>
              {CHAT.map((m, i) => (
                <div key={i} className={`${s.msg} ${m.from === 'vani' ? s.msgVani : s.msgUser}`}>
                  {m.from === 'vani' && <span className={s.msgDot} aria-hidden />}
                  <p className={s.msgText}>{m.text}</p>
                </div>
              ))}
              <div className={s.chatInput}>
                <span className={s.chatPlaceholder}>Ask VaNi to refine a section…</span>
                <span className={s.chatSend} aria-hidden>↵</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </DesignShell>
  );
}
