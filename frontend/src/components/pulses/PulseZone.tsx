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

/* ── Constants ──────────────────────────────────────────────────────────────── */

const FREQ_OPTIONS = [
  { value: 'monthly',   label: 'Monthly',   sub: 'Every 30d' },
  { value: 'bimonthly', label: 'Bimonthly', sub: 'Every 60d' },
  { value: 'quarterly', label: 'Quarterly', sub: 'Every 90d' },
  { value: 'custom',    label: 'Custom',    sub: 'Set days'  },
];

const TEMPLATE_OPTIONS = [
  { value: 'full_review',   title: 'Full Review',    desc: 'Snapshot summary, gaps, goals progress, AUM update' },
  { value: 'quick_checkin', title: 'Quick Check-in', desc: 'Life changes, sentiment, 1 key topic only' },
  { value: 'annual_review', title: 'Annual Review',  desc: 'Deep dive: all goals, policy audit, tax planning' },
  { value: 'gap_followup',  title: 'Gap Follow-up',  desc: 'Focused on specific identified gap — targeted' },
];

/* ── Config Form ────────────────────────────────────────────────────────────── */

interface ConfigFormProps {
  clientId:  number;
  config:    PulseConfig | null;
  onSaved:   () => void;
  onCancel?: () => void;
}

function ConfigForm({ clientId, config, onSaved, onCancel }: ConfigFormProps) {
  const { showToast } = useToast();

  const [frequency,    setFrequency]    = useState(config?.frequency      ?? 'monthly');
  const [customDays,   setCustomDays]   = useState(String(config?.custom_days ?? ''));
  const [template,     setTemplate]     = useState(config?.template       ?? 'full_review');
  const [preferredDay, setPreferredDay] = useState(config?.preferred_day  ?? 'wednesday');
  const [preferredTime,setPreferredTime]= useState(config?.preferred_time ?? 'afternoon');
  const [medium,       setMedium]       = useState(config?.medium         ?? 'google_meet');
  const [autoSchedule, setAutoSchedule] = useState(config?.jtd_auto_schedule  ?? true);
  const [autoBrief,    setAutoBrief]    = useState(config?.vani_auto_brief     ?? true);
  const [includeGaps,  setIncludeGaps]  = useState(config?.vani_include_gaps   ?? true);
  const [reminder,     setReminder]     = useState(config?.client_reminder     ?? false);

  const { mutate: upsert, isPending } = useUpsertPulseConfig(
    () => { showToast({ message: config ? 'Pulse config saved' : 'Pulse configured', type: 'success' }); onSaved(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleSave() {
    upsert({
      client_id:         clientId,
      frequency,
      ...(frequency === 'custom' && customDays ? { custom_days: Number(customDays) } : {}),
      template,
      preferred_day:     preferredDay,
      preferred_time:    preferredTime,
      medium,
      jtd_auto_schedule: autoSchedule,
      vani_auto_brief:   autoBrief,
      vani_include_gaps: includeGaps,
      client_reminder:   reminder,
    } as Record<string, unknown>);
  }

  return (
    <div className={s.configForm}>
      <div className={s.configLayout}>

        {/* ── LEFT: Frequency + Template ── */}
        <div className={s.configLeft}>

          {/* Frequency */}
          <div className={s.configSection}>
            <div className={s.configSectionLabel}>PULSE FREQUENCY</div>
            <div className={s.freqGrid}>
              {FREQ_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`${s.freqCard} ${frequency === opt.value ? s.freqCardActive : ''}`}
                  onClick={() => setFrequency(opt.value)}
                >
                  <div className={s.freqCardName}>{opt.label}</div>
                  <div className={s.freqCardSub}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {frequency === 'custom' && (
              <input
                className={s.customDaysInput}
                type="number" min="7" max="365"
                value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                placeholder="Number of days (e.g. 45)"
              />
            )}
          </div>

          {/* Template */}
          <div className={s.configSection}>
            <div className={s.configSectionLabel}>REPORT TEMPLATE</div>
            <div className={s.templateGrid}>
              {TEMPLATE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`${s.templateCard} ${template === opt.value ? s.templateCardActive : ''}`}
                  onClick={() => setTemplate(opt.value)}
                >
                  <div className={s.templateCardTitle}>{opt.title}</div>
                  <div className={s.templateCardDesc}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Appointment + VaNi ── */}
        <div className={s.configRight}>

          {/* JTD Appointment */}
          <div className={s.configSection}>
            <div className={s.configSectionLabel}>APPOINTMENT (JTD)</div>

            <div className={s.autoScheduleCard}>
              <div className={s.autoScheduleIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <div className={s.autoScheduleInfo}>
                <div className={s.autoScheduleTitle}>Auto-schedule next pulse</div>
                <div className={s.autoScheduleSub}>JTD will create appointment on completion</div>
              </div>
              <div
                className={`${s.toggle} ${autoSchedule ? s.toggleOn : ''}`}
                onClick={() => setAutoSchedule(v => !v)}
                role="switch" aria-checked={autoSchedule}
              >
                <div className={s.toggleThumb} />
              </div>
            </div>

            <div className={s.apptFields}>
              <div className={s.apptField}>
                <label className={s.apptLabel}>Preferred Day</label>
                <select className={s.apptSelect} value={preferredDay} onChange={e => setPreferredDay(e.target.value)}>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                </select>
              </div>
              <div className={s.apptField}>
                <label className={s.apptLabel}>Preferred Time</label>
                <select className={s.apptSelect} value={preferredTime} onChange={e => setPreferredTime(e.target.value)}>
                  <option value="morning">Morning (9–12)</option>
                  <option value="afternoon">Afternoon (2–5)</option>
                  <option value="evening">Evening (6–8)</option>
                </select>
              </div>
              <div className={s.apptField}>
                <label className={s.apptLabel}>Medium</label>
                <select className={s.apptSelect} value={medium} onChange={e => setMedium(e.target.value)}>
                  <option value="phone">Phone</option>
                  <option value="google_meet">Google Meet</option>
                  <option value="in_person">In Person</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>
          </div>

          {/* VaNi Prep Options */}
          <div className={s.configSection}>
            <div className={s.configSectionLabel}>VANI PREP OPTIONS</div>
            <div className={s.vaniOptions}>
              {[
                { label: 'Auto-generate pre-meeting brief',  value: autoBrief,   set: setAutoBrief },
                { label: 'Include gap analysis',            value: includeGaps,  set: setIncludeGaps },
                { label: 'Send reminder to client 24h before', value: reminder,  set: setReminder },
              ].map(opt => (
                <div key={opt.label} className={s.vaniToggleRow}>
                  <span className={s.vaniToggleLabel}>{opt.label}</span>
                  <div
                    className={`${s.toggle} ${opt.value ? s.toggleOn : ''}`}
                    onClick={() => opt.set((v: boolean) => !v)}
                    role="switch"
                    aria-checked={opt.value}
                  >
                    <div className={s.toggleThumb} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={s.configActions}>
        {onCancel && <VdfButton variant="ghost" size="sm" onClick={onCancel}>Cancel</VdfButton>}
        <VdfButton variant="primary" size="sm" loading={isPending} onClick={handleSave}>
          {config ? 'Save Config' : 'Save & Prepare Pulse →'}
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

export function PulseZone({ clientId }: PulseZoneProps) {
  const [editingConfig, setEditingConfig] = useState(false);

  const { data: configData, isLoading: configLoading, refetch: refetchConfig } =
    usePulseConfig(clientId);

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } =
    useClientPulseHistory(clientId, { limit: 20 });

  const config: PulseConfig | null   = configData?.data?.config ?? null;
  const sessions: PulseHistoryItem[] = historyData?.data?.sessions ?? [];

  const currentSession: PulseHistoryItem | null = (() => {
    if (sessions.length === 0) return null;
    const active = sessions.find(s =>
      ['scheduled', 'prep_ready', 'in_progress', 'missed'].includes(s.status)
    );
    return active ?? sessions[0];
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

  /* No config yet OR editing — show full-width config form */
  if (!config || editingConfig) {
    return (
      <ConfigForm
        clientId={clientId}
        config={config}
        onSaved={onRefresh}
        onCancel={config ? () => setEditingConfig(false) : undefined}
      />
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
