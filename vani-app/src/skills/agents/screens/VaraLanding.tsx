'use client';

/**
 * /agents/vara — Vara's landing, from the reviewed journey prototype
 * (2026-10-01, VaNiGTM documents/prototypes/vara-journey.html).
 *
 * What it keeps from the prototype, and where each piece comes from:
 *   - "Inherit, then proceed": the organisation, industry and domain are read
 *     from the Smart Profile (tenant profile + declared domains). Nothing is
 *     asked here; a missing piece links to the one screen that owns it.
 *   - One next action, decided from real state: domain → industry →
 *     activation → first job → careers site → another job.
 *   - The industry preparation as its own status band (domain-pack research:
 *     ready / preparing / failed / not yet / no industry), in the server's
 *     words where it has them.
 *   - Named milestones that never overclaim: Job published, Website verified
 *     (an observed widget boot on an allowed site, not a self-report), and
 *     Applications unavailable — always, until candidate intake exists.
 *
 * What it drops from the old landing: the autoplaying demo and the "what Vara
 * does" band, which described intake, scoring and replies that are not built.
 *
 * Activation is still the beta phrase (lib/gate.ts — a front door, not a
 * lock), asked inline here, once, and the page carries on from where it was.
 */

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { checkGatePhrase } from '@/lib/gate';
import { useSkillQuery, type SkillResult } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import { useDomainsRead, useOrganisationRead } from '@/skills/smart-profile/useSmartProfile';
import s from './landing.module.css';

interface Check { id: 'industry_set' | 'domain_declared' | 'embed_origins' | 'first_jd_published'; label: string; pass: boolean }

interface VaraState {
  /**
   * 'none' = on the platform spine, no subscription yet (gets Activate).
   * 'unprovisioned' (client-side, from the 409) = the Domain step never ran.
   */
  subscription: 'unprovisioned' | 'none' | 'provisioned' | 'activating' | 'live' | 'suspended';
  checklist?: { checks: Check[]; ready: boolean };
}

type ResearchState = 'no_industry' | 'ready' | 'seeded_only' | 'running' | 'in_review' | 'failed' | 'none';
interface ResearchStatus { state: ResearchState; industry: string | null; families: number; detail: string }

const SET_INDUSTRY = '/onboarding/declare?step=business_profile&next=/agents/vara';
const SET_DOMAIN = '/onboarding/declare?step=vani:domain&next=/agents/vara';

export default function VaraLanding() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [gateOpen, setGateOpen] = useState(false);
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
          return { success: true, skill: 'vara', function: 'state', data: { subscription: 'unprovisioned' } as VaraState };
        }
        throw err;
      }
    },
  });
  const org = useOrganisationRead();
  const domains = useDomainsRead();
  const research = useSkillQuery<ResearchStatus>('domain-pack-skill', 'research_status', {}, {
    refetchInterval: (q) => {
      const st = q.state.data?.success ? q.state.data.data?.state : null;
      return st === 'running' || st === 'in_review' ? 5000 : false;
    },
  });

  const submitCode = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    try {
      if (!(await checkGatePhrase(phrase))) {
        showToast({ message: 'That is not the activation phrase.', type: 'error' });
        return;
      }
      await apiFetch<{ status: string }>(API.vara.activate);
      showToast({ message: 'Vara is activated for your workspace. Next: your first job.', type: 'success' });
      setGateOpen(false);
      setPhrase('');
      await qc.invalidateQueries({ queryKey: ['vara', 'state'] });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not activate', type: 'error' });
    } finally {
      setChecking(false);
    }
  }, [checking, phrase, qc, showToast]);

  const o = org.data?.success ? org.data.data : undefined;
  const doms = domains.data?.success ? domains.data.data ?? [] : [];
  const verifiedOrigin = doms.flatMap((d) => (d.embed_origins ?? []).filter((x) => d.boot_pings?.[x]))[0] ?? null;
  const industry = (o?.industry ?? '').trim();

  return (
    <div>
      <DataBoundary query={state} label="Vara's state" skeleton={<SkeletonRows rows={3} lines={2} />}>
        {(d: VaraState) => {
          const pass = (id: Check['id']) => !!d.checklist?.checks.find((c) => c.id === id)?.pass;
          const published = pass('first_jd_published');
          const active = d.subscription === 'activating' || d.subscription === 'live';

          // One next action, in the order the work actually depends on.
          let next: { label: string; href?: string; note: string };
          if (d.subscription === 'unprovisioned') next = { label: 'Declare your company domain →', href: SET_DOMAIN, note: 'Vara needs your workspace on the platform before anything else. It takes one field.' };
          else if (org.isSuccess && !industry) next = { label: 'Choose your industry →', href: SET_INDUSTRY, note: 'Your industry picks the starting playbooks Vara proposes for each role.' };
          else if (!active) next = { label: 'Activate Vara', note: 'VaNi is in closed beta: activating Vara asks for the access phrase, once.' };
          else if (!published) next = { label: 'Create your first job →', href: '/agents/vara/jd-studio', note: 'A role title is enough to begin. Review every suggestion before it becomes your job.' };
          else if (!verifiedOrigin) next = { label: 'Connect your careers site →', href: '/install', note: 'Your job is published. Add the widget to your careers site and Vara confirms when it loads there.' };
          else next = { label: 'Create another job →', href: '/agents/vara/jd-studio', note: 'Your saved roles are offered first, so the next job starts with more.' };

          return (
            <>
              <section className={s.hero}>
                <div>
                  <div className={u.eyebrow}>Meet Vara · your talent agent</div>
                  <h1 className={s.title}>Your next hire.<br /><em>A thoughtful start.</em></h1>
                  <p className={s.lede}>
                    Turn a role you need into a job you are ready to share. Vara starts with what
                    VaNi knows about your company, then helps you review what matters.
                  </p>
                  <div className={s.actions}>
                    {next.href ? (
                      <Link href={next.href} className={s.primary}>{next.label}</Link>
                    ) : !gateOpen ? (
                      <button type="button" className={s.primary} onClick={() => setGateOpen(true)}>{next.label}</button>
                    ) : (
                      <form onSubmit={submitCode} className={s.gate}>
                        <input className={s.gateInput} type="password" value={phrase} onChange={(e) => setPhrase(e.target.value)}
                          placeholder="Access phrase" aria-label="Access phrase" autoFocus disabled={checking} />
                        <button type="submit" className={s.primary} disabled={checking}>{checking ? 'Checking…' : 'Activate'}</button>
                      </form>
                    )}
                    {active && published && (
                      <Link href="/agents/vara/onboarding" className={s.link}>Your published jobs</Link>
                    )}
                  </div>
                  <p className={s.micro}>{next.note}</p>
                </div>

                <aside className={s.side} aria-label="Already from VaNi">
                  <div className={u.eyebrow}>Already from VaNi</div>
                  <h3>{o?.display_name || o?.name || (org.isLoading ? '…' : 'Your organisation')}</h3>
                  <div className={s.kv}><span>Industry</span><b>{industry || (org.isLoading ? '…' : 'Not chosen yet')}</b></div>
                  <div className={s.kv}><span>Domain</span><b>{doms[0]?.domain ?? (domains.isLoading ? '…' : 'Not declared yet')}</b></div>
                  <p className={s.micro}>
                    From your Smart Profile. Vara does not ask for it again.{' '}
                    <Link href={SET_INDUSTRY} className={s.link}>{industry ? 'Change the industry' : 'Choose your industry'}</Link>
                  </p>
                </aside>
              </section>

              <PreparationBand q={research} />

              <div className={s.grid}>
                <section className={s.card} aria-label="What is ready">
                  <div className={u.eyebrow}>Where you are</div>
                  <div className={s.milestone}>
                    <span className={`${s.mark} ${active ? s.markDone : ''}`}>{active ? '✓' : '1'}</span>
                    <div><h3>Vara activated</h3><p>{active ? 'Available to this workspace.' : 'One access phrase, asked once.'}</p></div>
                  </div>
                  <div className={s.milestone}>
                    <span className={`${s.mark} ${published ? s.markDone : ''}`}>{published ? '✓' : '2'}</span>
                    <div><h3>Job published</h3><p>{published ? 'Role information is ready for the widget.' : 'Name a role, review the draft, publish.'}</p></div>
                  </div>
                  <div className={s.milestone}>
                    <span className={`${s.mark} ${verifiedOrigin ? s.markDone : ''}`}>{verifiedOrigin ? '✓' : '3'}</span>
                    <div>
                      <h3>{verifiedOrigin ? 'Website verified' : 'Website connection'}</h3>
                      <p>{verifiedOrigin
                        ? `The widget has loaded on ${verifiedOrigin}.`
                        : 'Add the widget to your careers site; it counts once it has actually loaded there.'}</p>
                    </div>
                  </div>
                  <div className={s.milestone}>
                    <span className={s.mark}>—</span>
                    <div><h3>Applications unavailable</h3><p>Candidate intake is not enabled yet. A published job does not mean applications are open.</p></div>
                  </div>
                </section>

                <section className={s.card}>
                  <div className={u.eyebrow}>What to expect</div>
                  <div className={s.feature} style={{ marginTop: 10 }}>
                    <span className={s.featureKey}>01 · Start with context</span>
                    <h3>VaNi has done the groundwork.</h3>
                    <p>Your company and industry carry into Vara. You will not fill them in again.</p>
                  </div>
                  <div className={s.feature} style={{ marginTop: 14 }}>
                    <span className={s.featureKey}>02 · Build with control</span>
                    <h3>A proposal you can change.</h3>
                    <p>See where a starting point came from. Changes to one job never rewrite your other roles.</p>
                  </div>
                  <div className={s.feature} style={{ marginTop: 14 }}>
                    <span className={s.featureKey}>03 · Know what is ready</span>
                    <h3>A clear next milestone.</h3>
                    <p>Publishing a job and connecting your website are tracked separately.</p>
                  </div>
                </section>
              </div>

              <div className={s.callout}>
                <b>Current capability:</b> prepare and publish job information, then connect the website
                widget. Candidate applications and screening are not available yet.
              </div>
            </>
          );
        }}
      </DataBoundary>
    </div>
  );
}

/** The industry preparation, as its own band: ready, preparing, failed, not yet, or no industry. */
function PreparationBand({ q }: { q: ReturnType<typeof useSkillQuery<ResearchStatus>> }) {
  if (q.isLoading) return <div className={s.band}><SkeletonRows rows={1} /></div>;
  const r = q.data?.success ? q.data.data : null;
  if (!r) {
    return (
      <div className={s.band} role="status">
        <span className={s.bandIcon}>!</span>
        <div><h3>Vara cannot check its playbooks right now</h3><p>{q.data && !q.data.success ? q.data.error : (q.error?.message ?? 'The status did not load.')}</p></div>
        <button type="button" className={`${s.link} ${s.bandAction}`} onClick={() => void q.refetch()}>Try again</button>
      </div>
    );
  }
  const view: Record<ResearchState, { icon: string; title: string; body: string; action?: [string, string] }> = {
    no_industry: { icon: '!', title: 'Vara needs your industry', body: 'It selects the starting playbooks for each role. Choose it once; every agent uses it.', action: ['Choose your industry →', SET_INDUSTRY] },
    ready: { icon: '✓', title: 'Your industry playbooks are ready', body: r.detail || 'Vara looks for your own saved roles first, then suggests an industry starting point.', action: ['See the roles →', '/agents/vara/families'] },
    seeded_only: { icon: '✓', title: 'Starter playbooks are ready', body: 'These are Vikuna’s generic starting points. Vara can research how your industry hires for sharper ones.', action: ['Research my industry →', '/agents/vara/onboarding'] },
    running: { icon: '◷', title: `Vara is preparing your ${r.industry ?? 'industry'} playbooks`, body: 'You can name a role now. Suggestions are offered for review when they arrive and never replace your work.' },
    in_review: { icon: '◷', title: 'Your industry playbooks are being checked', body: 'You can start a job now and add suggestions later.' },
    failed: { icon: '!', title: 'Industry preparation did not finish', body: r.detail || 'Your company context is safe. Retry, or begin with your own requirements.', action: ['Retry →', '/agents/vara/onboarding'] },
    none: { icon: '·', title: 'Your industry has not been researched yet', body: 'Vara can learn how your industry hires and propose roles from it.', action: ['Research my industry →', '/agents/vara/onboarding'] },
  };
  const v = view[r.state] ?? view.none;
  return (
    <div className={s.band} role="status">
      <span className={s.bandIcon} aria-hidden>{v.icon}</span>
      <div><h3>{v.title}</h3><p>{v.body}</p></div>
      {v.action && <Link href={v.action[1]} className={`${s.link} ${s.bandAction}`}>{v.action[0]}</Link>}
    </div>
  );
}
