'use client';

/**
 * /agents/vara — Vara's landing page, per Charan's sketch (2026-08-17):
 *
 *   ┌ About band: what Vara is, why, how it helps ─┐  [Activate — code-gated]
 *   │  THE DEMO: the approved UX prototype's        │
 *   │  candidate view, playing itself on a loop     │
 *   └───────────────────────────────────────────────┘
 *   └ CTA / CRO band ──────────────────────────────┘
 *
 * The demo is NOT a rebuild — it is the real prototype
 * (public/vara-demo.html, from docs/vani/vara-ux-prototype-1.html) driven by
 * an autoplay script that clicks the same buttons a candidate would, looping
 * for as long as the page is open. One UX, one source of truth.
 *
 * Activation is gated by the SAME phrase as signup (gate.ts — one gate, one
 * phrase, same honest caveat: a front door, not a lock). A correct phrase
 * marks the subscription `activating` and states plainly that Vara
 * onboarding starts here and is being designed — the stub agreed on
 * 2026-08-17, replaced when the onboarding flow is settled.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { UX_DONE_KEY } from '@/skills/vara-onboarding/mock-data';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { checkGatePhrase } from '@/lib/gate';
import type { SkillResult } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from './vara.module.css';

interface VaraState {
  /**
   * 'none' = the workspace IS on the platform spine but has no subscription
   * row yet — the normal pre-activation state, and it gets the Activate
   * button. 'unprovisioned' (client-side only, from the 409) = the Domain
   * step has never run, so there is nothing to subscribe. Conflating these
   * two once hid the Activate button behind a wrong "complete the Domain
   * step" message from a tenant whose domain was long since set up.
   */
  subscription: 'unprovisioned' | 'none' | 'provisioned' | 'activating' | 'live' | 'suspended';
}

export default function VaraLanding() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [gateOpen, setGateOpen] = useState(false);
  const [uxDone, setUxDone] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [checking, setChecking] = useState(false);

  const state = useQuery<SkillResult<VaraState>, Error>({
    queryKey: ['vara', 'state'],
    queryFn: async () => {
      try {
        const r = await apiFetch<VaraState>(API.vara.state);
        return { success: true, skill: 'vara', function: 'state', data: r };
      } catch (err) {
        if ((err as ApiError)?.code === 'TENANT_NOT_PROVISIONED') {
          return {
            success: true, skill: 'vara', function: 'state',
            data: { subscription: 'unprovisioned' } as VaraState,
          };
        }
        throw err;
      }
    },
  });

  const submitCode = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (checking) return;
      setChecking(true);
      try {
        if (!(await checkGatePhrase(phrase))) {
          showToast({ message: 'That is not the activation phrase.', type: 'error' });
          return;
        }
        await apiFetch<{ status: string }>(API.vara.activate);
        showToast({ message: 'Code accepted — Vara onboarding begins here.', type: 'success' });
        setGateOpen(false);
        setPhrase('');
        await qc.invalidateQueries({ queryKey: ['vara', 'state'] });
      } catch (err) {
        showToast({ message: (err as ApiError).message || 'Could not activate', type: 'error' });
      } finally {
        setChecking(false);
      }
    },
    [checking, phrase, qc, showToast],
  );

  // UX preview: sessionStorage flag set by the onboarding wizard.
  useEffect(() => {
    function read() {
      try { setUxDone(sessionStorage.getItem(UX_DONE_KEY) === '1'); } catch { /* private mode */ }
    }
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);

  // The demo loops via its own reload; remount it if the iframe ever dies.
  const [demoKey, setDemoKey] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDemoKey((k) => k), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      {/* ── About band + the code-gated activation, per the sketch ── */}
      <div className={s.hero}>
        <div className={s.heroText}>
          <div className={u.eyebrow}>// AGENTS · VARA</div>
          <h1 className={u.h1}>Vara · Talent</h1>
          <p className={u.lede}>
            Vara runs the front half of hiring: candidates apply in a short
            conversation on your own site, deterministic rules do the rejecting,
            models do the ranking with evidence, and your team makes every
            decision — prepared, never pre-made. Below is the real flow, playing
            itself.
          </p>
          <div className={s.principle}>
            <b>Rules reject</b> · <b>models rank</b> · <b>humans decide</b>
          </div>
        </div>

        <div className={s.activateBox}>
          <DataBoundary query={state} label="Vara's state" skeleton={<SkeletonRows rows={1} />}>
            {(d: VaraState) => (
              <>
                {d.subscription === 'live' || uxDone ? (
                  <div className={s.stubNote}>
                    <span className={`${u.tag} ${u.tagOk}`}>Live</span>
                    <p>
                      Vara is live for your workspace. Install (paste the
                      snippet on your site) arrives on this page next.
                    </p>
                  </div>
                ) : d.subscription === 'activating' ? (
                  <div className={s.stubNote}>
                    <span className={`${u.tag} ${u.tagOk}`}>Code accepted</span>
                    <p>One step left: pick a role family and approve Vara's
                      recommended playbook.</p>
                    <Link href="/agents/vara/onboarding" className={s.activate}
                      style={{ display: 'inline-flex', alignItems: 'center', marginTop: 10, textDecoration: 'none' }}>
                      Continue setup →
                    </Link>
                  </div>
                ) : d.subscription === 'unprovisioned' ? (
                  <div className={s.stubNote}>
                    <span className={`${u.tag} ${u.tagDim}`}>Not provisioned</span>
                    <p>Complete the Domain step of the Smart Profile first.</p>
                  </div>
                ) : !gateOpen ? (
                  <button type="button" className={s.activate} onClick={() => setGateOpen(true)}>
                    Activate Vara
                  </button>
                ) : (
                  <form onSubmit={submitCode} className={s.gateForm}>
                    <input
                      className={s.gateInput}
                      type="password"
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder="Activation phrase"
                      autoFocus
                      disabled={checking}
                    />
                    <button type="submit" className={s.activate} disabled={checking}>
                      {checking ? '…' : 'Unlock'}
                    </button>
                  </form>
                )}
              </>
            )}
          </DataBoundary>
        </div>
      </div>

      {/* ── The living demo: the approved prototype, playing itself ── */}
      <div className={s.demoWrap}>
        <iframe
          key={demoKey}
          src="/vara-demo.html?autoplay=1"
          title="Vara — the candidate flow, playing live"
          className={s.demoFrame}
        />
        <p className={s.demoCaption}>
          The real product flow, playing itself — the candidate&rsquo;s
          conversation on the left, what your talent team sees for that same
          candidate on the right. It replays continuously.
        </p>
      </div>

      {/* ── CTA / CRO band ── */}
      <div className={s.does}>
        <div className={s.doesItem}>
          <div className={s.doesTitle}>No black holes</div>
          <div className={s.doesWhat}>
            Every applicant is acknowledged in minutes and answered within 3
            working days — rejections included, with feedback themes.
          </div>
        </div>
        <div className={s.doesItem}>
          <div className={s.doesTitle}>Evidence, not adjectives</div>
          <div className={s.doesWhat}>
            Every score component cites its source — a chat answer, a resume
            line. If a number cannot show its evidence, it does not ship.
          </div>
        </div>
        <div className={s.doesItem}>
          <div className={s.doesTitle}>Your site, one script tag</div>
          <div className={s.doesWhat}>
            The candidate chat runs on your own domain — Wix, WordPress,
            anything. Paste one line; Vara handles the rest.
          </div>
        </div>
        <div className={s.doesItem}>
          <div className={s.doesTitle}>Pay per candidate</div>
          <div className={s.doesWhat}>
            Metered per candidate processed. JD creation, messaging and your
            talent pool are inclusive. No seats, no surprises.
          </div>
        </div>
      </div>
    </div>
  );
}
