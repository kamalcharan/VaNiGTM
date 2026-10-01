'use client';
/**
 * The loader for a source VaNi is reading — the same one onboarding shows.
 *
 * Charan, 2026-09-26: "you need to put loader — we had loader during
 * onboarding". This is that loader: the knowledge-graph constellation with
 * the source named, rotating copy so a silent agent phase does not look
 * frozen, and the run's REAL steps as they land (polled from get_source
 * every 3s while the source is queued or reading). Same labels, same feed
 * styling as the Mission Wizard, so a read looks the same wherever it was
 * started.
 */
import { useSkillQuery } from '@/lib/useSkill';
import { VdfKgLoader } from '@/platform/vdf';
import w from '@/skills/onboarding/mission-wizard.module.css';
import { INTERNAL_STEPS, RESEARCH_ROTATION, RESEARCH_STEP_LABELS, type AgentRunStep } from '../reading-steps';
import { isReading, type KbSource } from '../useKnowledge';

interface SourceDetail extends KbSource { run_status?: string | null; run_steps?: AgentRunStep[] | null; run_error?: string | null; }

export function ReadingProgress({ source }: { source: KbSource }) {
  const reading = isReading(source);
  const q = useSkillQuery<{ source: SourceDetail }>('ingestion-skill', 'get_source', { source_id: source.id }, {
    enabled: reading,
    refetchInterval: reading ? 3000 : false,
  });
  const steps = (q.data?.data?.source.run_steps ?? []).filter((st) => !INTERNAL_STEPS.has(st.step_name));
  const queued = source.status === 'pending' && steps.length === 0;

  return (
    <div style={{ marginTop: 10 }}>
      <VdfKgLoader
        subject={source.display_name}
        message={queued ? 'Waiting for an agent to pick this up' : 'Reading it now'}
        rotating={RESEARCH_ROTATION}
        patienceAfter={60}
      />
      {steps.length > 0 && (
        <ol className={w.stepFeed} aria-label="VaNi's live progress">
          {steps.map((st, i) => {
            const isLast = i === steps.length - 1;
            const failed = st.status === 'error';
            return (
              <li key={`${st.step_name}-${i}`} className={`${w.stepRow} ${isLast && !failed ? w.stepActive : w.stepDone} ${failed ? w.stepFailed : ''}`}>
                <span className={w.stepMark} aria-hidden>
                  {failed ? '✕' : isLast ? '' : '✓'}
                  {isLast && !failed && <span className={w.stepSpinner} />}
                </span>
                <span className={w.stepText}>
                  {RESEARCH_STEP_LABELS[st.step_name] ?? st.action ?? st.step_name}
                  {st.output_summary && <span className={w.stepDetail}> — {st.output_summary}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
