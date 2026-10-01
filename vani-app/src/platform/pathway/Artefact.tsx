'use client';

/**
 * Artefact primitives — what a completed step leaves behind in the left rail.
 *
 * The reduction is an EDITORIAL decision, made per step, and the shapes are not
 * derivable from one another:
 *
 *   a profile      → ArtefactCard   — labelled fields, narrow
 *   a set of tags  → ArtefactChips  — chip grid, everything else dropped
 *   a list         → ArtefactRows   — compact rows with an optional metric
 *
 * So: these primitives own the LOOK. The step owns the CHOICE of what survives.
 * That split is the same one VaNiGTM's VdfMissionArtifact makes, and it is what
 * stops the rail becoming a dumping ground for every field a step touched.
 *
 * One rule inherited deliberately (VaNiGTM CLAUDE.md 9d): NEVER FABRICATE. A
 * field that was not derived or entered is omitted, not guessed at and not
 * filled with a plausible placeholder. `ArtefactCard` drops empty fields rather
 * than rendering them blank, so an absence reads as an absence.
 */

import type { ReactNode } from 'react';
import s from './Artefact.module.css';

/* ── Section header: `YOUR ORGANISATION ✎` ──────────────────────────── */

export function ArtefactSection({
  label,
  count,
  onReopen,
  reopenLabel = 'Edit again',
  children,
}: {
  label: string;
  count?: number;
  /**
   * Reopens a just-confirmed step. Worth having: the moment after confirming is
   * exactly when people notice the typo, and without this the only way back is
   * restarting the pathway.
   */
  onReopen?: () => void;
  reopenLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className={s.section}>
      <header className={s.head}>
        <span className={s.label}>{label}</span>
        {count !== undefined && <span className={s.count}>{count}</span>}
        {onReopen && (
          <button type="button" className={s.reopen} onClick={onReopen} title={reopenLabel}>
            {reopenLabel}
          </button>
        )}
      </header>
      <div className={s.body}>{children}</div>
    </section>
  );
}

/* ── Card: labelled fields ──────────────────────────────────────────── */

export interface ArtefactField {
  label: string;
  value?: string | null;
}

export function ArtefactCard({ fields }: { fields: ArtefactField[] }) {
  // Drop empties rather than render them blank — an omitted field reads as
  // "not known", a blank one reads as "broken".
  const present = fields.filter((f) => f.value && f.value.trim());
  if (!present.length) {
    return <p className={s.none}>Confirmed. Nothing to show here.</p>;
  }
  return (
    <dl className={s.card}>
      {present.map((f) => (
        <div key={f.label} className={s.row}>
          <dt className={s.fLabel}>{f.label}</dt>
          <dd className={s.fValue}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Chips ──────────────────────────────────────────────────────────── */

export function ArtefactChips({ items }: { items: string[] }) {
  if (!items.length) return <p className={s.none}>None captured.</p>;
  return (
    <div className={s.chips}>
      {items.map((it) => (
        <span key={it} className={s.chip}>
          {it}
        </span>
      ))}
    </div>
  );
}

/* ── Rows: compact list with an optional metric ─────────────────────── */

export function ArtefactRows({
  rows,
}: {
  rows: { label: string; meta?: string }[];
}) {
  if (!rows.length) return <p className={s.none}>None captured.</p>;
  return (
    <ul className={s.rows}>
      {rows.map((r) => (
        <li key={r.label} className={s.rowItem}>
          <span className={s.rowLabel}>{r.label}</span>
          {r.meta && <span className={s.rowMeta}>{r.meta}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ── Colour swatches — for a brand artefact ─────────────────────────── */

export function ArtefactSwatches({
  colors,
}: {
  colors: { role: string; hex: string }[];
}) {
  if (!colors.length) return <p className={s.none}>No colours captured.</p>;
  return (
    <div className={s.swatches}>
      {colors.map((c) => (
        <div key={`${c.role}-${c.hex}`} className={s.swatch}>
          <span className={s.chipColor} style={{ background: c.hex }} aria-hidden="true" />
          <span className={s.swatchRole}>{c.role}</span>
          <span className={s.swatchHex}>{c.hex}</span>
        </div>
      ))}
    </div>
  );
}
