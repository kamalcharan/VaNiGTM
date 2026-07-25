import s from './VdfGridOverlay.module.css';

export interface VdfGridOverlayProps {
  /** Grid cell size in px */
  size?: number;
  className?: string;
}

/**
 * VdfGridOverlay — the faint blueprint grid behind mission-control screens
 * (Neural Ops pattern from documents/gtm-engine-ui). Fixed, non-interactive,
 * line color derived from the active theme's muted tone so it works under
 * any theme. Pair with VdfAtmosphere for the full ambient backdrop.
 */
export function VdfGridOverlay({ size = 60, className }: VdfGridOverlayProps) {
  return (
    <div
      className={`${s.grid} ${className || ''}`}
      style={{ backgroundSize: `${size}px ${size}px` }}
      aria-hidden="true"
    />
  );
}

export default VdfGridOverlay;
