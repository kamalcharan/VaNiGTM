'use client';

import s from './password-strength.module.css';

interface PasswordStrengthProps {
  password: string;
}

type Level = 'weak' | 'fair' | 'good' | 'strong';

const LEVELS: Level[] = ['weak', 'fair', 'good', 'strong'];
const LABELS: Record<Level, string> = {
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
};

function scorePassword(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const score = password.length > 0 ? scorePassword(password) : 0;
  const level: Level | null = score > 0 ? LEVELS[score - 1] : null;

  return (
    <div className={s.meter}>
      <div className={s.track}>
        {LEVELS.map((lvl, i) => (
          <div
            key={lvl}
            className={`${s.segment} ${i < score && level ? s[level] : ''}`}
          />
        ))}
      </div>
      <span className={`${s.label} ${level ? s[level] : ''}`}>
        {level ? LABELS[level] : '\u00A0'}
      </span>
    </div>
  );
}
