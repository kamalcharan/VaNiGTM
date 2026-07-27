'use client';

/**
 * /design/wizard — POA Phase 1.2 design screen (internal review)
 *
 * The agent-led onboarding wizard, pixel-final, composed ONLY from VDF
 * components + theme tokens. Implements the six ux-references patterns:
 * agent produces → human confirms (VdfApprovalCard), accumulating
 * left-rail mission memory (VdfMissionRail), numbered step rail
 * (VdfWizard), substantive campaign cards, per-contact enrichment
 * waterfall (VdfEnrichmentWaterfall), operational-column tables.
 *
 * ALL DATA IS SYNTHETIC (fictional company "Solstice Metrics") per the
 * ux-references README rule. Interactive: confirming a step advances
 * the mission and accumulates the rail. Theme switchable in-page for
 * design review; product default is unchanged.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMissionHandoff } from '@/hooks/useMissionHandoff';
import { useTheme } from '@/config/theme';
import {
  VdfWizard,
  VdfMissionRail,
  VdfApprovalCard,
  VdfButton,
  VdfEnrichmentWaterfall,
  VdfAtmosphere,
  VdfGridOverlay,
  type VdfMissionRailItem,
  type VdfEnrichmentProvider,
} from '@/components/vdf';
import s from './wizard.module.css';

/* ── Synthetic mission data (fictional) ─────────────────────────────── */

/** Dwell per step when the design wizard plays itself — snappy enough to
    review the motion repeatedly, slow enough to read the card. */
const DESIGN_DWELL_MS = 3200;

const STEPS = [
  { id: 'company', label: 'Research company' },
  { id: 'competitors', label: 'Explore competitors' },
  { id: 'campaigns', label: 'Define campaigns' },
  { id: 'prospects', label: 'Find customers' },
  { id: 'contacts', label: 'Decision makers' },
  { id: 'emails', label: 'Write emails' },
];

const COMPETITORS = [
  { name: 'Northbeam Analytics', angle: 'Enterprise attribution suite', note: 'Wins on integrations; slow onboarding (6–8 weeks)' },
  { name: 'Clearsight Metrics', angle: 'Self-serve dashboards for SMB', note: 'Cheap entry tier; no revenue attribution' },
  { name: 'Fathomline', angle: 'Agency-focused reporting', note: 'White-label reports; weak API story' },
  { name: 'TraceLoop', angle: 'Developer-first event pipeline', note: 'Loved by engineers; no GTM-side workflows' },
];

const CAMPAIGNS = [
  {
    name: 'The blind-spend campaign',
    pain: 'Marketing leaders at mid-market SaaS can’t tie ad spend to closed revenue — attribution breaks at the CRM boundary.',
    criteria: ['B2B SaaS, 50–500 employees', 'Runs paid + outbound simultaneously', 'HubSpot or Salesforce CRM'],
    examples: ['Brightpath CRM', 'Quill & Ledger', 'Orbital HQ'],
    prospects: 312,
  },
  {
    name: 'The agency-graduation campaign',
    pain: 'Companies leaving their first agency inherit dashboards they can’t operate and a data layer nobody documented.',
    criteria: ['Recently ended agency contract', 'Hiring first in-house growth role', '$2M–$20M ARR'],
    examples: ['Lanternworks', 'Fieldnote Labs'],
    prospects: 147,
  },
];

const PROSPECTS = [
  { company: 'Brightpath CRM', desc: 'Sales CRM for field teams', location: 'Austin, TX', size: '120', traffic: '85k/mo' },
  { company: 'Quill & Ledger', desc: 'Accounting automation for agencies', location: 'Toronto, CA', size: '85', traffic: '42k/mo' },
  { company: 'Orbital HQ', desc: 'Remote-team operations platform', location: 'Berlin, DE', size: '210', traffic: '130k/mo' },
  { company: 'Lanternworks', desc: 'Event marketing software', location: 'Lisbon, PT', size: '64', traffic: '28k/mo' },
  { company: 'Fieldnote Labs', desc: 'Research repository for product teams', location: 'Seattle, WA', size: '95', traffic: '51k/mo' },
];

const CONTACTS: {
  name: string; title: string; company: string;
  waterfall: VdfEnrichmentProvider[];
}[] = [
  {
    name: 'Maya Reston', title: 'VP Marketing', company: 'Brightpath CRM',
    waterfall: [
      { name: 'Provider A', state: 'miss' },
      { name: 'Provider B', state: 'hit', detail: 'm.reston@brightpath.example' },
    ],
  },
  {
    name: 'Jonas Feld', title: 'Head of Growth', company: 'Orbital HQ',
    waterfall: [
      { name: 'Provider A', state: 'hit', detail: 'jonas@orbitalhq.example' },
    ],
  },
  {
    name: 'Priya Anand', title: 'CMO', company: 'Quill & Ledger',
    waterfall: [
      { name: 'Provider A', state: 'miss' },
      { name: 'Provider B', state: 'miss' },
      { name: 'Provider C', state: 'miss' },
    ],
  },
];

const EMAIL_DRAFT = {
  to: 'Maya Reston · VP Marketing, Brightpath CRM',
  subject: 'Brightpath’s paid spend → closed revenue, joined up',
  body: [
    'Hi Maya —',
    'Noticed Brightpath is running paid across three channels while scaling an outbound team — the classic point where attribution breaks at the CRM boundary and budget reviews turn into guesswork.',
    'Solstice Metrics joins ad spend to closed-won revenue inside your existing HubSpot setup, without a data team. Mid-market SaaS teams like yours typically see their first full-funnel report in under a week.',
    'Worth a 20-minute look at your funnel this Thursday?',
  ],
};

/* ── Screen ─────────────────────────────────────────────────────────── */

export default function WizardDesignPage() {
  const { themeId, setTheme, themes } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  // Theme comes from localStorage on the client — only mark the active chip
  // after mount so SSR and first client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Same handoff the live wizard uses — this page is where the motion gets
  // reviewed and recorded, so it must be the SAME code, not a lookalike.
  const { stageRef, handingOff, handoff } = useMissionHandoff<HTMLElement>();
  const [autoplay, setAutoplay] = useState(true);

  const confirmStep = (id: string) => {
    handoff(id, () => {
      setConfirmed((prev) => new Set(prev).add(id));
      setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
    });
  };

  const replay = () => {
    setConfirmed(new Set());
    setStepIndex(0);
    setAutoplay(true);
  };

  const finished = confirmed.size >= STEPS.length - 1;

  const railItems: VdfMissionRailItem[] = useMemo(() => STEPS.map((step, i) => ({
    id: step.id,
    step: i + 1,
    title: step.label,
    state: confirmed.has(step.id) ? 'done' : i === stepIndex ? 'active' : 'pending',
    digest: confirmed.has(step.id) ? RAIL_DIGESTS[step.id] : undefined,
    summary: confirmed.has(step.id) ? RAIL_SUMMARIES[step.id] : undefined,
  })), [confirmed, stepIndex]);

  const current = STEPS[stepIndex];

  return (
    <div className={s.screen}>
      <VdfAtmosphere />
      <VdfGridOverlay />

      {/* Design-review chrome: theme flip (not part of the product screen) */}
      <div className={s.reviewBar}>
        <span className={s.reviewLabel}>DESIGN REVIEW · /design/wizard · synthetic data</span>
        <div className={s.themeChips}>
          {['neural-ops', 'vikuna-black'].map((id) => (
            <button
              key={id}
              type="button"
              className={`${s.themeChip} ${mounted && themeId === id ? s.themeChipActive : ''}`}
              onClick={() => setTheme(id)}
            >
              {themes.find((t) => t.id === id)?.name ?? id}
            </button>
          ))}
        </div>
      </div>

      <header className={s.top}>
        <div className={s.mission}>
          <span className={s.missionLabel}>Mission · Onboarding</span>
          <span className={s.missionName}>Solstice Metrics</span>
        </div>
        <div className={s.railWrap}>
          <VdfWizard
            steps={STEPS.map(({ id, label }) => ({ id, label, mandatory: true }))}
            currentIndex={stepIndex}
            completedSteps={confirmed}
            onStepClick={setStepIndex}
          />
        </div>
      </header>

      <div className={s.layout}>
        <aside className={s.left}>
          <VdfMissionRail items={railItems} />
        </aside>

        <main ref={stageRef} className={`${s.main} ${handingOff ? s.mainFlying : ''}`} key={current.id}>
          {current.id === 'company' && (
            <VdfApprovalCard
              eyebrow="VaNi · researched from solsticemetrics.example"
              title="Here’s what I learned about your company"
              subtitle="I read your website, docs and public profiles. Correct anything that’s off — everything downstream builds on this."
              status={confirmed.has('company') ? 'confirmed' : 'draft'}
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} onConfirm={() => confirmStep('company')}
              onEdit={() => {}}
            >
              <div className={s.companyGrid}>
                <div className={s.field}>
                  <span className={s.fieldLabel}>What you do</span>
                  <p className={s.fieldValue}>
                    Revenue attribution platform that joins ad spend, outbound touches and CRM
                    outcomes into one funnel view — built for mid-market B2B SaaS without a data team.
                  </p>
                </div>
                <div className={s.fieldRow}>
                  <div className={s.field}>
                    <span className={s.fieldLabel}>Industry</span>
                    <p className={s.fieldValue}>Marketing analytics</p>
                  </div>
                  <div className={s.field}>
                    <span className={s.fieldLabel}>Stage</span>
                    <p className={s.fieldValue}>Series A · 40 people</p>
                  </div>
                  <div className={s.field}>
                    <span className={s.fieldLabel}>Pricing motion</span>
                    <p className={s.fieldValue}>Sales-assisted, $12k–$60k ACV</p>
                  </div>
                </div>
                <div className={s.field}>
                  <span className={s.fieldLabel}>Core value props</span>
                  <div className={s.chipRow}>
                    {['Spend → revenue in one view', 'No data team required', 'Live in under a week', 'Works inside HubSpot / Salesforce'].map((v) => (
                      <span key={v} className={s.valueChip}>{v}</span>
                    ))}
                  </div>
                </div>
              </div>
            </VdfApprovalCard>
          )}

          {current.id === 'competitors' && (
            <VdfApprovalCard
              eyebrow="VaNi · mapped your market"
              title="Four competitors shape your buyers’ expectations"
              subtitle="Remove anyone who doesn’t belong; I’ll position against the rest in campaigns and emails."
              status={confirmed.has('competitors') ? 'confirmed' : 'draft'}
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} onConfirm={() => confirmStep('competitors')}
              onEdit={() => {}}
            >
              <div className={s.competitorList}>
                {COMPETITORS.map((c) => (
                  <div key={c.name} className={s.competitorRow}>
                    <div className={s.competitorMain}>
                      <span className={s.competitorName}>{c.name}</span>
                      <span className={s.competitorAngle}>{c.angle}</span>
                    </div>
                    <span className={s.competitorNote}>{c.note}</span>
                  </div>
                ))}
              </div>
            </VdfApprovalCard>
          )}

          {current.id === 'campaigns' && (
            <VdfApprovalCard
              eyebrow="VaNi · drafted from your ICP"
              title="Two campaigns, ready to approve"
              subtitle="Each is a decision, not a blank: pain, qualification, live prospect counts."
              status={confirmed.has('campaigns') ? 'confirmed' : 'draft'}
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} onConfirm={() => confirmStep('campaigns')}
              onEdit={() => {}}
            >
              <div className={s.campaignGrid}>
                {CAMPAIGNS.map((c) => (
                  <div key={c.name} className={s.campaignCard}>
                    <div className={s.campaignHead}>
                      <span className={s.campaignName}>{c.name}</span>
                      <span className={s.prospectCount}>{c.prospects} prospects</span>
                    </div>
                    <p className={s.campaignPain}>{c.pain}</p>
                    <div className={s.field}>
                      <span className={s.fieldLabel}>Qualifies when</span>
                      <ul className={s.criteriaList}>
                        {c.criteria.map((q) => <li key={q}>{q}</li>)}
                      </ul>
                    </div>
                    <div className={s.field}>
                      <span className={s.fieldLabel}>Example targets</span>
                      <div className={s.chipRow}>
                        {c.examples.map((e) => <span key={e} className={s.valueChip}>{e}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </VdfApprovalCard>
          )}

          {current.id === 'prospects' && (
            <VdfApprovalCard
              eyebrow="VaNi · sourced 459 companies, showing top matches"
              title="Potential customers that fit your ICP"
              subtitle="Operational columns only — enough to say yes or no to each."
              status={confirmed.has('prospects') ? 'confirmed' : 'draft'}
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} onConfirm={() => confirmStep('prospects')}
              onEdit={() => {}}
            >
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Company</th><th>Description</th><th>Location</th><th>Size</th><th>Monthly traffic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROSPECTS.map((p) => (
                      <tr key={p.company}>
                        <td className={s.cellStrong}>{p.company}</td>
                        <td>{p.desc}</td>
                        <td>{p.location}</td>
                        <td>{p.size}</td>
                        <td className={s.cellMono}>{p.traffic}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </VdfApprovalCard>
          )}

          {current.id === 'contacts' && (
            <VdfApprovalCard
              eyebrow="VaNi · found decision makers, enriching emails"
              title="Decision makers at your approved prospects"
              subtitle="Each contact runs the enrichment waterfall — providers tried in order until a verified email hits."
              status={confirmed.has('contacts') ? 'confirmed' : 'draft'}
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} onConfirm={() => confirmStep('contacts')}
              onEdit={() => {}}
            >
              <div className={s.contactList}>
                {CONTACTS.map((c) => (
                  <div key={c.name} className={s.contactRow}>
                    <div className={s.contactMain}>
                      <span className={s.contactName}>{c.name}</span>
                      <span className={s.contactTitle}>{c.title} · {c.company}</span>
                    </div>
                    <VdfEnrichmentWaterfall providers={c.waterfall} />
                  </div>
                ))}
              </div>
            </VdfApprovalCard>
          )}

          {current.id === 'emails' && (
            <VdfApprovalCard
              eyebrow="VaNi · wrote in your voice"
              title="First email, personalized per contact"
              subtitle="Grounded in your value props and each prospect’s context. Approve to finish the mission."
              status={confirmed.has('emails') ? 'confirmed' : 'draft'}
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} onConfirm={() => confirmStep('emails')}
              confirmLabel="Approve & launch mission"
              onEdit={() => {}}
            >
              <div className={s.email}>
                <div className={s.emailMeta}>
                  <div className={s.emailMetaRow}><span className={s.fieldLabel}>To</span><span>{EMAIL_DRAFT.to}</span></div>
                  <div className={s.emailMetaRow}><span className={s.fieldLabel}>Subject</span><span className={s.cellStrong}>{EMAIL_DRAFT.subject}</span></div>
                </div>
                <div className={s.emailBody}>
                  {EMAIL_DRAFT.body.map((p) => <p key={p.slice(0, 20)}>{p}</p>)}
                </div>
              </div>
            </VdfApprovalCard>
          )}

          {confirmed.has('emails') && current.id === 'emails' && (
            <div className={s.missionComplete}>
              <span className={s.missionCompleteMark}>✓</span>
              Mission configured — all six steps confirmed. The agents take it from here.
            </div>
          )}
        </main>
      </div>

      <div className={s.replayRow}>
        <VdfButton variant="outline" size="sm" onClick={replay}>Replay the flow</VdfButton>
        <VdfButton
          variant="ghost"
          size="sm"
          onClick={() => setAutoplay((a) => !a)}
        >
          {autoplay ? 'Pause autoplay' : 'Resume autoplay'}
        </VdfButton>
        <span className={s.replayNote}>
          {autoplay ? 'Playing hands-free — same handoff as the live wizard' : 'Autoplay paused — confirm manually'}
        </span>
      </div>
    </div>
  );
}

/* ── Rail digests/summaries (what "mission memory" retains) ─────────── */

const RAIL_DIGESTS: Record<string, string> = {
  company: 'Revenue attribution for mid-market SaaS · Series A · $12k–$60k ACV',
  competitors: '4 competitors mapped — Northbeam, Clearsight, Fathomline, TraceLoop',
  campaigns: '2 campaigns · 459 prospects pooled',
  prospects: '5 companies approved from 459 sourced',
  contacts: '3 decision makers · 2 emails verified',
  emails: 'Sequence drafted in your voice',
};

const RAIL_SUMMARIES: Record<string, React.ReactNode> = {
  company: 'Positioning locked: spend→revenue attribution, no data team required, lives inside the CRM. Everything downstream cites these value props.',
  competitors: 'Differentiation angles saved: faster onboarding than Northbeam, deeper attribution than Clearsight, stronger API than Fathomline, GTM workflows TraceLoop lacks.',
  campaigns: 'Blind-spend (312 prospects) and agency-graduation (147 prospects), each with pain statement + qualification criteria.',
  prospects: 'Brightpath CRM, Quill & Ledger, Orbital HQ, Lanternworks, Fieldnote Labs.',
  contacts: 'Maya Reston (verified), Jonas Feld (verified), Priya Anand — no email found, queued for retry.',
  emails: 'Opener references live channel mix; body grounds on HubSpot value prop; single CTA.',
};
