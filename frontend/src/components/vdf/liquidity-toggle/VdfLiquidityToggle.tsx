'use client';

/**
 * VdfLiquidityToggle — two-button toggle for asset liquidity classification.
 *
 * Used in the Assets section of the snapshot form.
 * Liquid = can be converted to cash within 30 days (MF, savings).
 * Illiquid = real estate, PPF, locked-in instruments.
 */

import s from './VdfLiquidityToggle.module.css';

export interface VdfLiquidityToggleProps {
  /** true = Liquid, false = Illiquid */
  value: boolean;
  onChange: (isLiquid: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function VdfLiquidityToggle({
  value,
  onChange,
  disabled = false,
  className,
}: VdfLiquidityToggleProps) {
  return (
    <div className={`${s.wrap} ${disabled ? s.disabled : ''} ${className || ''}`} role="group" aria-label="Asset liquidity">
      <button
        type="button"
        className={`${s.btn} ${value ? s.active : ''}`}
        onClick={() => !disabled && onChange(true)}
        aria-pressed={value}
        disabled={disabled}
      >
        <span className={s.icon} aria-hidden>💧</span>
        <span>Liquid</span>
      </button>
      <button
        type="button"
        className={`${s.btn} ${!value ? s.active : ''}`}
        onClick={() => !disabled && onChange(false)}
        aria-pressed={!value}
        disabled={disabled}
      >
        <span className={s.icon} aria-hidden>🔒</span>
        <span>Illiquid</span>
      </button>
    </div>
  );
}

export default VdfLiquidityToggle;
