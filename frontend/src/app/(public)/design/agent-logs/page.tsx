'use client';

/** /design/agent-logs — agent decision observability (POA 1.2). Synthetic data. */

import { DesignShell, Panel, StatRow } from '../DesignShell';
import s from './agent-logs.module.css';

const RUNS = [
  {
    id: 'run_8841', agent: 'Sequence', event: 'PROSPECT_APPROVED', status: 'completed',
    when: '14:32', tokens: '2.1k', duration: '4.2s',
    steps: [
      'Loaded approved story “proof point v2” for blind-spend campaign',
      'Personalized 3 variables from prospect context (company, industry, pain_hook)',
      'Deliverability check passed — domain warm, daily cap 8/40',
      'Email queued for 09:40 prospect-local send window',
    ],
  },
  {
    id: 'run_8840', agent: 'Lead Finder', event: 'CAMPAIGN_CRITERIA_UPDATED', status: 'completed',
    when: '14:29', tokens: '5.8k', duration: '18.6s',
    steps: [
      'Re-ran agency-graduation qualification against 1,240 candidate companies',
      '18 new matches above fit threshold 70',
      'Deduplicated against existing pipeline (3 dropped)',
      'Queued 18 for human review — awaiting_input',
    ],
  },
  {
    id: 'run_8837', agent: 'Enrichment', event: 'CONTACT_NEEDS_EMAIL', status: 'failed',
    when: '14:25', tokens: '0.4k', duration: '11.9s',
    steps: [
      'Waterfall: Provider A → miss (no pattern match)',
      'Waterfall: Provider B → miss (catch-all domain)',
      'Waterfall: Provider C → miss (rate limited, retried once)',
      'Exhausted — scheduled retry in 72h, contact flagged in pipeline',
    ],
  },
  {
    id: 'run_8835', agent: 'VaNi', event: 'KNOWLEDGE_UPDATED', status: 'completed',
    when: '14:11', tokens: '3.3k', duration: '7.1s',
    steps: [
      'New source: competitor confirmation from wizard step 2',
      'KG updated: 4 competitor nodes, 12 positioning edges',
      'Profile recalculated: gtm sub-score 14 → 16, total 82 → 86',
    ],
  },
];

export default function AgentLogsDesignPage() {
  return (
    <DesignShell
      path="/design/agent-logs"
      eyebrow="Agent Logs"
      title="Every decision, inspectable"
      lede="The observability layer: what each agent did, why, what it cost, and where it stopped for a human."
    >
      <StatRow stats={[
        { label: 'Runs today', value: '96' },
        { label: 'Completed', value: '91', tone: 'success' },
        { label: 'Awaiting human', value: '2', tone: 'warning' },
        { label: 'Failed', value: '3' },
        { label: 'Tokens today', value: '212k', tone: 'primary' },
      ]} />

      <Panel label="Recent runs — expand for the decision trail">
        <div className={s.runs}>
          {RUNS.map((run) => (
            <details key={run.id} className={s.run}>
              <summary className={s.runSummary}>
                <span className={`${s.statusDot} ${run.status === 'completed' ? s.ok : s.fail}`} aria-hidden />
                <span className={s.runAgent}>{run.agent}</span>
                <span className={s.runEvent}>{run.event}</span>
                <span className={s.runMeta}>{run.when} · {run.duration} · {run.tokens} tokens</span>
                <span className={s.runId}>{run.id}</span>
              </summary>
              <ol className={s.steps}>
                {run.steps.map((st, i) => (
                  <li key={i} className={s.step}>{st}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </Panel>
    </DesignShell>
  );
}
