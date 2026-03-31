import s from './VdfBadge.module.css';

export interface VdfBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'gold' | 'success' | 'info';
  dot?: boolean;
  className?: string;
}

export function VdfBadge({ children, variant = 'default', dot, className }: VdfBadgeProps) {
  return (
    <span className={`${s.badge} ${s[variant]} ${className || ''}`}>
      {dot && <span className={s.dot} />}
      {children}
    </span>
  );
}

export default VdfBadge;
