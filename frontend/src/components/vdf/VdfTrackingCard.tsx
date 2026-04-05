'use client';

/**
 * VdfTrackingCard — Rich card for a bookmarked/tracked scheme.
 *
 * Mobile-first:
 *   Mobile  (<640px): full-width, info top, actions below (2-per-row chips)
 *   Desktop (≥640px): horizontal, info left, actions right
 *
 * Metrics status:
 *   none      — no metrics_calculated_at
 *   outdated  — metrics_calculated_at older than 7 days
 *   fresh     — metrics_calculated_at within 7 days
 *
 * NAV ageing:
 *   Today / Yesterday / Xd ago / No data
 */

import React from 'react';
import styles from './VdfTrackingCard.module.css';

/* ── Types ──────────────────────────────────────────── */

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
  shortLabel?: string;           // for mobile chip
  onClick: () => void;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
  disabled?: boolean;
  loading?: boolean;
}

interface VdfTrackingCardProps {
  bookmark: TrackingBookmark;
  selected?: boolean;
  onSelect?: (code: string) => void;
  actions?: TrackingCardAction[];
  onClick?: (code: string) => void;
}

/* ── Helpers ─────────────────────────────────────────── */

function metricsStatus(calculatedAt?: string | null): 'none' | 'outdated' | 'fresh' {
  if (!calculatedAt) return 'none';
  const age = (Date.now() - new Date(calculatedAt).getTime()) / 86400000;
  return age > 7 ? 'outdated' : 'fresh';
}

function navAgeing(ageDays?: number | null, hasData?: boolean): string {
  if (!hasData) return 'No data';
  if (ageDays == null) return 'No data';
  if (ageDays === 0) return 'Today';
  if (ageDays === 1) return 'Yesterday';
  if (ageDays < 0) return 'Future date';
  return `${ageDays}d ago`;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNav(v?: number | null): string {
  if (v == null) return '—';
  return `₹${Number(v).toFixed(4)}`;
}

/* ── Component ───────────────────────────────────────── */

export function VdfTrackingCard({
  bookmark,
  selected,
  onSelect,
  actions = [],
  onClick,
}: VdfTrackingCardProps) {
  const ms = metricsStatus(bookmark.metrics_calculated_at);
  const ageing = navAgeing(bookmark.nav_age_days, bookmark.nav_records > 0);
  const hasData = bookmark.nav_records > 0;

  const ageingStale = bookmark.nav_age_days != null && bookmark.nav_age_days > 7;

  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ''} ${!hasData ? styles.noData : ''}`}
      onClick={onClick ? () => onClick(bookmark.scheme_code) : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {/* ── Checkbox ── */}
      {onSelect && (
        <div className={styles.checkCol} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            className={styles.check}
            checked={!!selected}
            onChange={() => onSelect(bookmark.scheme_code)}
          />
        </div>
      )}

      {/* ── Info block ── */}
      <div className={styles.info}>
        {/* Row 1: scheme name + metrics badge */}
        <div className={styles.nameRow}>
          <span className={styles.schemeName}>{bookmark.alias_name || bookmark.scheme_name}</span>
          <span className={`${styles.metricsBadge} ${styles[`metrics_${ms}`]}`}>
            {ms === 'fresh' ? 'Metrics ✓' : ms === 'outdated' ? 'Metrics ↻' : 'No Metrics'}
          </span>
        </div>

        {/* Row 2: code + AMC + status dot */}
        <div className={styles.metaRow}>
          <span className={styles.metaChip}>
            <span className={styles.metaLabel}>Code</span>
            <span className={styles.metaMono}>{bookmark.scheme_code}</span>
          </span>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaAmc}>{bookmark.amc}</span>
          {bookmark.active === false && (
            <span className={styles.endedBadge}>Ended</span>
          )}
        </div>

        {/* Row 3: data range + ageing + latest NAV */}
        <div className={styles.dataRow}>
          {hasData ? (
            <>
              <span className={styles.dataIcon}>●</span>
              <span className={styles.dataRecords}>{bookmark.nav_records.toLocaleString()} records</span>
              <span className={styles.dataSep}>·</span>
              <span className={styles.dataRange}>
                {fmtDate(bookmark.earliest_nav_date)} → {fmtDate(bookmark.latest_nav_date)}
              </span>
              <span className={styles.dataSep}>·</span>
              <span className={`${styles.dataAgeing} ${ageingStale ? styles.ageingStale : ''}`}>
                {ageing}
              </span>
              {bookmark.latest_nav && (
                <>
                  <span className={styles.dataSep}>·</span>
                  <span className={styles.dataNav}>{fmtNav(bookmark.latest_nav)}</span>
                </>
              )}
            </>
          ) : (
            <span className={styles.noDataLabel}>No NAV data — download to start tracking</span>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      {actions.length > 0 && (
        <div className={styles.actions} onClick={e => e.stopPropagation()}>
          {actions.map((a, i) => (
            <button
              key={i}
              className={`${styles.actionBtn} ${styles[`btn_${a.variant || 'muted'}`]}`}
              onClick={a.onClick}
              disabled={a.disabled || a.loading}
              title={a.label}
            >
              {a.loading ? <span className={styles.spinner} /> : null}
              <span className={styles.btnLong}>{a.label}</span>
              <span className={styles.btnShort}>{a.shortLabel || a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
