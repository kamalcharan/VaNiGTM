'use client';

import { useSkillQuery } from '@/hooks/useSkill';
import { VdfLoader, VdfPageHeader, VdfStatusBadge } from '@/components/vdf';
import s from '../war-room.module.css';

/* ── Types ───────────────────────────────────────────── */

interface DashboardStats {
  total_contacts: number;
  total_engaged: number;
  reply_rate_pct: number;
  meetings_booked: number;
}

interface ChannelPerf {
  channel_type: string;
  total_sent: number;
  total_replied: number;
  reply_rate: number;
}

interface FunnelStage {
  stage: string;
  count: number;
  pct: number;
}

interface SeqPerf {
  id: number;
  name: string;
  campaign_name: string;
  status: string;
  contacts_count: number;
  step_count: number;
  avg_open_rate: number;
  avg_reply_rate: number;
}

const CHANNEL_ICONS: Record<string, string> = { email: '📧', whatsapp: '💬', linkedin: '🔗' };

const SEQ_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'info' }> = {
  draft: { label: 'Draft', variant: 'muted' },
  live: { label: 'Live', variant: 'success' },
  paused: { label: 'Paused', variant: 'warning' },
  completed: { label: 'Done', variant: 'info' },
};

/* ── Component ───────────────────────────────────────── */

export default function AnalyticsPage() {
  const { data: statsData, isLoading } = useSkillQuery<DashboardStats>(
    'gtm-analytics-skill', 'get_dashboard_stats', {}
  );
  const { data: channelData } = useSkillQuery<{ channels: ChannelPerf[] }>(
    'gtm-analytics-skill', 'get_channel_performance', {}
  );
  const { data: funnelData } = useSkillQuery<{ stages: FunnelStage[]; total: number }>(
    'gtm-analytics-skill', 'get_conversion_funnel', {}
  );
  const { data: seqData } = useSkillQuery<{ sequences: SeqPerf[] }>(
    'gtm-analytics-skill', 'get_sequence_performance', {}
  );

  if (isLoading) return <VdfLoader overlay message="Loading analytics…" />;

  const stats    = statsData?.data ?? {} as DashboardStats;
  const channels = channelData?.data?.channels ?? [];
  const funnel   = funnelData?.data?.stages ?? [];
  const maxCount = Math.max(...funnel.map(f => f.count), 1);
  const seqs     = seqData?.data?.sequences ?? [];

  return (
    <div className={s.page}>
      <VdfPageHeader eyebrow="WAR ROOM" title="Performance Analytics" />

      {/* ── Big metric cards ───────────────────────────── */}
      <div className={s.analyticsGrid}>
        <div className={s.bigMetric}>
          <span className={s.bigMetricValue}>{stats.total_contacts ?? 0}</span>
          <span className={s.bigMetricLabel}>Total Contacts</span>
        </div>
        <div className={s.bigMetric}>
          <span className={s.bigMetricValue}>{stats.total_engaged ?? 0}</span>
          <span className={s.bigMetricLabel}>Engaged</span>
        </div>
        <div className={s.bigMetric}>
          <span className={s.bigMetricValue}>{stats.reply_rate_pct ?? 0}%</span>
          <span className={s.bigMetricLabel}>Reply Rate</span>
        </div>
        <div className={s.bigMetric}>
          <span className={s.bigMetricValue}>{stats.meetings_booked ?? 0}</span>
          <span className={s.bigMetricLabel}>Meetings Booked</span>
        </div>
      </div>

      {/* ── Two-column body ────────────────────────────── */}
      <div className={s.analyticsBody}>

        {/* Conversion funnel */}
        <div className={s.panel}>
          <div className={s.panelTitle}>Conversion Funnel</div>
          <div className={s.funnelBars}>
            {funnel.map((stage) => (
              <div key={stage.stage} className={s.funnelBar}>
                <span className={s.funnelBarLabel}>{stage.stage}</span>
                <div className={s.funnelBarTrack}>
                  <div className={s.funnelBarFill} style={{ width: `${Math.max((stage.count / maxCount) * 100, 2)}%` }} />
                </div>
                <span className={s.funnelBarCount}>{stage.count} ({stage.pct}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Channel comparison */}
        <div className={s.panel}>
          <div className={s.panelTitle}>Channel Comparison</div>
          <div className={s.channelPerfList}>
            {channels.map((ch) => (
              <div key={ch.channel_type} className={s.channelPerfRow}>
                <span className={s.channelPerfIcon}>{CHANNEL_ICONS[ch.channel_type] ?? '📡'}</span>
                <span className={s.channelPerfName}>{ch.channel_type}</span>
                <div className={s.channelPerfStats}>
                  <div className={s.channelPerfStat}>
                    <span className={s.channelPerfValue}>{ch.total_sent}</span>
                    <span className={s.channelPerfLabel}>Sent</span>
                  </div>
                  <div className={s.channelPerfStat}>
                    <span className={s.channelPerfValue}>{ch.total_replied}</span>
                    <span className={s.channelPerfLabel}>Replies</span>
                  </div>
                  <div className={s.channelPerfStat}>
                    <span className={s.channelPerfValue}>{ch.reply_rate}%</span>
                    <span className={s.channelPerfLabel}>Rate</span>
                  </div>
                </div>
              </div>
            ))}
            {channels.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', padding: '12px 0' }}>No channel data yet</div>
            )}
          </div>
        </div>

        {/* Sequence performance — spans full width */}
        <div className={s.panel} style={{ gridColumn: '1 / -1' }}>
          <div className={s.panelTitle}>Sequence Performance</div>
          {seqs.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', padding: '12px 0' }}>No sequences yet</div>
          ) : (
            <table className={s.seqPerfTable}>
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Contacts</th>
                  <th>Open Rate</th>
                  <th>Reply Rate</th>
                </tr>
              </thead>
              <tbody>
                {seqs.map((sq) => {
                  const badge = SEQ_STATUS[sq.status] ?? SEQ_STATUS.draft;
                  return (
                    <tr key={sq.id}>
                      <td style={{ fontWeight: 600 }}>{sq.name}</td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.78rem' }}>{sq.campaign_name}</td>
                      <td><VdfStatusBadge label={badge.label} variant={badge.variant} /></td>
                      <td>{sq.step_count}</td>
                      <td>{sq.contacts_count}</td>
                      <td>{sq.avg_open_rate}%</td>
                      <td style={{ fontWeight: 600, color: sq.avg_reply_rate > 5 ? 'var(--color-success)' : 'var(--color-fg)' }}>
                        {sq.avg_reply_rate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
