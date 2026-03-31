import s from './VdfNoiseOverlay.module.css';

export interface VdfNoiseOverlayProps {
  opacity?: number;
  className?: string;
}

export function VdfNoiseOverlay({ opacity = 0.025, className }: VdfNoiseOverlayProps) {
  return (
    <div
      className={`${s.overlay} ${className || ''}`}
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}

export default VdfNoiseOverlay;
