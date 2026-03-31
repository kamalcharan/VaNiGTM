'use client';

import s from './checkbox.module.css';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export default function Checkbox({ checked, onChange, label, disabled, id }: CheckboxProps) {
  const inputId = id || (label ? `cb-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <label className={`${s.wrap} ${disabled ? s.disabled : ''}`} htmlFor={inputId}>
      <div className={`${s.box} ${checked ? s.checked : ''}`}>
        <input
          id={inputId}
          type="checkbox"
          className={s.input}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {checked && (
          <svg className={s.check} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2.5 6 5 8.5 9.5 3.5" />
          </svg>
        )}
      </div>
      {label && <span className={s.label}>{label}</span>}
    </label>
  );
}
