'use client';

import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import { formatDateTime } from '@/lib/format';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import { RunsSubnav } from './RunsList';

interface Item { run_id: string; agent: string; kind: string; question: string | null; asked_at: string; event_id: string | null; event_type: string | null }

const KIND_LABEL: Record<string, string> = {
  llm_failover_approval: 'Spend on the failover model?',
  input: 'VaNi needs an answer',
};

/**
 * One queue for everything parked on a person. Failover questions are decided
 * in Knowledge (the queue there judges whether a later read superseded the
 * run); profile questions are answered in the Smart Profile conversation.
 * This page is the overview, not a third place to answer.
 */
export default function AwaitingQueue() {
  const q = useSkillQuery<{ items: Item[] }>('runs', 'awaiting');

  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM</div>
      <h1 className={u.h1}>Waiting on you</h1>
      <p className={u.lede}>Runs that stopped to ask a person something. Nothing here proceeds until someone answers.</p>
      <RunsSubnav active="awaiting" />

      <section className={u.card}>
        <div className={u.cardHead}>Parked runs<span className={u.cardMeta}>oldest at the bottom</span></div>
        <div className={u.cardBody}>
          <DataBoundary
            query={q}
            label="waiting runs"
            skeleton={<SkeletonRows rows={3} lines={2} />}
            isEmpty={(d) => !d?.items?.length}
            empty="Nothing is waiting on you. When an agent needs a decision — approving a paid escalation, answering a profile question — it appears here."
          >
            {(d) =>
              d.items.map((i) => (
                <div key={i.run_id} className={u.act}>
                  <div className={u.actAt}>{formatDateTime(i.asked_at)}</div>
                  <div>
                    <div className={u.actTxt}>
                      <strong>{KIND_LABEL[i.kind] ?? i.kind}</strong>
                      {i.question ? ` — ${i.question}` : ''}
                    </div>
                    <div className={u.agScope}>
                      {i.agent}{i.event_type ? ` · ${i.event_type}` : ''} ·{' '}
                      <Link href={`/runs/${i.run_id}`} style={{ color: 'var(--ac)' }}>run {i.run_id}</Link>
                      {i.kind === 'llm_failover_approval' && <> · <Link href="/smart-profile/knowledge" style={{ color: 'var(--ac)' }}>decide in Knowledge</Link></>}
                      {i.kind === 'input' && <> · <Link href="/onboarding" style={{ color: 'var(--ac)' }}>answer in the Smart Profile</Link></>}
                    </div>
                  </div>
                </div>
              ))
            }
          </DataBoundary>
        </div>
      </section>
    </div>
  );
}
