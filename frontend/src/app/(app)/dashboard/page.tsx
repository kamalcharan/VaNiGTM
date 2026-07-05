'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfPageHeader, VdfCard, VdfReadinessRing, VdfButton } from '@/components/vdf';
import { PulseWidget } from '@/components/pulses/PulseWidget';
import s from './dashboard-page.module.css';

/* ── ICP profile summary (only the fields this page needs) ──────────────── */

interface ProfileSummary {
  completion_score: number;
}

const EMPTY_PROFILE: ProfileSummary = { completion_score: 0 };

function isNotFound(err: unknown): boolean {
  const e = err as Partial<ApiError> | undefined;
  return e?.code === 'PROFILE_NOT_FOUND' || e?.status === 404;
}

function icpStatusLabel(score: number): string {
  if (score === 0) return 'Not started';
  if (score < 60) return 'In progress';
  return 'Ready';
}

function icpCtaLabel(score: number): string {
  if (score === 0) return 'Build your ICP';
  if (score < 60) return 'Continue your ICP';
  return 'Edit your ICP';
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
          showToast({ message: (err as ApiError).message || 'Failed to load ICP profile', type: 'error' });
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

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="DASHBOARD"
        title={greeting()}
        titleEm={user?.name ?? tenant?.name ?? ''}
        meta={<span className={s.headerDate}>{today}</span>}
      />

      <div className={s.body}>

        {/* ── ICP Foundation ── */}
        <VdfCard hoverLift={false} className={s.icpCard}>
          <div className={s.icpRow}>
            <VdfReadinessRing pct={score} size={64} strokeWidth={5} />
            <div className={s.icpInfo}>
              <div className={s.icpEyebrow}>ICP Foundation</div>
              <div className={s.icpStatus}>{profile === null ? 'Loading…' : icpStatusLabel(score)}</div>
              <div className={s.icpScore}>{score}% complete</div>
            </div>
            <VdfButton variant="primary" onClick={() => router.push('/onboarding/icp-builder')}>
              {icpCtaLabel(score)}
            </VdfButton>
          </div>
        </VdfCard>

        {/* ── Agent Launchpad ── */}
        <div className={s.sectionLabel}>Your Agents</div>
        <div className={s.launchpadGrid}>
          <button
            type="button"
            className={`${s.agentTile} ${unlocked ? s.agentTileActive : s.agentTileLocked}`}
            onClick={() => unlocked && router.push('/dashboard/storyteller')}
            disabled={!unlocked}
            title={unlocked ? undefined : 'Build your ICP first'}
          >
            <span className={s.agentIcon}>🎬</span>
            <span className={s.agentTitle}>Storytelling</span>
            <span className={s.agentSub}>
              {unlocked ? 'Generate pitch decks from your ICP' : 'Build your ICP first'}
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
