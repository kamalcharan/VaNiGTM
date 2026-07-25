'use client';

/** /design/analytics — performance analytics (POA 1.2). Synthetic data. */

import { DesignShell, Panel, StatRow } from '../DesignShell';
import s from './analytics.module.css';

// Reply-rate trend, weekly (single series — the headline metric)
const TREND = [3.2, 3.8, 3.1, 4.4, 5.0, 4.6, 5.8, 6.1];

const CHANNELS = [
  { name: 'Email — blind-spend', sent: 96, replies: 6, rate: 6.3 },
  { name: 'Email — agency-grad', sent: 52, replies: 3, rate: 5.8 },
];

const RECS = [
  'Variant B of the step-3 email is outperforming A by 2.4× replies — VaNi suggests promoting it to default.',
  'Tuesday sends reply 1.8× better than Friday for your ICP — send windows adjusted, pending your approval.',
  'The agency-graduation campaign replies come 70% from companies < 100 people — consider tightening the size criterion.',
];

function TrendChart({ data }: { data: number[] }) {
  const w = 520, h = 140, pad = 10;
  const max = Math.max(...data) * 1.15;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: h - pad - (v / max) * (h - pad * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg className={s.chart} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Reply rate trend, 8 weeks: ${data.join(', ')} percent`}>
      {/* Recessive gridlines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={h * f} y2={h * f} className={s.grid} />
      ))}
      <path d={path} className={s.line} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3.5} className={s.dot}>
          <title>{`Week ${i + 1}: ${data[i]}%`}</title>
        </circle>
      ))}
      {/* Selective direct label — the latest point only */}
      <text x={last.x - 8} y={last.y - 12} className={s.lastLabel} textAnchor="end">{TREND[TREND.length - 1]}%</text>
    </svg>
  );
}

export default function AnalyticsDesignPage() {
  return (
    <DesignShell
      path="/design/analytics"
      eyebrow="Analytics"
      title="What’s working, and what VaNi would change"
      lede="Numbers first, then the recommendation. Every insight links back to the runs that produced it."
    >
      <StatRow stats={[
        { label: 'Reply rate', value: '6.1%', tone: 'success' },
        { label: 'Open rate', value: '54%' },
        { label: 'Meetings / 100 sent', value: '2.0', tone: 'primary' },
        { label: 'Avg. days to reply', value: '2.4' },
      ]} />

      <div className={s.grid}>
        <Panel label="Reply rate — weekly, all campaigns">
          <TrendChart data={TREND} />
        </Panel>

        <Panel label="By campaign">
          <div className={s.channels}>
            {CHANNELS.map((c) => (
              <div key={c.name} className={s.chRow}>
                <span className={s.chName}>{c.name}</span>
                <span className={s.chMeta}>{c.sent} sent · {c.replies} replies</span>
                <div className={s.chTrack} role="img" aria-label={`${c.name}: ${c.rate}% reply rate`}>
                  <div className={s.chFill} style={{ width: `${c.rate * 10}%` }} />
                </div>
                <span className={s.chRate}>{c.rate}%</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel label="VaNi recommends — approve to apply">
        <ol className={s.recs}>
          {RECS.map((r) => (
            <li key={r.slice(0, 24)} className={s.rec}>{r}</li>
          ))}
        </ol>
      </Panel>
    </DesignShell>
  );
}
