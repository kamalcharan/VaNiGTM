'use client';

import { useState } from 'react';
import {
  usePulseConfig,
  useUpsertPulseConfig,
  useCreatePulseSession,
  type PulseConfig,
} from '@/hooks/usePulses';
import { VdfButton } from '@/components/vdf';
import { useToast } from '@/components/toast';
import s from './PulseConfigCard.module.css';

const FREQ_LABEL: Record<string, string> = {
  monthly:   'Monthly',
  bimonthly: 'Every 2 Months',
  quarterly: 'Quarterly',
  custom:    'Custom',
};

const TEMPLATE_LABEL: Record<string, string> = {
  full_review:   'Full Review',
  quick_checkin: 'Quick Check-in',
  annual_review: 'Annual Review',
  gap_followup:  'Gap Follow-up',
};

const MEDIUM_LABEL: Record<string, string> = {
  phone:       'Phone Call',
  google_meet: 'Google Meet',
  in_person:   'In Person',
  whatsapp:    'WhatsApp',
};

interface Props {
  clientId: number;
}

export function PulseConfigCard({ clientId }: Props) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = usePulseConfig(clientId);
  const config: PulseConfig | null = data?.data?.config ?? null;

  const [frequency,   setFrequency]   = useState('monthly');
  const [customDays,  setCustomDays]  = useState('');
  const [template,    setTemplate]    = useState('full_review');
  const [medium,      setMedium]      = useState('phone');

  const { mutate: upsert, isPending: isSaving } = useUpsertPulseConfig(
    () => { setEditing(false); showToast({ message: 'Pulse setup saved', type: 'success' }); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  const { mutate: createSession, isPending: isScheduling } = useCreatePulseSession(
    () => showToast({ message: 'Session scheduled', type: 'success' }),
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function startEdit() {
    setFrequency(config?.frequency ?? 'monthly');
    setCustomDays(String(config?.custom_days ?? ''));
    setTemplate(config?.template ?? 'full_review');
    setMedium(config?.medium ?? 'phone');
    setEditing(true);
  }

  function handleSave() {
    upsert({
      client_id:   clientId,
      frequency,
      ...(frequency === 'custom' && customDays ? { custom_days: Number(customDays) } : {}),
      template,
      medium,
    } as Record<string, unknown>);
  }

  function handleScheduleNow() {
    if (!config) return;
    const at = new Date();
    at.setHours(at.getHours() + 1, 0, 0, 0);
    createSession({
      client_id:    clientId,
      config_id:    config.id,
      scheduled_at: at.toISOString(),
      template:     config.template,
      medium:       config.medium,
    } as Record<string, unknown>);
  }

  if (isLoading) return <div className={s.skeleton} />;

  if (!config && !editing) {
    return (
      <div className={s.setupCard}>
        <div className={s.setupIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div className={s.setupBody}>
          <div className={s.setupTitle}>No Pulse Configured</div>
          <div className={s.setupDesc}>Set up a recurring meeting schedule for this client.</div>
        </div>
        <VdfButton variant="primary" size="sm" onClick={startEdit}>Set Up Pulse</VdfButton>
      </div>
    );
  }

  if (editing) {
    return (
      <div className={s.editCard}>
        <div className={s.editTitle}>{config ? 'Edit Pulse Setup' : 'New Pulse Setup'}</div>
        <div className={s.editGrid}>
          <div className={s.editField}>
            <label className={s.label}>Frequency</label>
            <select className={s.select} value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="bimonthly">Every 2 Months</option>
              <option value="quarterly">Quarterly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {frequency === 'custom' && (
            <div className={s.editField}>
              <label className={s.label}>Every (days)</label>
              <input
                className={s.input}
                type="number"
                min="7"
                max="365"
                value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                placeholder="45"
              />
            </div>
          )}
          <div className={s.editField}>
            <label className={s.label}>Template</label>
            <select className={s.select} value={template} onChange={e => setTemplate(e.target.value)}>
              <option value="full_review">Full Review</option>
              <option value="quick_checkin">Quick Check-in</option>
              <option value="annual_review">Annual Review</option>
              <option value="gap_followup">Gap Follow-up</option>
            </select>
          </div>
          <div className={s.editField}>
            <label className={s.label}>Meeting Medium</label>
            <select className={s.select} value={medium} onChange={e => setMedium(e.target.value)}>
              <option value="phone">Phone Call</option>
              <option value="google_meet">Google Meet</option>
              <option value="in_person">In Person</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
        </div>
        <div className={s.editActions}>
          <VdfButton variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</VdfButton>
          <VdfButton variant="primary" size="sm" loading={isSaving} onClick={handleSave}>Save Setup</VdfButton>
        </div>
      </div>
    );
  }

  return (
    <div className={s.configCard}>
      <div className={s.configRow}>
        <div className={s.configMeta}>
          <span className={s.configDot} />
          <span className={s.configFreq}>{FREQ_LABEL[config!.frequency] ?? config!.frequency}</span>
          <span className={s.configSep}>·</span>
          <span className={s.configDetail}>{TEMPLATE_LABEL[config!.template] ?? config!.template}</span>
          <span className={s.configSep}>·</span>
          <span className={s.configDetail}>{MEDIUM_LABEL[config!.medium] ?? config!.medium}</span>
        </div>
        <div className={s.configActions}>
          <VdfButton variant="ghost" size="xs" onClick={startEdit}>Edit</VdfButton>
          <VdfButton variant="outline" size="xs" loading={isScheduling} onClick={handleScheduleNow}>
            + Session
          </VdfButton>
        </div>
      </div>
    </div>
  );
}
