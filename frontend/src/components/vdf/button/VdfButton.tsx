'use client';

import s from './VdfButton.module.css';

export interface VdfButtonProps {
  variant: 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Square icon-only button — omit text children and pass icon via children */
  iconOnly?: boolean;
  children: React.ReactNode;
  href?: string;
  icon?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

export function VdfButton({
  variant,
  size = 'md',
  iconOnly,
  children,
  href,
  icon,
  onClick,
  className,
  disabled,
  loading,
  fullWidth,
  type = 'button',
  title,
}: VdfButtonProps) {
  const cls = [
    s.btn,
    s[variant],
    s[size],
    iconOnly ? s.iconOnly : '',
    fullWidth ? s.fullWidth : '',
    className || '',
  ].join(' ');

  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
        {icon && <span className={s.icon}>{icon}</span>}
      </a>
    );
  }

  return (
    <button className={cls} onClick={onClick} disabled={disabled || loading} type={type} title={title}>
      {loading ? '…' : children}
      {!loading && icon && <span className={s.icon}>{icon}</span>}
    </button>
  );
}

export default VdfButton;
