'use client';

import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import s from './form-input.module.css';

interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  icon?: ReactNode;
  rightElement?: ReactNode;
}

const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  function FormInput(
    { label, error, icon, rightElement, className, id, ...inputProps },
    ref,
  ) {
    const inputId = id || `fi-${label.toLowerCase().replace(/\s+/g, '-')}`;

    return (
      <div className={s.group}>
        <label className={s.label} htmlFor={inputId}>
          {label}
        </label>
        <div className={`${s.inputWrap} ${error ? s.hasError : ''}`}>
          {icon && <span className={s.icon}>{icon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={`${s.input} ${icon ? s.withIcon : ''} ${rightElement ? s.withRight : ''} ${className || ''}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...inputProps}
          />
          {rightElement && <span className={s.right}>{rightElement}</span>}
        </div>
        {error && (
          <div id={`${inputId}-error`} className={s.error} role="alert">
            {error}
          </div>
        )}
      </div>
    );
  },
);

export default FormInput;
