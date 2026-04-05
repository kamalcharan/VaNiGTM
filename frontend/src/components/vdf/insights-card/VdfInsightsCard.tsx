'use client';

import s from './VdfInsightsCard.module.css';

export interface Insight {
  icon: string;
  text: string;
}

export interface VdfInsightsCardProps {
  title?: string;
  insights: Insight[];
  className?: string;
}

export function VdfInsightsCard({ title = 'VaNi', insights, className }: VdfInsightsCardProps) {
  if (insights.length === 0) return null;

  return (
    <div className={`${s.card} ${className || ''}`}>
      <div className={s.header}>
        <span>{'\u2728'}</span>
        <span>{title}</span>
      </div>
      {insights.map((ins, i) => (
        <div key={i} className={s.row}>
          <span className={s.icon}>{ins.icon}</span>
          <span>{ins.text}</span>
        </div>
      ))}
    </div>
  );
}
