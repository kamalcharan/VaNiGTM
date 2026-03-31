'use client';

import s from './VdfParticles.module.css';

export interface VdfParticlesProps {
  count?: number;
  color?: string;
  className?: string;
}

export function VdfParticles({ count = 8, color, className }: VdfParticlesProps) {
  return (
    <div
      className={`${s.particles} ${className || ''}`}
      style={color ? { '--particle-color': color } as React.CSSProperties : undefined}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={s.particle} />
      ))}
    </div>
  );
}

export default VdfParticles;
