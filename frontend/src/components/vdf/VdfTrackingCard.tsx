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
 * Alias features:
 *   - Inline display alias edit (per-tenant bookmark name) — pencil icon
 *   - Global import-matching aliases section — expandable panel
 *
 * Safe remove: first click turns ✕ red + label "Sure?",
 *              second click (within 3s) fires onRemove.
 *
 * Mobile compact: primary action inline, ⋯ reveals rest.
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

export interface AliasRecord {
  id: number;
  alias_name: string;
  source: string; // 'auto' | 'manual'
}

interface VdfTrackingCardProps {
  bookmark: TrackingBookmark;
  status: TrackingStatus;
  selected?: boolean;
  onSelect?: (code: string) => void;
  onRemove?: (code: string) => void;
  actions?: TrackingCardAction[];
  onClick?: (code: string) => void;
  /** Update display alias (per-tenant name). Pass null to clear. */
  onAliasEdit?: (code: string, newAlias: string | null) => Promise<void>;
  /** Lazy-load global aliases for this scheme */
  onAliasLoad?: (code: string) => Promise<AliasRecord[]>;
  /** Add a global import-matching alias */
  onAliasAdd?: (code: string, alias: string) => Promise<AliasRecord>;
  /** Delete a global alias by id */
  onAliasDelete?: (id: number, code: string) => Promise<void>;
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
  onAliasEdit, onAliasLoad, onAliasAdd, onAliasDelete,
}: VdfTrackingCardProps) {
  /* Remove confirmation */
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Mobile more-dropdown */
  const [moreOpen, setMoreOpen] = useState(false);

  /* Display alias edit */
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasSaving, setAliasSaving] = useState(false);

  /* Global aliases section */
  const [aliasesOpen, setAliasesOpen] = useState(false);
  const [aliases, setAliases] = useState<AliasRecord[]>([]);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [aliasesLoading, setAliasesLoading] = useState(false);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);

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

  /* Display alias save */
  async function saveAlias(value?: string | null) {
    const newVal = value !== undefined ? value : aliasInput.trim() || null;
    if (!onAliasEdit) return;
    setAliasSaving(true);
    try {
      await onAliasEdit(bookmark.scheme_code, newVal);
    } finally {
      setAliasSaving(false);
      setEditingAlias(false);
    }
  }

  /* Toggle global aliases — lazy load on first open */
  async function toggleAliases(e: React.MouseEvent) {
    e.stopPropagation();
    if (!aliasesOpen && !aliasesLoaded && onAliasLoad) {
      setAliasesLoading(true);
      try {
        const data = await onAliasLoad(bookmark.scheme_code);
        setAliases(data);
        setAliasesLoaded(true);
      } finally {
        setAliasesLoading(false);
      }
    }
    setAliasesOpen(v => !v);
  }

  async function addAlias(e: React.MouseEvent) {
    e.stopPropagation();
    const val = newAliasInput.trim();
    if (!val || !onAliasAdd) return;
    setAddingAlias(true);
    try {
      const created = await onAliasAdd(bookmark.scheme_code, val);
      setAliases(prev => [...prev, created]);
      setNewAliasInput('');
    } finally {
      setAddingAlias(false);
    }
  }

  async function deleteAlias(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!onAliasDelete) return;
    await onAliasDelete(id, bookmark.scheme_code);
    setAliases(prev => prev.filter(a => a.id !== id));
  }

  /* Mobile primary action */
  const primaryAction = actions.find(a => a.primary) ?? actions[0];
  const moreActions = actions.filter(a => a !== primaryAction);

  const showAliasSection = !!(onAliasLoad || onAliasAdd || onAliasDelete);

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

      {/* ── Remove button — top-right absolute ── */}
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

        {/* Row 1: name / alias edit */}
        {editingAlias ? (
          <div className={s.aliasEditRow} onClick={e => e.stopPropagation()}>
            <input
              className={s.aliasInput}
              value={aliasInput}
              onChange={e => setAliasInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveAlias();
                if (e.key === 'Escape') setEditingAlias(false);
              }}
              placeholder={bookmark.scheme_name}
              autoFocus
            />
            <button className={s.aliasSaveBtn} onClick={() => saveAlias()} disabled={aliasSaving}>
              {aliasSaving ? <span className={s.spinner} /> : '✓'}
            </button>
            <button className={s.aliasCancelBtn} onClick={e => { e.stopPropagation(); setEditingAlias(false); }}>
              ✕
            </button>
          </div>
        ) : (
          <div className={s.nameRow}>
            <span className={s.name}>{bookmark.alias_name || bookmark.scheme_name}</span>
            {onAliasEdit && (
              <button
                className={s.aliasEditBtn}
                onClick={e => { e.stopPropagation(); setAliasInput(bookmark.alias_name || ''); setEditingAlias(true); }}
                title="Set display name"
              >
                ✎
              </button>
            )}
            <span className={`${s.metricsBadge} ${s[`mb_${ml === 'Metrics ✓' ? 'fresh' : ml === 'Metrics ↻' ? 'outdated' : 'none'}`]}`}>
              {ml}
            </span>
          </div>
        )}

        {/* Show original scheme name when alias is set */}
        {bookmark.alias_name && !editingAlias && (
          <div className={s.aliasOriginalRow} onClick={e => e.stopPropagation()}>
            <span className={s.aliasOriginalLabel}>aka</span>
            <span className={s.aliasOriginalName}>{bookmark.scheme_name}</span>
            {onAliasEdit && (
              <button
                className={s.aliasClearBtn}
                onClick={e => { e.stopPropagation(); saveAlias(null); }}
                title="Clear display name"
              >
                clear
              </button>
            )}
          </div>
        )}

        {/* Row 2: code · AMC · Ended */}
        <div className={s.metaRow}>
          <span className={s.monoChip}>{bookmark.scheme_code}</span>
          <span className={s.sep}>·</span>
          <span className={s.amc}>{bookmark.amc}</span>
          {bookmark.active === false && <span className={s.endedChip}>Ended</span>}
        </div>

        {/* Row 3: NAV data range */}
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

        {/* Row 4: import-matching aliases (expandable) */}
        {showAliasSection && (
          <div className={s.aliasSection} onClick={e => e.stopPropagation()}>
            <button className={s.aliasToggle} onClick={toggleAliases}>
              <span className={s.aliasToggleChevron}>{aliasesOpen ? '▾' : '▸'}</span>
              Import Aliases
              {!aliasesOpen && aliasesLoaded && aliases.length > 0 && (
                <span className={s.aliasCount}>{aliases.length}</span>
              )}
            </button>

            {aliasesOpen && (
              <div className={s.aliasPanel}>
                {aliasesLoading ? (
                  <span className={s.aliasMuted}>Loading…</span>
                ) : (
                  <>
                    {aliases.length === 0 && !onAliasAdd ? (
                      <span className={s.aliasMuted}>No aliases yet</span>
                    ) : (
                      <div className={s.aliasChips}>
                        {aliases.map(a => (
                          <div key={a.id} className={`${s.chip} ${a.source === 'auto' ? s.chipAuto : s.chipManual}`}>
                            <span className={s.chipName}>{a.alias_name}</span>
                            <span className={s.chipSource}>{a.source}</span>
                            {onAliasDelete && (
                              <button className={s.chipDel} onClick={e => deleteAlias(e, a.id)} title="Remove alias">×</button>
                            )}
                          </div>
                        ))}
                        {aliases.length === 0 && (
                          <span className={s.aliasMuted}>No aliases yet — add one below</span>
                        )}
                      </div>
                    )}

                    {onAliasAdd && (
                      <div className={s.aliasAddRow}>
                        <input
                          className={s.aliasAddInput}
                          value={newAliasInput}
                          onChange={e => setNewAliasInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addAlias(e as any); }}
                          placeholder="Add alias for import matching…"
                          onClick={e => e.stopPropagation()}
                        />
                        <button
                          className={s.aliasAddBtn}
                          onClick={addAlias}
                          disabled={!newAliasInput.trim() || addingAlias}
                        >
                          {addingAlias ? <span className={s.spinner} /> : '+ Add'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
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
