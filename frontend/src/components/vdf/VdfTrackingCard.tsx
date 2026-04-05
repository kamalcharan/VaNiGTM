'use client';

/**
 * VdfTrackingCard — Rich card for a bookmarked / tracked scheme.
 *
 * Health status (left-border color):
 *   healthy    → green   (has data, nav current, metrics fresh)
 *   stale      → amber   (nav_age_days > 7)
 *   no_metrics → indigo  (has data but metrics_calculated_at null)
 *   no_data    → red     (nav_records === 0)
 *
 * Safe remove: first click turns ✕ red + label "Sure?",
 *              second click (within 3s) fires onRemove.
 *              Auto-resets if user moves away.
 *
 * Mobile compact: shows one primary action button inline.
 *                 ⋯ button reveals the rest in a dropdown.
 * Desktop:        all action buttons visible in a row.
 */

import { useState, useRef, useCallback } from 'react';
import s from './VdfTrackingCard.module.css';

/* ── Types ──────────────────────────────────────────── */

export type TrackingStatus = 'healthy' | 'stale' | 'no_metrics' | 'no_data';

export interface TrackingBookmark {
  id: number;
  scheme_code: string;
  scheme_name: string;
  amc: string;
  alias_name?: string | null;
  daily_download_enabled: boolean;
  historical_download_done: boolean;
  active: boolean;
  category?: string | null;
  scheme_type?: string | null;
  nav_records: number;
  latest_nav_date?: string | null;
  latest_nav?: number | null;
  earliest_nav_date?: string | null;
  metrics_calculated_at?: string | null;
  nav_age_days?: number | null;
}

export interface TrackingCardAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'success' | 'warning' | 'muted';
  disabled?: boolean;
  loading?: boolean;
  /** Mark as the primary action shown alone on mobile */
  primary?: boolean;
}

interface VdfTrackingCardProps {
  bookmark: TrackingBookmark;
  status: TrackingStatus;
  selected?: boolean;
  onSelect?: (code: string) => void;
  onRemove?: (code: string) => void;
  actions?: TrackingCardAction[];
  onClick?: (code: string) => void;
}

/* ── Helpers ─────────────────────────────────────────── */

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNav(v?: number | null): string {
  if (v == null) return '—';
  return `₹${Number(v).toFixed(4)}`;
}

function navAgeLabel(ageDays?: number | null, hasData?: boolean): string {
  if (!hasData) return '';
  if (ageDays == null) return '';
  if (ageDays === 0) return 'Today';
  if (ageDays === 1) return 'Yesterday';
  return `${ageDays}d ago`;
}

function metricsLabel(calculatedAt?: string | null): 'Metrics ✓' | 'Metrics ↻' | 'No Metrics' {
  if (!calculatedAt) return 'No Metrics';
  const ageDays = (Date.now() - new Date(calculatedAt).getTime()) / 86400000;
  return ageDays > 7 ? 'Metrics ↻' : 'Metrics ✓';
}

/* ── Component ───────────────────────────────────────── */

export function VdfTrackingCard({
  bookmark, status, selected, onSelect, onRemove, actions = [], onClick,
}: VdfTrackingCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasData = bookmark.nav_records > 0;
  const ageLabel = navAgeLabel(bookmark.nav_age_days, hasData);
  const ageStale = (bookmark.nav_age_days ?? 0) > 7;
  const ml = metricsLabel(bookmark.metrics_calculated_at);

  /* Safe remove */
  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmRemove) {
      setConfirmRemove(true);
      confirmTimer.current = setTimeout(() => setConfirmRemove(false), 3000);
    } else {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmRemove(false);
      onRemove?.(bookmark.scheme_code);
    }
  }, [confirmRemove, onRemove, bookmark.scheme_code]);

  /* Mobile primary action = first action marked primary, else first action */
  const primaryAction = actions.find(a => a.primary) ?? actions[0];
  const moreActions = actions.filter(a => a !== primaryAction);

  return (
    <div
      className={`${s.card} ${s[`s_${status}`]} ${selected ? s.selected : ''}`}
      onClick={onClick ? () => onClick(bookmark.scheme_code) : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {/* ── Checkbox ── */}
      {onSelect && (
        <div className={s.checkWrap} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            className={s.check}
            checked={!!selected}
            onChange={() => onSelect(bookmark.scheme_code)}
          />
        </div>
      )}

      {/* ── Remove button — top-right, safe ── */}
      {onRemove && (
        <button
          className={`${s.removeBtn} ${confirmRemove ? s.removeBtnConfirm : ''}`}
          onClick={handleRemoveClick}
          title={confirmRemove ? 'Click again to confirm' : 'Remove from tracking'}
        >
          {confirmRemove ? 'Sure?' : '✕'}
        </button>
      )}

      {/* ── Info ── */}
      <div className={s.info}>
        {/* Name + metrics badge */}
        <div className={s.nameRow}>
          <span className={s.name}>{bookmark.alias_name || bookmark.scheme_name}</span>
          <span className={`${s.metricsBadge} ${s[`mb_${ml === 'Metrics ✓' ? 'fresh' : ml === 'Metrics ↻' ? 'outdated' : 'none'}`]}`}>
            {ml}
          </span>
        </div>

        {/* Code · AMC · Ended badge */}
        <div className={s.metaRow}>
          <span className={s.monoChip}>{bookmark.scheme_code}</span>
          <span className={s.sep}>·</span>
          <span className={s.amc}>{bookmark.amc}</span>
          {bookmark.active === false && <span className={s.endedChip}>Ended</span>}
        </div>

        {/* Data row */}
        <div className={s.dataRow}>
          {hasData ? (
            <>
              <span className={`${s.statusDot} ${s[`dot_${status}`]}`}>●</span>
              <span className={s.records}>{bookmark.nav_records.toLocaleString()} records</span>
              <span className={s.sep}>·</span>
              <span className={s.range}>{fmtDate(bookmark.earliest_nav_date)} → {fmtDate(bookmark.latest_nav_date)}</span>
              {ageLabel && (
                <>
                  <span className={s.sep}>·</span>
                  <span className={`${s.age} ${ageStale ? s.ageStale : s.ageFresh}`}>{ageLabel}</span>
                </>
              )}
              {bookmark.latest_nav != null && (
                <>
                  <span className={s.sep}>·</span>
                  <span className={s.nav}>{fmtNav(bookmark.latest_nav)}</span>
                </>
              )}
            </>
          ) : (
            <span className={s.noData}>No NAV data — download to start tracking</span>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      {actions.length > 0 && (
        <div className={s.actions} onClick={e => e.stopPropagation()}>
          {/* Desktop: all buttons visible */}
          <div className={s.actionsDesktop}>
            {actions.map((a, i) => (
              <button
                key={i}
                className={`${s.actionBtn} ${s[`ab_${a.variant || 'muted'}`]}`}
                onClick={a.onClick}
                disabled={a.disabled || a.loading}
                title={a.label}
              >
                {a.loading && <span className={s.spinner} />}
                {a.label}
              </button>
            ))}
          </div>

          {/* Mobile: primary action + ⋯ more */}
          <div className={s.actionsMobile}>
            {primaryAction && (
              <button
                className={`${s.actionBtn} ${s[`ab_${primaryAction.variant || 'muted'}`]}`}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || primaryAction.loading}
              >
                {primaryAction.loading && <span className={s.spinner} />}
                {primaryAction.label}
              </button>
            )}
            {moreActions.length > 0 && (
              <div className={s.moreWrap}>
                <button
                  className={`${s.actionBtn} ${s.ab_muted}`}
                  onClick={() => setMoreOpen(v => !v)}
                >
                  ⋯
                </button>
                {moreOpen && (
                  <div className={s.moreDropdown} onClick={() => setMoreOpen(false)}>
                    {moreActions.map((a, i) => (
                      <button
                        key={i}
                        className={`${s.moreItem} ${a.disabled ? s.moreItemDisabled : ''}`}
                        onClick={a.onClick}
                        disabled={a.disabled || a.loading}
                      >
                        {a.loading && <span className={s.spinner} />}
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
