import s from '../page.module.css';

interface StatItem {
  value: string;
  label: string;
}

const stats: StatItem[] = [
  { value: '6', label: 'GTM Agents' },
  { value: '3', label: 'Outreach Channels' },
  { value: '24/7', label: 'Always-On Ops' },
  { value: '1', label: 'Mission Control' },
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
