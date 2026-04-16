'use client';

import { useState } from 'react';
import { VdfButton } from '@/components/vdf';
import { useToast } from '@/components/toast';
import {
  usePulseConfig,
  useClientPulseHistory,
  useUpsertPulseConfig,
  type PulseConfig,
  type PulseHistoryItem,
} from '@/hooks/usePulses';
import { PulseSessionCard } from './PulseSessionCard';
import { PulseHistoryTimeline } from './PulseHistoryTimeline';
import s from './PulseZone.module.css';

/* ── Config Edit Panel ──────────────────────────────────────────────────────── */

interface ConfigEditProps {
  clientId: number;
  config:   PulseConfig | null;
  onSaved:  () => void;
  onCancel: () => void;
}

function ConfigEditPanel({ clientId, config, onSaved, onCancel }: ConfigEditProps) {
  const { showToast } = useToast();
  const [frequency,  setFrequency]  = useState(config?.frequency  ?? 'monthly');
  const [customDays, setCustomDays] = useState(String(config?.custom_days ?? ''));
  const [template,   setTemplate]   = useState(config?.template   ?? 'full_review');
  const [medium,     setMedium]     = useState(config?.medium     ?? 'phone');
  const [autoSchedule, setAutoSchedule] = useState(config?.jtd_auto_schedule ?? false);
  const [autoBrief,    setAutoBrief]    = useState(config?.vani_auto_brief   ?? true);

  const { mutate: upsert, isPending } = useUpsertPulseConfig(
    () => { showToast({ message: 'Pulse config saved', type: 'success' }); onSaved(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleSave() {
    upsert({
      client_id:          clientId,
      frequency,
      ...(frequency === 'custom' && customDays ? { custom_days: Number(customDays) } : {}),
      template,
      medium,
      jtd_auto_schedule:  autoSchedule,
      vani_auto_brief:    autoBrief,
    } as Record<string, unknown>);
  }

  return (
    <div className={s.editPanel}>
      <div className={s.editPanelTitle}>
        {config ? 'Edit Pulse Setup' : 'Configure Pulse'}
      </div>

      <div className={s.editGrid}>
        <div className={s.editField}>
          <label className={s.editLabel}>Frequency</label>
          <select className={s.editSelect} value={frequency} onChange={e => setFrequency(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="bimonthly">Every 2 Months</option>
            <option value="quarterly">Quarterly</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {frequency === 'custom' && (
          <div className={s.editField}>
            <label className={s.editLabel}>Every (days)</label>
            <input className={s.editInput} type="number" min="7" max="365"
              value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="45" />
          </div>
        )}

        <div className={s.editField}>
          <label className={s.editLabel}>Template</label>
          <select className={s.editSelect} value={template} onChange={e => setTemplate(e.target.value)}>
            <option value="full_review">Full Review</option>
            <option value="quick_checkin">Quick Check-in</option>
            <option value="annual_review">Annual Review</option>
            <option value="gap_followup">Gap Follow-up</option>
          </select>
        </div>

        <div className={s.editField}>
          <label className={s.editLabel}>Meeting Medium</label>
          <select className={s.editSelect} value={medium} onChange={e => setMedium(e.target.value)}>
            <option value="phone">Phone Call</option>
            <option value="google_meet">Google Meet</option>
            <option value="in_person">In Person</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>

      <div className={s.editToggles}>
        <label className={s.toggleRow}>
          <div className={s.toggleInfo}>
            <div className={s.toggleTitle}>Auto-schedule next session</div>
            <div className={s.toggleSub}>JTD will suggest next session after completion</div>
          </div>
          <div className={`${s.toggle} ${autoSchedule ? s.toggleOn : ''}`}
            onClick={() => setAutoSchedule(v => !v)} role="switch" aria-checked={autoSchedule}>
            <div className={s.toggleThumb} />
          </div>
        </label>
        <label className={s.toggleRow}>
          <div className={s.toggleInfo}>
            <div className={s.toggleTitle}>VaNi auto-brief</div>
            <div className={s.toggleSub}>Generate a prep brief before each session</div>
          </div>
          <div className={`${s.toggle} ${autoBrief ? s.toggleOn : ''}`}
            onClick={() => setAutoBrief(v => !v)} role="switch" aria-checked={autoBrief}>
            <div className={s.toggleThumb} />
          </div>
        </label>
      </div>

      <div className={s.editActions}>
        <VdfButton variant="ghost" size="sm" onClick={onCancel}>Cancel</VdfButton>
        <VdfButton variant="primary" size="sm" loading={isPending} onClick={handleSave}>
          Save Config
        </VdfButton>
      </div>
    </div>
  );
}

/* ── PulseZone ──────────────────────────────────────────────────────────────── */

export interface PulseZoneProps {
  clientId:    number;
  clientName?: string;
}

export function PulseZone({ clientId, clientName }: PulseZoneProps) {
  const [editingConfig, setEditingConfig] = useState(false);

  const { data: configData, isLoading: configLoading, refetch: refetchConfig } =
    usePulseConfig(clientId);

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } =
    useClientPulseHistory(clientId, { limit: 20 });

  const config: PulseConfig | null  = configData?.data?.config ?? null;
  const sessions: PulseHistoryItem[] = historyData?.data?.sessions ?? [];

  const currentSession: PulseHistoryItem | null = (() => {
    if (sessions.length === 0) return null;
    const active = sessions.find(s =>
      ['scheduled', 'prep_ready', 'in_progress', 'missed'].includes(s.status)
    );
    if (active) return active;
    return sessions[0]; // most recent completed
  })();

  function onRefresh() {
    void refetchConfig();
    void refetchHistory();
    setEditingConfig(false);
  }

  if (configLoading) {
    return (
      <div className={s.zone}>
        <div className={s.skeletonMain} />
        <div className={s.skeletonSide} />
      </div>
    );
  }

  if (editingConfig) {
    return (
      <div className={s.zone}>
        <div className={s.mainCol}>
          <ConfigEditPanel
            clientId={clientId}
            config={config}
            onSaved={onRefresh}
            onCancel={() => setEditingConfig(false)}
          />
        </div>
        <div className={s.sideCol}>
          <PulseHistoryTimeline sessions={sessions} isLoading={historyLoading} />
        </div>
      </div>
    );
  }

  return (
    <div className={s.zone}>
      <div className={s.mainCol}>
        <div className={s.sectionEyebrow}>Active Session</div>
        <PulseSessionCard
          clientId={clientId}
          config={config}
          session={currentSession}
          onRefresh={onRefresh}
          onEditConfig={() => setEditingConfig(true)}
        />
      </div>

      <div className={s.sideCol}>
        <div className={s.sectionEyebrow}>Session History</div>
        <PulseHistoryTimeline sessions={sessions} isLoading={historyLoading} />
      </div>
    </div>
  );
}
