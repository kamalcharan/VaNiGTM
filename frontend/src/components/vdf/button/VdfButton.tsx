'use client';

import s from './VdfButton.module.css';

export interface VdfButtonProps {
  variant: 'primary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  href?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function VdfButton({
  variant,
  size = 'md',
  children,
  href,
  icon,
  onClick,
  className,
  disabled,
  fullWidth,
}: VdfButtonProps) {
  const cls = `${s.btn} ${s[variant]} ${s[size]} ${fullWidth ? s.fullWidth : ''} ${className || ''}`;

  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
        {icon && <span className={s.icon}>{icon}</span>}
      </a>
    );
  }

  return (
    <button className={cls} onClick={onClick} disabled={disabled} type="button">
      {children}
      {icon && <span className={s.icon}>{icon}</span>}
    </button>
  );
}

export default VdfButton;
