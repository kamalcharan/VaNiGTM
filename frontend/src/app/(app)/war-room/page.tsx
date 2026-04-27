'use client';

import { useSkillQuery } from '@/hooks/useSkill';
import { VdfLoader, VdfPageHeader } from '@/components/vdf';
import s from './war-room.module.css';

/* ── Types ───────────────────────────────────────────── */

interface DashboardStats {
  total_contacts: number;
  total_engaged: number;
  reply_rate_pct: number;
  meetings_booked: number;
  active_campaigns: number;
  active_sequences: number;
  recent_agent_runs: number;
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

interface FeedEvent {
  id: number;
  event_type: string;
  summary: string;
  created_at: string;
}

const EVENT_ICONS: Record<string, string> = {
  email_sent: '📧', email_opened: '👁', email_replied: '💬', email_clicked: '🔗', email_bounced: '❌',
  whatsapp_sent: '💬', whatsapp_replied: '✅',
  linkedin_sent: '🔗', linkedin_replied: '🤝', linkedin_visit: '👀',
  stage_change: '📈', score_change: '🎯',
  agent_action: '🤖', meeting_booked: '📅',
  contact_assigned: '👤', sequence_started: '▶', sequence_completed: '✔',
};

const CHANNEL_ICONS: Record<string, string> = { email: '📧', whatsapp: '💬', linkedin: '🔗' };

/* ── Component ───────────────────────────────────────── */

export default function WarRoomPage() {
  const { data: statsData, isLoading: loadingStats } = useSkillQuery<DashboardStats>(
    'gtm-analytics-skill', 'get_dashboard_stats', {}
  );
  const { data: channelData } = useSkillQuery<{ channels: ChannelPerf[] }>(
    'gtm-analytics-skill', 'get_channel_performance', {}
  );
  const { data: funnelData } = useSkillQuery<{ stages: FunnelStage[]; total: number }>(
    'gtm-analytics-skill', 'get_conversion_funnel', {}
  );
  const { data: feedData } = useSkillQuery<{ events: FeedEvent[] }>(
    'gtm-analytics-skill', 'get_activity_feed', { limit: 30 }
  );

  if (loadingStats) return <VdfLoader overlay message="Loading war room…" />;

  const stats    = statsData?.data ?? {} as DashboardStats;
  const channels = channelData?.data?.channels ?? [];
  const funnel   = funnelData?.data?.stages ?? [];
  const maxCount = Math.max(...funnel.map(f => f.count), 1);
  const feed     = feedData?.data?.events ?? [];

  return (
    <div className={s.page}>
      <VdfPageHeader eyebrow="MISSION CONTROL" title="War Room" />

      {/* ── KPI row ────────────────────────────────────── */}
      <div className={s.kpiRow}>
        {[
          { label: 'Total Contacts',    value: stats.total_contacts ?? 0 },
          { label: 'Engaged',           value: stats.total_engaged ?? 0 },
          { label: 'Reply Rate',         value: `${stats.reply_rate_pct ?? 0}%` },
          { label: 'Meetings Booked',    value: stats.meetings_booked ?? 0 },
          { label: 'Active Campaigns',   value: stats.active_campaigns ?? 0 },
          { label: 'Live Sequences',     value: stats.active_sequences ?? 0 },
          { label: 'Agent Runs (24h)',   value: stats.recent_agent_runs ?? 0 },
        ].map((kpi) => (
          <div key={kpi.label} className={s.kpiCard}>
            <span className={s.kpiValue}>{kpi.value}</span>
            <span className={s.kpiLabel}>{kpi.label}</span>
          </div>
        ))}
      </div>

      {/* ── Dashboard grid ─────────────────────────────── */}
      <div className={s.dashGrid}>

        {/* Pipeline funnel */}
        <div className={s.panel}>
          <div className={s.panelTitle}>Pipeline Funnel</div>
          <div className={s.funnelBars}>
            {funnel.map((stage) => (
              <div key={stage.stage} className={s.funnelBar}>
                <span className={s.funnelBarLabel}>{stage.stage}</span>
                <div className={s.funnelBarTrack}>
                  <div className={s.funnelBarFill} style={{ width: `${Math.max((stage.count / maxCount) * 100, 2)}%` }} />
                </div>
                <span className={s.funnelBarCount}>{stage.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Channel performance */}
        <div className={s.panel}>
          <div className={s.panelTitle}>Channel Performance</div>
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

        {/* Activity feed */}
        <div className={s.panel}>
          <div className={s.panelTitle}>Live Activity</div>
          <div className={s.feedList}>
            {feed.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', padding: '12px 0' }}>No activity yet</div>
            ) : feed.map((evt) => (
              <div key={evt.id} className={s.feedItem}>
                <div className={s.feedIcon}>{EVENT_ICONS[evt.event_type] ?? '📌'}</div>
                <div className={s.feedBody}>
                  <div className={s.feedText}>{evt.summary}</div>
                  <div className={s.feedTime}>
                    {new Date(evt.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
