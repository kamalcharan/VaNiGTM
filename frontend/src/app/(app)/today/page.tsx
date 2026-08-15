'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfPageHeader, VdfCard, VdfReadinessRing, VdfButton } from '@/components/vdf';
import { PulseWidget } from '@/components/pulses/PulseWidget';
import { AttentionQueue } from '@/components/today/AttentionQueue';
import s from './dashboard-page.module.css';

/* ── Brain completeness summary ──────────────────────────────────────────
 * Generalized from the old fixed "ICP Foundation" card: profile_score is a
 * composite of independently-weighted Brain objects (Intelligent Add
 * Offers, 2026-08-15) — this card surfaces whichever one is weakest, not
 * just the ICP, so "no offers defined" is as visible as "no ICP defined". */

type BrainKey = 'icp' | 'brand' | 'offers' | 'competitors' | 'vocabulary' | 'research';

interface CompletionDetail {
  research: number; vocabulary: number; competitors: number;
  icp: number; brand: number; offers: number;
}

interface ProfileSummary {
  completion_score: number;
  completion_detail: CompletionDetail | null;
}

const EMPTY_PROFILE: ProfileSummary = { completion_score: 0, completion_detail: null };

/** Weight and where to go fix it. Mirrors BRAIN_SCORERS in
 *  backend/src/skills/profile-skill/profile.service.ts — keep both in sync. */
const BRAIN_SECTIONS: Record<BrainKey, { label: string; weight: number; route: string; why: string }> = {
  icp:         { label: 'Ideal customer', weight: 25, route: '/brain/mission', why: 'Every agent reads this to know who to target.' },
  brand:       { label: 'Brand',          weight: 20, route: '/brain/mission', why: 'Nova (digital marketing) is blocked without it.' },
  offers:      { label: 'Offers',         weight: 20, route: '/brain/offers',  why: "Research can't frame a search without knowing what you sell." },
  competitors: { label: 'Competitors',    weight: 15, route: '/brain/mission', why: 'Sharpens what research looks for.' },
  vocabulary:  { label: 'Market vocabulary', weight: 10, route: '/brain/mission', why: 'Frames every research search.' },
  research:    { label: 'Company profile', weight: 10, route: '/brain/mission', why: 'What everything else is built on.' },
};

function isNotFound(err: unknown): boolean {
  const e = err as Partial<ApiError> | undefined;
  return e?.code === 'PROFILE_NOT_FOUND' || e?.status === 404;
}

/** The Brain object with the lowest fraction of its own weight earned —
 *  fraction, not raw points, so a 0/10 section is not out-ranked by a
 *  half-finished 10/25 one just because 10 > 5. */
function weakestSection(detail: CompletionDetail | null): BrainKey | null {
  if (!detail) return null;
  let weakest: BrainKey | null = null;
  let weakestRatio = Infinity;
  for (const key of Object.keys(BRAIN_SECTIONS) as BrainKey[]) {
    const ratio = detail[key] / BRAIN_SECTIONS[key].weight;
    if (ratio < weakestRatio) {
      weakestRatio = ratio;
      weakest = key;
    }
  }
  return weakestRatio < 1 ? weakest : null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: me } = useMe();
  const user = me?.user;
  const tenant = me?.tenant;

  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch<{ profile: ProfileSummary }>(API.gtmProfile.get);
        if (!cancelled) setProfile(res.profile);
      } catch (err) {
        if (cancelled) return;
        if (isNotFound(err)) {
          // Fresh tenant — no profile row yet. Same empty state as icp-builder.
          setProfile(EMPTY_PROFILE);
        } else {
          showToast({ message: (err as ApiError).message || 'Failed to load your profile', type: 'error' });
          setProfile(EMPTY_PROFILE);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [showToast]);

  const today = useMemo(() =>
    new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }), []);

  const score = profile?.completion_score ?? 0;
  const unlocked = score >= 60;
  const weak = weakestSection(profile?.completion_detail ?? null);
  const weakSection = weak ? BRAIN_SECTIONS[weak] : null;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="TODAY"
        title={greeting()}
        titleEm={user?.name ?? tenant?.name ?? ''}
        meta={<span className={s.headerDate}>{today}</span>}
      />

      <div className={s.body}>

        {/* ── Quiet accounts (G3) ──
            First on the page because it is the only section that is about
            what to do next. Everything below is standing state, which is
            worth seeing and never worth leading with. */}
        <AttentionQueue />

        {/* ── Brain completeness ──
            Generalized from a fixed ICP card: surfaces whichever Brain
            object is weakest, so "no offers defined" is as visible as
            "no ideal customer defined" — never just the one this card used
            to hardcode. */}
        <VdfCard hoverLift={false} className={s.brainCard}>
          <div className={s.brainRow}>
            <VdfReadinessRing pct={score} size={64} strokeWidth={5} />
            <div className={s.brainInfo}>
              <div className={s.brainEyebrow}>Brain</div>
              <div className={s.brainStatus}>
                {profile === null ? 'Loading…'
                  : weakSection ? `${weakSection.label} needs work`
                  : score === 0 ? 'Not started' : 'Complete'}
              </div>
              <div className={s.brainScore}>
                {score}% complete{weakSection ? ` — ${weakSection.why}` : ''}
              </div>
            </div>
            <VdfButton
              variant="primary"
              onClick={() => router.push(weakSection?.route ?? '/brain/mission')}
            >
              {weakSection ? `Fix ${weakSection.label.toLowerCase()}` : 'Review your Brain'}
            </VdfButton>
          </div>
        </VdfCard>

        {/* ── Agent Launchpad ── */}
        <div className={s.sectionLabel}>Your Agents</div>
        <div className={s.launchpadGrid}>
          <button
            type="button"
            className={`${s.agentTile} ${unlocked ? s.agentTileActive : s.agentTileLocked}`}
            onClick={() => unlocked && router.push('/today/storyteller')}
            disabled={!unlocked}
            title={unlocked ? undefined : 'Define your ideal customer first'}
          >
            <span className={s.agentIcon}>🎬</span>
            <span className={s.agentTitle}>Storytelling</span>
            <span className={s.agentSub}>
              {unlocked ? 'Generate pitch decks from your ideal customer' : 'Define your ideal customer first'}
            </span>
          </button>

          <div className={`${s.agentTile} ${s.agentTileLocked}`}>
            <span className={s.agentIcon}>📣</span>
            <span className={s.agentTitle}>Outreach</span>
            <span className={s.agentSub}>Coming soon</span>
          </div>

          <div className={`${s.agentTile} ${s.agentTileLocked}`}>
            <span className={s.agentIcon}>🔁</span>
            <span className={s.agentTitle}>Sequences</span>
            <span className={s.agentSub}>Coming soon</span>
          </div>
        </div>

        {/* ── Follow-ups (Pulses) — live, GTM-relevant, kept from the old page ── */}
        <PulseWidget />

      </div>
    </div>
  );
}
