import s from '../page.module.css';

interface StatItem {
  value: string;
  label: string;
}

const stats: StatItem[] = [
  { value: '21', label: 'AI-Powered Functions' },
  { value: '8', label: 'Skill Modules' },
  { value: '<2s', label: 'Avg. Response Time' },
  { value: '12', label: 'Premium Themes' },
];

export default function StatsRibbon() {
  return (
    <div className={s.heroStats}>
      {stats.map((stat) => (
        <div key={stat.label} className={s.heroStat}>
          <div className={s.heroStatValue}>{stat.value}</div>
          <div className={s.heroStatLabel}>{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
