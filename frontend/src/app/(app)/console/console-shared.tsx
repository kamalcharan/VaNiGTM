'use client';

/**
 * Shared console chrome + the one piece of console-wide plumbing:
 * resolving whether the signed-in user is an owner or a partner.
 *
 * Role is NOT decided here — it is read from what get_leads returns for
 * this JWT, which is the same source that decides which rows come back.
 * A frontend that decided "you are an owner" independently could disagree
 * with the backend, and the version that shows more would be the one
 * people notice last.
 */

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import s from './console.module.css';

/* ── Chips ──────────────────────────────────────────────────── */
// Blueprint colour semantics, keyed off values the API supplies.

const BAND_CHIP: Record<string, string> = {
  situational: s.bSit,
  structural: s.bStr,
  systemic: s.bSys,
};

const STATUS_CHIP: Record<string, string> = {
  new: s.stNew,
  contacted: s.stCon,
  l2_booked: s.stL2,
  engaged: s.stEng,
  closed_won: s.stCls,
  closed_lost: s.stCls,
};

export const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  l2_booked: 'L2 booked',
  engaged: 'Engaged',
  closed_won: 'Closed · won',
  closed_lost: 'Closed · lost',
};

export function BandChip({ band }: { band: string | null }) {
  if (!band) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  return <span className={`${s.chip} ${BAND_CHIP[band] ?? s.stCls}`}>{band}</span>;
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`${s.chip} ${STATUS_CHIP[status] ?? s.stCls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/* ── Nav ────────────────────────────────────────────────────── */

export function ConsoleNav({ active, isOwner }: { active: 'leads' | 'partners'; isOwner: boolean }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <div className={s.cNav}>
      <a className={active === 'leads' ? s.cNavOn : ''} onClick={() => router.push('/console')}>Leads</a>
      {/* Partner links are an owner-only screen — a partner has exactly one
          link and no one else's to see, so the tab isn't shown at all. The
          page itself also refuses, since hiding a nav item is not access
          control. */}
      {isOwner && (
        <a className={active === 'partners' ? s.cNavOn : ''} onClick={() => router.push('/console/partners')}>
          Partner links
        </a>
      )}
      <span className={s.who}>
        {user?.email}
        {isOwner && <span className={s.ownerChip}>OWNER · ALL PARTNERS</span>}
        <a onClick={() => { logout(); router.push('/console/login'); }}>Sign out</a>
      </span>
    </div>
  );
}

/* ── Date formatting ────────────────────────────────────────── */
// The GTM app mandates DD-MMM-YYYY via lib/format.ts, but that is the GTM
// app's convention and this subtree deliberately shares none of its UI.
// The blueprint shows relative ages in the list ("2h", "1d") and absolute
// timestamps in the detail timeline; both are implemented here rather than
// pulled from format.ts so VaNi's surface stays self-contained.

export function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function absoluteStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
