'use client';

/**
 * /agents/vara — Vara's landing page. Step one of the activation UX.
 *
 * UX from the approved prototype (identity, what-it-does, the principle line,
 * state up front); THEME from the console — one theme across the product, so
 * nothing here carries the prototype's palette.
 *
 * What this page owes the tenant:
 *   - what Vara is, in one read;
 *   - the subscription state, honestly (provisioned / live / not subscribed);
 *   - ONE action: Activate — which either goes live or shows the readiness
 *     checklist with each open item named. The server owns the checklist;
 *     this page renders whatever it answers and never re-derives it.
 *
 * Install (the embed snippet, origin management) is the NEXT step and lands
 * on this page once activation is live — not built yet, deliberately.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import type { SkillResult } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from './vara.module.css';

interface ChecklistItem {
  id: string;
  label: string;
  pass: boolean;
}

interface VaraState {
  subscription: 'none' | 'provisioned' | 'activating' | 'live' | 'suspended';
  checklist: { checks: ChecklistItem[]; ready: boolean };
}

/** What Vara runs, phrased as the spec phrases it — capability, not feature. */
const DOES = [
  { title: 'Composes job definitions', what: 'Role facts, weighted must-haves, knockout rules, a threshold you own.' },
  { title: 'Converses with candidates', what: 'Applying is a short conversation on your site, not a form. Rules stated up front.' },
  { title: 'Screens with evidence', what: 'Every score cites its source. Only deterministic rules can close without a human.' },
  { title: 'Hands humans the decision', what: 'A ranked, evidence-first shortlist. Prepared — never already made.' },
] as const;

export default function VaraLanding() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [activating, setActivating] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);

  // Wrapped in SkillResult because that is DataBoundary's contract — it
  // unwraps `.data` before calling children.
  const state = useQuery<SkillResult<VaraState>, Error>({
    queryKey: ['vara', 'state'],
    queryFn: async () => {
      try {
        const r = await apiFetch<VaraState>(API.vara.state);
        return { success: true, skill: 'vara', function: 'state', data: r };
      } catch (err) {
        // Not yet through the Domain step: state is honestly "not provisioned",
        // not an error screen.
        if ((err as ApiError)?.code === 'TENANT_NOT_PROVISIONED') {
          return {
            success: true,
            skill: 'vara',
            function: 'state',
            data: { subscription: 'none', checklist: { checks: [], ready: false } } as VaraState,
          };
        }
        throw err;
      }
    },
  });

  const activate = useCallback(async () => {
    if (activating) return;
    setActivating(true);
    setChecklist(null);
    try {
      await apiFetch<{ status: string }>(API.vara.activate);
      showToast({ message: 'Vara is live for this workspace', type: 'success' });
      await qc.invalidateQueries({ queryKey: ['vara', 'state'] });
    } catch (err) {
      const e = err as ApiError & { details?: unknown };
      // NOT_READY carries the checklist — that is the answer, not a failure.
      const checks = (e.details as { checks?: ChecklistItem[] })?.checks;
      if (e.code === 'NOT_READY' && checks) {
        setChecklist(checks);
      } else {
        showToast({ message: e.message || 'Could not activate Vara', type: 'error' });
      }
      await qc.invalidateQueries({ queryKey: ['vara', 'state'] });
    } finally {
      setActivating(false);
    }
  }, [activating, qc, showToast]);

  return (
    <div>
      <div className={u.eyebrow}>// AGENTS · VARA</div>
      <h1 className={u.h1}>Vara · Talent</h1>
      <p className={u.lede}>
        Vara runs the front half of talent acquisition for your organisation: it
        composes job definitions, converses with candidates on your own site,
        screens with evidence, and hands your team a decision that is already
        prepared — never already made.
      </p>

      <div className={s.principle} aria-label="Vara's operating principle">
        <b>Rules reject</b> · <b>models rank</b> · <b>humans decide</b>
      </div>

      <div className={s.does}>
        {DOES.map((d) => (
          <div key={d.title} className={s.doesItem}>
            <div className={s.doesTitle}>{d.title}</div>
            <div className={s.doesWhat}>{d.what}</div>
          </div>
        ))}
      </div>

      <section className={u.card}>
        <div className={u.cardHead}>
          Activation
          <span className={u.cardMeta}>subscription per workspace</span>
        </div>
        <div className={u.cardBody}>
          <DataBoundary
            query={state}
            label="Vara's state"
            skeleton={<SkeletonRows rows={2} />}
          >
            {(d: VaraState) => (
              <>
                <div className={s.stateRow}>
                  <span
                    className={`${u.tag} ${
                      d.subscription === 'live' ? u.tagOk : d.subscription === 'suspended' ? u.tagBad : u.tagDim
                    }`}
                  >
                    {d.subscription === 'live'
                      ? 'Live'
                      : d.subscription === 'none'
                        ? 'Not provisioned'
                        : d.subscription}
                  </span>

                  {d.subscription !== 'live' && (
                    <button type="button" className={s.activate} onClick={activate} disabled={activating}>
                      {activating ? 'Activating…' : 'Activate Vara'}
                    </button>
                  )}
                </div>

                {(checklist ?? (d.subscription !== 'live' ? d.checklist.checks : null)) && (
                  <ul className={s.checklist} aria-label="Readiness checklist">
                    {(checklist ?? d.checklist.checks).map((c) => (
                      <li key={c.id} className={s.check}>
                        <span
                          className={`${s.checkMark} ${c.pass ? s.checkPass : s.checkFail}`}
                          aria-hidden="true"
                        >
                          {c.pass ? '✓' : '○'}
                        </span>
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {d.subscription === 'none' && (
                  <p className={s.note}>
                    Complete the Domain step of the Smart Profile first — it
                    provisions this workspace on the platform, which is what an
                    agent subscribes to.
                  </p>
                )}

                {d.subscription === 'live' && (
                  <p className={s.note}>
                    Vara is live. Installing it on your site — the embed snippet
                    and the allowlisted origins — is the next step of this page,
                    arriving with the install screen.
                  </p>
                )}

                <p className={s.note}>
                  The checklist grows as Vara&rsquo;s setup deepens — comms,
                  consent, calibration roles. It only ever shows items that can
                  actually be completed today.
                </p>
              </>
            )}
          </DataBoundary>
        </div>
      </section>
    </div>
  );
}
