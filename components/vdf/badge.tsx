'use client';

import s from './badge.module.css';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'primary';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export default function Badge({ label, variant = 'default', size = 'sm', dot }: BadgeProps) {
  return (
    <span className={`${s.badge} ${s[variant]} ${s[size]}`}>
      {dot && <span className={s.dot} />}
      {label}
    </span>
  );
}
