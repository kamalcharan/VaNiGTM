'use client';

/**
 * VdfCurrencyInput — rupee (or any currency) input with symbol prefix and unit suffix.
 *
 * Composes from forms.module.css tokens. Used across all snapshot form sections
 * wherever a monetary value is needed (income, expenses, asset values, loan amounts).
 *
 * Usage:
 *   <VdfCurrencyInput label="Monthly Salary" value={val} onChange={setVal} suffix="/mo" />
 */

import { useId } from 'react';
import s from './VdfCurrencyInput.module.css';

export interface VdfCurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Currency symbol — defaults to ₹ */
  currency?: string;
  /** Right-side suffix, e.g. "/mo", "p.a.", "yrs" — omit for none */
  suffix?: string;
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Makes the number field take minimum width — useful in dense grids */
  compact?: boolean;
  className?: string;
}

export function VdfCurrencyInput({
  value,
  onChange,
  currency = '₹',
  suffix,
  label,
  error,
  hint,
  placeholder = '0',
  disabled = false,
  compact = false,
  className,
}: VdfCurrencyInputProps) {
  const id = useId();

  return (
    <div className={`${s.group} ${className || ''}`}>
      {label && (
        <label className={s.label} htmlFor={id}>
          {label}
        </label>
      )}
      <div className={`${s.wrap} ${error ? s.hasError : ''} ${disabled ? s.isDisabled : ''}`}>
        <span className={s.symbol}>{currency}</span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={`${s.input} ${compact ? s.compact : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          min={0}
          step="any"
        />
        {suffix && <span className={s.suffix}>{suffix}</span>}
      </div>
      {hint && !error && (
        <div id={`${id}-hint`} className={s.hint}>{hint}</div>
      )}
      {error && (
        <div id={`${id}-err`} className={s.error} role="alert">{error}</div>
      )}
    </div>
  );
}

export default VdfCurrencyInput;
