import s from './VdfIcon.module.css';

export interface VdfIconProps {
  children: React.ReactNode;
  glowColor?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function VdfIcon({ children, glowColor, size = 'md', className }: VdfIconProps) {
  return (
    <div
      className={`${s.icon} ${s[size]} ${className || ''}`}
      style={glowColor ? { '--icon-glow': glowColor } as React.CSSProperties : undefined}
    >
      {children}
    </div>
  );
}

export default VdfIcon;
