'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfDrawer } from '@/components/vdf';
import s from '../campaign-detail.module.css';
import f from '@/styles/forms.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Channel {
  id: number;
  channel_type: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  total_sent: number;
  total_replies: number;
  last_tested_at: string | null;
  created_at: string;
}

const CHANNEL_META: Record<string, { icon: string; accent: string; label: string }> = {
  email:    { icon: '📧', accent: 'var(--color-info)',    label: 'Email' },
  whatsapp: { icon: '💬', accent: 'var(--color-success)', label: 'WhatsApp' },
  linkedin: { icon: '🔗', accent: 'var(--color-primary)', label: 'LinkedIn' },
};

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  connected:    { label: 'Connected',    variant: 'success' },
  pending:      { label: 'Pending',      variant: 'warning' },
  disconnected: { label: 'Disconnected', variant: 'muted' },
  error:        { label: 'Error',        variant: 'danger' },
};

const CHANNEL_TYPES = [
  { value: 'email',    label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'linkedin', label: 'LinkedIn' },
];

/* ── Component ───────────────────────────────────────── */

export function ChannelsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chType, setChType]         = useState('email');
  const [chName, setChName]         = useState('');

  const { data, isLoading } = useSkillQuery<{ channels: Channel[] }>(
    'channel-skill', 'get_channels', {}
  );

  const { mutate: createChannel, isPending: creating } = useSkillMutation(
    'channel-skill', 'create_channel',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'channel-skill'] });
        showToast({ message: 'Channel added.', type: 'success' });
        setDrawerOpen(false);
      },
      onError: (err) => showToast({ message: err.message || 'Failed', type: 'error' }),
    }
  );

  const { mutate: testChannel } = useSkillMutation(
    'channel-skill', 'test_channel',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'channel-skill'] });
        showToast({ message: 'Test complete.', type: 'success' });
      },
      onError: (err) => showToast({ message: err.message || 'Test failed', type: 'error' }),
    }
  );

  const { mutate: deleteChannel } = useSkillMutation(
    'channel-skill', 'delete_channel',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'channel-skill'] });
        showToast({ message: 'Channel removed.', type: 'success' });
      },
      onError: (err) => showToast({ message: err.message || 'Failed', type: 'error' }),
    }
  );

  function openDrawer() {
    setChType('email'); setChName('');
    setDrawerOpen(true);
  }

  function handleCreate() {
    if (!chName.trim()) { showToast({ message: 'Channel name is required', type: 'error' }); return; }
    createChannel({ channel_type: chType, name: chName.trim() });
  }

  const channels = data?.data?.channels ?? [];

  if (isLoading) return <VdfLoader message="Loading channels…" />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <VdfButton variant="primary" size="sm" onClick={openDrawer}>+ Add Channel</VdfButton>
      </div>

      {channels.length === 0 ? (
        <VdfEmptyState
          title="No channels configured"
          description="Connect your email, WhatsApp, or LinkedIn to start outreach."
          action={<VdfButton variant="primary" size="sm" onClick={openDrawer}>+ Add Channel</VdfButton>}
        />
      ) : (
        <div className={s.channelGrid}>
          {channels.map((ch) => {
            const meta = CHANNEL_META[ch.channel_type] ?? CHANNEL_META.email;
            const badge = STATUS_MAP[ch.status] ?? STATUS_MAP.pending;
            const replyRate = ch.total_sent > 0 ? ((ch.total_replies / ch.total_sent) * 100).toFixed(1) : '0';
            return (
              <div key={ch.id} className={s.channelCard} style={{ borderTopColor: meta.accent }}>
                <div className={s.channelCardHeader}>
                  <span style={{ fontSize: '1.6rem' }}>{meta.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div className={s.channelCardTitle}>{ch.name}</div>
                    <div className={s.channelCardType}>{meta.label}</div>
                  </div>
                  <VdfStatusBadge label={badge.label} variant={badge.variant} />
                </div>

                <div className={s.channelStats}>
                  <div className={s.channelStat}>
                    <span className={s.channelStatValue}>{ch.total_sent}</span>
                    <span className={s.channelStatLabel}>Sent</span>
                  </div>
                  <div className={s.channelStat}>
                    <span className={s.channelStatValue}>{ch.total_replies}</span>
                    <span className={s.channelStatLabel}>Replies</span>
                  </div>
                  <div className={s.channelStat}>
                    <span className={s.channelStatValue}>{replyRate}%</span>
                    <span className={s.channelStatLabel}>Reply Rate</span>
                  </div>
                </div>

                <div className={s.channelCardActions}>
                  <VdfButton variant="ghost" size="sm" onClick={() => testChannel({ channel_id: ch.id, success: true })}>
                    Test
                  </VdfButton>
                  <VdfButton variant="ghost" size="sm" onClick={() => deleteChannel({ channel_id: ch.id })}>
                    Remove
                  </VdfButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <VdfDrawer
        isOpen={drawerOpen} onClose={() => setDrawerOpen(false)}
        title="Add Channel" width={420}
        footer={
          <>
            <VdfButton variant="ghost" size="sm" onClick={() => setDrawerOpen(false)} disabled={creating}>Cancel</VdfButton>
            <VdfButton variant="primary" size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? 'Adding…' : 'Add Channel'}
            </VdfButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={s.fieldGroup}>
            <label className={f.label}>Channel Type</label>
            <select className={f.select} value={chType} onChange={e => setChType(e.target.value)}>
              {CHANNEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className={s.fieldGroup}>
            <label className={f.label}>Name *</label>
            <input className={f.input} value={chName} onChange={e => setChName(e.target.value)} placeholder="e.g. Primary Email, Sales WhatsApp" />
          </div>
        </div>
      </VdfDrawer>
    </>
  );
}
