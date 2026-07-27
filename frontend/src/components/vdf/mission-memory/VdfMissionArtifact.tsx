'use client';

/**
 * Mission-memory artifact primitives.
 *
 * Each wizard step reduces into the rail in its OWN shape — the reference
 * uses three, and they are not derivable from one another:
 *
 *   step 1 (company)     → VdfMissionCard   — the card again, narrow
 *   step 2 (competitors) → VdfMissionChips  — chip grid, everything else dropped
 *   step 3 (campaigns)   → VdfMissionRows   — compact list rows + metric
 *
 * So the reduction is an editorial decision per step, made by the wizard.
 * These primitives own the LOOK; the wizard owns the CHOICE of what survives.
 * Both /onboarding and /design/wizard compose from here so the two can't drift.
 */

import { useState } from 'react';
import s from './VdfMissionArtifact.module.css';

/* ── Section header: `COMPETITORS 14 ⚙` ─────────────────────────────── */

export interface VdfMissionSectionProps {
  label: string;
  count?: number;
  /** Renders the gear affordance; omit for a static section */
  onConfigure?: () => void;
  configureLabel?: string;
  children: React.ReactNode;
}

export function VdfMissionSection({
  label,
  count,
  onConfigure,
  configureLabel,
  children,
}: VdfMissionSectionProps) {
  return (
    <section className={s.section}>
      <header className={s.sectionHead}>
        <span className={s.sectionLabel}>{label}</span>
        {count !== undefined && <span className={s.sectionCount}>{count}</span>}
        {onConfigure && (
          <button
            type="button"
            className={s.gear}
            onClick={onConfigure}
            aria-label={configureLabel || `Configure ${label.toLowerCase()}`}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <circle cx="8" cy="8" r="2.1" />
              <path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7L3.5 3.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

/* ── The company card, narrow ───────────────────────────────────────── */

export interface VdfMissionCardProps {
  name: string;
  domain?: string;
  /** Square mark — favicon, logo or an initial fallback */
  logo?: React.ReactNode;
  /** The full description paragraph. The reference keeps it whole. */
  description?: string;
  /** Small qualifier chips kept alongside the description (e.g. location) */
  tags?: string[];
  /** Collapsible, as in the reference (chevron top-right) */
  collapsible?: boolean;
}

export function VdfMissionCard({
  name,
  domain,
  logo,
  description,
  tags,
  collapsible = true,
}: VdfMissionCardProps) {
  const [open, setOpen] = useState(true);

  const head = (
    <>
      <span className={s.cardLogo} aria-hidden>
        {logo ?? <span className={s.cardLogoFallback}>{name.slice(0, 1).toUpperCase()}</span>}
      </span>
      <span className={s.cardName}>{name}</span>
      {domain && <span className={s.cardDomain}>{domain}</span>}
    </>
  );

  return (
    <div className={s.card}>
      {collapsible ? (
        <button
          type="button"
          className={s.cardHead}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {head}
          <svg
            className={`${s.chevron} ${open ? s.chevronOpen : ''}`}
            viewBox="0 0 12 12" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" aria-hidden
          >
            <polyline points="3 4.5 6 7.5 9 4.5" />
          </svg>
        </button>
      ) : (
        <div className={`${s.cardHead} ${s.cardHeadStatic}`}>{head}</div>
      )}

      {open && (
        <div className={s.cardBody}>
          {description && <p className={s.cardDesc}>{description}</p>}
          {tags && tags.length > 0 && (
            <div className={s.tagRow}>
              {tags.map((t) => (
                <span key={t} className={s.tag}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chip grid (competitors) ────────────────────────────────────────── */

export interface VdfMissionChip {
  id: string;
  label: string;
  /** Small mark rendered before the label */
  icon?: React.ReactNode;
  /** Renders the external-link affordance and opens in a new tab */
  href?: string;
}

export interface VdfMissionChipsProps {
  chips: VdfMissionChip[];
  /** Show this many, then a `+N more` expander (reference shows 8) */
  visible?: number;
}

export function VdfMissionChips({ chips, visible = 8 }: VdfMissionChipsProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? chips : chips.slice(0, visible);
  const hidden = chips.length - shown.length;

  return (
    <>
      <div className={s.chipGrid}>
        {shown.map((c) => {
          const inner = (
            <>
              <span className={s.chipIcon} aria-hidden>
                {c.icon ?? <span className={s.chipDot} />}
              </span>
              <span className={s.chipLabel}>{c.label}</span>
              {c.href && (
                <svg className={s.chipLink} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
                  <path d="M4.5 2h5.5v5.5M10 2L5 7M9 7.5V10H2V3h2.5" />
                </svg>
              )}
            </>
          );

          return c.href ? (
            <a
              key={c.id}
              className={s.chip}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              title={c.label}
            >
              {inner}
            </a>
          ) : (
            <span key={c.id} className={s.chip} title={c.label}>{inner}</span>
          );
        })}
      </div>

      {(hidden > 0 || expanded) && (
        <button type="button" className={s.more} onClick={() => setExpanded((e) => !e)}>
          <svg
            className={`${s.moreChevron} ${expanded ? s.chevronOpen : ''}`}
            viewBox="0 0 12 12" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" aria-hidden
          >
            <polyline points="3 4.5 6 7.5 9 4.5" />
          </svg>
          {expanded ? 'Show fewer' : `+${hidden} more`}
        </button>
      )}
    </>
  );
}

/* ── List rows (campaigns) ──────────────────────────────────────────── */

export interface VdfMissionRow {
  id: string;
  label: string;
  /** Right-aligned figure — prospect count, score, whatever the step counts */
  metric?: string;
  icon?: React.ReactNode;
  /** Marks the row the stage is currently working from */
  active?: boolean;
  onClick?: () => void;
}

export function VdfMissionRows({ rows }: { rows: VdfMissionRow[] }) {
  return (
    <div className={s.rows}>
      {rows.map((r) => {
        const inner = (
          <>
            <span className={s.rowIcon} aria-hidden>
              {r.icon ?? <span className={s.chipDot} />}
            </span>
            <span className={s.rowLabel}>{r.label}</span>
            {r.metric && <span className={s.rowMetric}>{r.metric}</span>}
          </>
        );

        return r.onClick ? (
          <button
            key={r.id}
            type="button"
            className={`${s.row} ${r.active ? s.rowActive : ''}`}
            onClick={r.onClick}
            aria-current={r.active || undefined}
          >
            {inner}
          </button>
        ) : (
          <div key={r.id} className={`${s.row} ${r.active ? s.rowActive : ''}`}>{inner}</div>
        );
      })}
    </div>
  );
}
