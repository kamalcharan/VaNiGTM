'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillMutation } from '@/hooks/useSkill';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/components/toast';
import { VdfPageHeader, VdfButton, VdfModal } from '@/components/vdf';
import s from './demo-data.module.css';

/* ── What gets created ───────────────────────────────── */

const SEED_ITEMS = [
  { icon: '🎯', count: 3,  label: 'GTM Campaigns (1 draft, 2 active)' },
  { icon: '👤', count: 8,  label: 'ICP Personas with buying signals' },
  { icon: '📧', count: 3,  label: 'Channels (Email, WhatsApp, LinkedIn)' },
  { icon: '🔄', count: 4,  label: 'Outreach Sequences with steps' },
  { icon: '📝', count: 12, label: 'Message Templates (with A/B variants)' },
  { icon: '👥', count: 25, label: 'Contacts assigned to pipeline' },
  { icon: '🤖', count: 20, label: 'Agent Decision Runs' },
  { icon: '📡', count: 50, label: 'Activity Feed Events' },
  { icon: '📊', count: 28, label: 'Daily Metric Snapshots (14 days x 2)' },
];

/* ── Component ───────────────────────────────────────── */

export default function DemoDataPage() {
  const { isLive } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [confirmClear, setConfirmClear] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);

  const { mutate: seedData, isPending: seeding } = useSkillMutation(
    'campaign-skill', 'seed_demo_data',
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        const msg = data?.data?.message ?? 'Demo data created successfully.';
        setResult({ type: 'success', title: 'Demo data seeded', message: msg });
        showToast({ message: 'Demo data created!', type: 'success' });
      },
      onError: (err) => {
        setResult({ type: 'error', title: 'Seed failed', message: err.message || 'Unknown error' });
        showToast({ message: err.message || 'Failed to seed data', type: 'error' });
      },
    }
  );

  const { mutate: clearData, isPending: clearing } = useSkillMutation(
    'campaign-skill', 'clear_demo_data',
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        const msg = data?.data?.message ?? 'Demo data cleared.';
        setResult({ type: 'success', title: 'Data cleared', message: msg });
        showToast({ message: 'GTM data cleared.', type: 'success' });
        setConfirmClear(false);
      },
      onError: (err) => {
        setResult({ type: 'error', title: 'Clear failed', message: err.message || 'Unknown error' });
        showToast({ message: err.message || 'Failed to clear data', type: 'error' });
        setConfirmClear(false);
      },
    }
  );

  const isTest = !isLive;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="SYSTEM"
        title="Demo Data"
        meta={
          <span style={{
            fontSize: '0.7rem', fontWeight: 600, fontFamily: 'var(--font-mono)',
            padding: '3px 8px', borderRadius: 4,
            background: isTest
              ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
              : 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: isTest ? 'var(--color-success)' : 'var(--color-danger)',
          }}>
            {isTest ? 'TEST MODE' : 'LIVE MODE'}
          </span>
        }
      />

      <div className={s.body}>

        {/* ── Environment banner ───────────────────────── */}
        {isTest ? (
          <div className={s.envBannerTest}>
            <span className={s.envIcon}>🧪</span>
            <div className={s.envText}>
              <div className={s.envTitle} style={{ color: 'var(--color-success)' }}>Test Environment — Safe to seed</div>
              <div className={s.envDesc}>
                Demo data will be created in the sandbox environment. Your live client data is not affected.
                You can seed, test, and clear as many times as you like.
              </div>
            </div>
          </div>
        ) : (
          <div className={s.envBannerLive}>
            <span className={s.envIcon}>⛔</span>
            <div className={s.envText}>
              <div className={s.envTitle} style={{ color: 'var(--color-danger)' }}>Live Environment — Seeding disabled</div>
              <div className={s.envDesc}>
                Switch to <strong>Test mode</strong> from the sidebar to create demo data.
                Demo data is never written to the live environment.
              </div>
            </div>
          </div>
        )}

        {/* ── What gets created ────────────────────────── */}
        <div>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-fg)', marginBottom: 10 }}>
            What gets created
          </h3>
          <div className={s.dataList}>
            {SEED_ITEMS.map((item) => (
              <div key={item.label} className={s.dataItem}>
                <span className={s.dataItemIcon}>{item.icon}</span>
                <span className={s.dataItemCount}>{item.count}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────── */}
        <div className={s.actions}>
          <VdfButton
            variant="primary"
            size="md"
            onClick={() => seedData({})}
            disabled={!isTest || seeding || clearing}
          >
            {seeding ? 'Creating demo data…' : 'Create Demo Data'}
          </VdfButton>

          <VdfButton
            variant="ghost"
            size="md"
            onClick={() => setConfirmClear(true)}
            disabled={!isTest || seeding || clearing}
          >
            {clearing ? 'Clearing…' : 'Clear All GTM Data'}
          </VdfButton>
        </div>

        {/* ── Result ───────────────────────────────────── */}
        {result && (
          <div className={result.type === 'success' ? s.resultSuccess : s.resultError}>
            <div className={s.resultTitle}>{result.title}</div>
            <div className={s.resultMessage}>{result.message}</div>
          </div>
        )}

        {/* ── Preview cards (after successful seed) ────── */}
        {result?.type === 'success' && result.title === 'Demo data seeded' && (
          <div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-fg)', marginBottom: 10 }}>
              Where to check
            </h3>
            <div className={s.previewGrid}>
              <a href="/campaigns" className={s.previewCard} style={{ textDecoration: 'none' }}>
                <div className={s.previewValue}>🎯</div>
                <div className={s.previewLabel}>Campaigns</div>
              </a>
              <a href="/war-room" className={s.previewCard} style={{ textDecoration: 'none' }}>
                <div className={s.previewValue}>📡</div>
                <div className={s.previewLabel}>War Room</div>
              </a>
              <a href="/war-room/agent-runs" className={s.previewCard} style={{ textDecoration: 'none' }}>
                <div className={s.previewValue}>🤖</div>
                <div className={s.previewLabel}>Agent Runs</div>
              </a>
              <a href="/war-room/analytics" className={s.previewCard} style={{ textDecoration: 'none' }}>
                <div className={s.previewValue}>📊</div>
                <div className={s.previewLabel}>Analytics</div>
              </a>
              <a href="/contacts" className={s.previewCard} style={{ textDecoration: 'none' }}>
                <div className={s.previewValue}>👥</div>
                <div className={s.previewLabel}>Contacts</div>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ── Confirm clear modal ────────────────────────── */}
      <VdfModal
        isOpen={confirmClear}
        onClose={() => { if (!clearing) setConfirmClear(false); }}
        title="Clear All GTM Data"
        subtitle="This will remove all campaigns, sequences, channels, assignments, agent runs, and analytics from the test environment."
        width="sm"
        footer={
          <>
            <VdfButton variant="ghost" size="sm" onClick={() => setConfirmClear(false)} disabled={clearing}>
              Cancel
            </VdfButton>
            <VdfButton variant="primary" size="sm" onClick={() => clearData({})} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Yes, Clear Everything'}
            </VdfButton>
          </>
        }
      >
        <div style={{ fontSize: '0.82rem', color: 'var(--color-muted)', lineHeight: 1.6 }}>
          <p>This action will delete all rows from the following tables in your <strong>test environment</strong>:</p>
          <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
            <li>gt_campaigns, gt_personas, gt_persona_signals</li>
            <li>gt_channels, gt_sequences, gt_sequence_steps, gt_step_templates</li>
            <li>gt_contact_assignments, gt_stage_log</li>
            <li>gt_agent_runs, gt_campaign_metrics, gt_activity_feed</li>
          </ul>
          <p>Your <strong>contacts</strong> (ki_contacts) will not be deleted. Your <strong>live data</strong> is not affected.</p>
        </div>
      </VdfModal>
    </div>
  );
}
