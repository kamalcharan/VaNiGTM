import s from './VdfScoreRing.module.css';

export interface VdfScoreRingProps {
  /** 0–100 */
  value: number;
  label?: string;
  /** Ring diameter in px */
  size?: number;
  /** Override the auto status color with a specific CSS color */
  color?: string;
  className?: string;
}

/**
 * VdfScoreRing — audit/health score ring (POA 1.3 gap component).
 * SVG ring with an animated draw; color derives from the score band via
 * theme status tokens (danger < 40 ≤ warning < 70 ≤ success) unless
 * overridden. Value text wears text tokens, not the band color.
 */
export function VdfScoreRing({ value, label, size = 96, color, className }: VdfScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const band = color
    ?? (clamped < 40 ? 'var(--color-danger)' : clamped < 70 ? 'var(--color-warning)' : 'var(--color-success)');

  return (
    <div className={`${s.wrap} ${className || ''}`} style={{ width: size }}>
      <svg
        className={s.ring}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ? label + ': ' : ''}${clamped} out of 100`}
      >
        <circle
          className={s.track}
          cx={size / 2} cy={size / 2} r={r}
          strokeWidth={stroke}
        />
        <circle
          className={s.arc}
          cx={size / 2} cy={size / 2} r={r}
          strokeWidth={stroke}
          stroke={band}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={s.center}>
        <span className={s.value}>{clamped}</span>
      </div>
      {label && <span className={s.label}>{label}</span>}
    </div>
  );
}

export default VdfScoreRing;
