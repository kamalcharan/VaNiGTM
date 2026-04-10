'use client';

import React from 'react';

/**
 * VdfRiskProfileCard — selectable risk-profile option grid.
 *
 * Renders a grid of clickable cards, each representing a risk level.
 * A 5-bar visual meter (filled bars = riskLevel) communicates volatility
 * at a glance. Works across all 12 themes via CSS variables.
 *
 * Usage:
 *   const RISK_OPTIONS: RiskOption[] = [
 *     { value: 'conservative', label: 'Conservative',
 *       sublabel: 'Stable, low volatility', riskLevel: 1 },
 *     { value: 'moderate', label: 'Moderate',
 *       sublabel: 'Balanced growth & safety', riskLevel: 3 },
 *     { value: 'aggressive', label: 'Aggressive',
 *       sublabel: 'Max growth, high variance', riskLevel: 5 },
 *   ];
 *
 *   <VdfRiskProfileCard
 *     options={RISK_OPTIONS}
 *     value={riskProfile}
 *     onChange={setRiskProfile}
 *     columns={3}
 *   />
 */

import s from './VdfRiskProfileCard.module.css';

/* ── Types ──────────────────────────────────────────────── */

export interface RiskOption {
  /** Unique key stored as the form value */
  value: string;
  /** Display name, e.g. "Moderate" */
  label: string;
  /** Short description below the label */
  sublabel?: string;
  /**
   * How many of 5 bars are "lit" in the risk meter.
   * 1 = most conservative, 5 = most aggressive.
   */
  riskLevel?: 1 | 2 | 3 | 4 | 5;
}

export interface VdfRiskProfileCardProps {
  options: RiskOption[];
  /** Currently selected value, or null if none */
  value: string | null;
  onChange: (value: string) => void;
  /** Grid columns for the option cards. Default: auto (wraps) */
  columns?: 2 | 3 | 4 | 5;
  disabled?: boolean;
  className?: string;
}

/* ── Component ──────────────────────────────────────────── */

export function VdfRiskProfileCard({
  options,
  value,
  onChange,
  columns,
  disabled = false,
  className,
}: VdfRiskProfileCardProps) {
  const gridStyle = columns
    ? ({ '--risk-cols': columns } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`${s.grid} ${columns ? s.fixedCols : ''} ${className || ''}`}
      style={gridStyle}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            className={`${s.card} ${selected ? s.selected : ''} ${disabled ? s.disabled : ''}`}
            onClick={() => !disabled && onChange(opt.value)}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
          >
            {/* Checkmark shown on selected */}
            {selected && (
              <span className={s.checkmark} aria-hidden>✓</span>
            )}

            {/* Risk meter bars */}
            {opt.riskLevel != null && (
              <RiskBars level={opt.riskLevel} selected={selected} />
            )}

            {/* Text */}
            <span className={s.label}>{opt.label}</span>
            {opt.sublabel && (
              <span className={s.sublabel}>{opt.sublabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── RiskBars sub-component ─────────────────────────────── */

function RiskBars({ level, selected }: { level: number; selected: boolean }) {
  return (
    <div className={`${s.bars} ${selected ? s.barsSelected : ''}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`${s.bar} ${i <= level ? s.barLit : ''}`}
          style={{ '--bar-h': `${(i / 5) * 100}%` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

