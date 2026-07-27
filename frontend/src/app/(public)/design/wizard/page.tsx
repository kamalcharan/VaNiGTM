'use client';

/**
 * /design/wizard — POA Phase 1.2 design screen (internal review)
 *
 * The agent-led onboarding wizard, pixel-final, composed ONLY from VDF
 * components + theme tokens. Implements the six ux-references patterns:
 * agent produces → human confirms (VdfApprovalCard), accumulating
 * left-rail mission memory (VdfMissionMemory), numbered step rail
 * (VdfWizard), substantive campaign cards, per-contact enrichment
 * waterfall (VdfEnrichmentWaterfall), operational-column tables.
 *
 * ALL DATA IS SYNTHETIC (fictional company "Solstice Metrics") per the
 * ux-references README rule. Interactive: confirming a step advances
 * the mission and accumulates the rail. Theme switchable in-page for
 * design review; product default is unchanged.
 *
 * `?record=1` strips every review-only affordance (bar, theme chips, replay
 * row, countdown chrome) — this is what the landing hero loop is recorded
 * from, since it needs no backend and carries no real tenant data.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMissionHandoff } from '@/hooks/useMissionHandoff';
import { useTheme } from '@/config/theme';
import {
  VdfWizard,
  VdfMissionMemory,
  VdfMissionCard,
  VdfMissionSection,
  VdfMissionChips,
  VdfMissionRows,
  VdfApprovalCard,
  VdfButton,
  VdfEnrichmentWaterfall,
  VdfAtmosphere,
  VdfGridOverlay,
  type VdfMissionMemoryItem,
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
  { name: 'Northbeam Analytics', domain: 'northbeam.example', angle: 'Enterprise attribution suite', note: 'Wins on integrations; slow onboarding (6–8 weeks)' },
  { name: 'Clearsight Metrics', domain: 'clearsight.example', angle: 'Self-serve dashboards for SMB', note: 'Cheap entry tier; no revenue attribution' },
  { name: 'Fathomline', domain: 'fathomline.example', angle: 'Agency-focused reporting', note: 'White-label reports; weak API story' },
  { name: 'TraceLoop', domain: 'traceloop.example', angle: 'Developer-first event pipeline', note: 'Loved by engineers; no GTM-side workflows' },
];

/** What step 1 files into mission memory — the company card, narrow. */
const COMPANY = {
  name: 'Solstice Metrics',
  domain: 'solsticemetrics.example',
  description:
    'Revenue attribution platform that joins ad spend, outbound touches and CRM outcomes into one funnel view — built for mid-market B2B SaaS without a data team.',
  tags: ['Series A · 40 people', 'Marketing analytics'],
};

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

  /* `?record=1` — the same screen with every review-only affordance removed:
     no design-review bar, no theme chips, no replay row, and no countdown
     chrome on the cards (nobody is going to intervene in a recording). Read
     from location rather than useSearchParams so this client page needs no
     Suspense boundary. */
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    setRecording(new URLSearchParams(window.location.search).get('record') === '1');
  }, []);

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

  /* ── What each step files into mission memory ──────────────────────────
     Only the DEFINITIONAL steps file an artifact, and each files its own
     shape (see the reference, pages 1–8). Steps 4–6 are operational — their
     tables live on the stage and file nothing but a separator. */
  const artifacts: Record<string, React.ReactNode> = {
    company: (
      <VdfMissionCard
        name={COMPANY.name}
        domain={COMPANY.domain}
        description={COMPANY.description}
        tags={COMPANY.tags}
      />
    ),
    competitors: (
      <VdfMissionSection label="Competitors" count={COMPETITORS.length} onConfigure={() => {}}>
        <VdfMissionChips
          chips={COMPETITORS.map((c) => ({
            id: c.name,
            label: c.domain,
            href: `https://${c.domain}`,
          }))}
        />
      </VdfMissionSection>
    ),
    campaigns: (
      <VdfMissionSection label="Campaigns" count={CAMPAIGNS.length} onConfigure={() => {}}>
        <VdfMissionRows
          rows={CAMPAIGNS.map((c, i) => ({
            id: c.name,
            label: c.name,
            metric: `${c.prospects}`,
            active: i === 0,
          }))}
        />
      </VdfMissionSection>
    ),
  };

  const railItems: VdfMissionMemoryItem[] = useMemo(() => STEPS.map((step, i) => ({
    id: step.id,
    step: i + 1,
    title: step.label,
    state: confirmed.has(step.id) ? 'done' : i === stepIndex ? 'active' : 'pending',
    artifact: confirmed.has(step.id) ? artifacts[step.id] : undefined,
    expectsArtifact: step.id in artifacts,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [confirmed, stepIndex]);

  const current = STEPS[stepIndex];

  return (
    <div className={s.screen}>
      <VdfAtmosphere />
      <VdfGridOverlay />

      {/* Design-review chrome: theme flip (not part of the product screen) */}
      {!recording && (
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
      )}

      <header className={s.top}>
        <div className={s.mission}>
          <span className={s.missionLabel}>Mission · Onboarding</span>
          <span className={s.missionName}>Solstice Metrics</span>
        </div>
        <div className={s.railWrap}>
          <VdfWizard
            variant="mission"
            steps={STEPS.map(({ id, label }) => ({ id, label, mandatory: true }))}
            currentIndex={stepIndex}
            completedSteps={confirmed}
            onStepClick={setStepIndex}
          />
        </div>
      </header>

      <div className={s.layout}>
        <aside className={s.left}>
          <VdfMissionMemory items={railItems} />
        </aside>

        <main ref={stageRef} className={`${s.main} ${handingOff ? s.mainFlying : ''}`} key={current.id}>
          {current.id === 'company' && (
            <VdfApprovalCard
              eyebrow="VaNi · researched from solsticemetrics.example"
              title="Here’s what I learned about your company"
              subtitle="I read your website, docs and public profiles. Correct anything that’s off — everything downstream builds on this."
              status={confirmed.has('company') ? 'confirmed' : 'draft'}
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} autoConfirmSilent={recording} onConfirm={() => confirmStep('company')}
              onEdit={() => {}}
            >
              <div className={s.companyGrid}>
                <div className={s.field}>
                  <span className={s.fieldLabel}>What you do</span>
                  {/* Same string the rail files — the artifact IS this card. */}
                  <p className={s.fieldValue}>{COMPANY.description}</p>
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
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} autoConfirmSilent={recording} onConfirm={() => confirmStep('competitors')}
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
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} autoConfirmSilent={recording} onConfirm={() => confirmStep('campaigns')}
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
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} autoConfirmSilent={recording} onConfirm={() => confirmStep('prospects')}
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
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} autoConfirmSilent={recording} onConfirm={() => confirmStep('contacts')}
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
              autoConfirmMs={autoplay && !finished ? DESIGN_DWELL_MS : undefined} autoConfirmSilent={recording} onConfirm={() => confirmStep('emails')}
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

      {!recording && (
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
      )}
    </div>
  );
}

