import s from './VdfCard.module.css';

export interface VdfCardProps {
  children: React.ReactNode;
  variant?: 'glass' | 'glass-strong' | 'featured';
  accentColor?: string;
  hoverLift?: boolean;
  className?: string;
  onClick?: () => void;
}

export function VdfCard({
  children,
  variant = 'glass',
  accentColor,
  hoverLift = true,
  className,
  onClick,
}: VdfCardProps) {
  const variantClass = variant === 'glass-strong' ? s.glassStrong : variant === 'featured' ? s.featured : s.glass;

  return (
    <div
      className={`${s.card} ${variantClass} ${hoverLift ? s.hoverLift : ''} ${className || ''}`}
      style={accentColor ? { '--card-accent': accentColor } as React.CSSProperties : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export default VdfCard;
