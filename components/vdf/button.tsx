'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import s from './button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${s.btn} ${s[variant]} ${s[size]} ${loading ? s.loading : ''} ${className || ''}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={s.spinner} />}
      <span className={loading ? s.loadingText : ''}>{children}</span>
    </button>
  );
}
