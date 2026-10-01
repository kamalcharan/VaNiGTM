/**
 * VdfInput — themed text/email/number/tel input with label, icon slot, and error state.
 * Uses design tokens from ThemeScript: --input-*, --label-*
 * Composes from styles/forms.module.css for token compliance.
 */
'use client';

import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import s from './VdfInput.module.css';

export interface VdfInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  rightElement?: ReactNode;
  required?: boolean;
}

export const VdfInput = forwardRef<HTMLInputElement, VdfInputProps>(
  function VdfInput({ label, error, hint, icon, rightElement, required, className, id, ...inputProps }, ref) {
    const inputId = id || `vdf-input-${label.toLowerCase().replace(/\s+/g, '-')}`;

    return (
      <div className={s.group}>
        <label className={s.label} htmlFor={inputId}>
          {label}
          {required && <span className={s.required}> *</span>}
        </label>
        <div className={`${s.inputWrap} ${error ? s.hasError : ''}`}>
          {icon && <span className={s.icon}>{icon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={`${s.input} ${icon ? s.withIcon : ''} ${rightElement ? s.withRight : ''} ${className || ''}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...inputProps}
          />
          {rightElement && <span className={s.right}>{rightElement}</span>}
        </div>
        {hint && !error && <div id={`${inputId}-hint`} className={s.hint}>{hint}</div>}
        {error && <div id={`${inputId}-error`} className={s.error} role="alert">{error}</div>}
      </div>
    );
  }
);
