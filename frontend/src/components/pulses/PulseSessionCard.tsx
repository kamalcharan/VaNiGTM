'use client';

import { useState } from 'react';
import { VdfButton } from '@/components/vdf';
import { useToast } from '@/components/toast';
import {
  useUpsertPulseConfig,
  useCreatePulseSession,
  useUpdatePulseSession,
  type PulseConfig,
  type PulseHistoryItem,
} from '@/hooks/usePulses';
import s from './PulseSessionCard.module.css';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const MEDIUM_LABEL: Record<string, string> = {
  phone: 'Phone Call', google_meet: 'Google Meet',
  in_person: 'In Person', whatsapp: 'WhatsApp',
};
const MEDIUM_ICON: Record<string, string> = {
  phone: '📞', google_meet: '📹', in_person: '🤝', whatsapp: '💬',
};
const TEMPLATE_LABEL: Record<string, string> = {
  full_review: 'Full Review', quick_checkin: 'Quick Check-in',
  annual_review: 'Annual Review', gap_followup: 'Gap Follow-up',
};
const FREQ_LABEL: Record<string, string> = {
  monthly: 'Monthly', bimonthly: 'Every 2 months',
  quarterly: 'Quarterly', custom: 'Custom',
};

/* ── Stepper ────────────────────────────────────────────────────────────────── */

type StepState = 'done' | 'active' | 'upcoming';

interface StepDef { label: string; key: string }
const STEPS: StepDef[] = [
  { label: 'Prep',       key: 'prep' },
  { label: 'In Meeting', key: 'meeting' },
  { label: 'Post',       key: 'post' },
];

function stepStates(status: string): [StepState, StepState, StepState] {
  switch (status) {
    case 'scheduled':  return ['active',   'upcoming', 'upcoming'];
    case 'prep_ready': return ['done',     'active',   'upcoming'];
    case 'in_progress':return ['done',     'active',   'upcoming'];
    case 'completed':  return ['done',     'done',     'done'];
    case 'missed':     return ['upcoming', 'upcoming', 'upcoming'];
    default:           return ['upcoming', 'upcoming', 'upcoming'];
  }
}

function Stepper({ status }: { status: string }) {
  const states = stepStates(status);
  return (
    <div className={s.stepper}>
      {STEPS.map((step, i) => (
        <div key={step.key} className={s.stepItem}>
          <div className={s.stepTop}>
            <div className={`${s.stepBullet} ${s[`step${states[i].charAt(0).toUpperCase()}${states[i].slice(1)}`]}`}>
              {states[i] === 'done' ? (
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`${s.stepConnector} ${states[i] === 'done' ? s.connectorDone : ''}`} />
            )}
          </div>
          <div className={`${s.stepLabel} ${states[i] === 'active' ? s.stepLabelActive : states[i] === 'done' ? s.stepLabelDone : ''}`}>
            {step.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysFromNow(d: string): string {
  const diff = Math.round((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0) return `in ${diff} day${diff !== 1 ? 's' : ''}`;
  return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago`;
}

function elapsedMin(startedAt: string): number {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
}

/* ── No Config state ────────────────────────────────────────────────────────── */

interface NoConfigProps {
  clientId: number;
  onSaved: () => void;
}

function NoConfigState({ clientId, onSaved }: NoConfigProps) {
  const { showToast } = useToast();
  const [frequency, setFrequency] = useState('monthly');
  const [customDays, setCustomDays] = useState('');
  const [template, setTemplate] = useState('full_review');
  const [medium, setMedium] = useState('phone');

  const { mutate: saveConfig, isPending: isSaving } = useUpsertPulseConfig(
    () => { showToast({ message: 'Pulse configured', type: 'success' }); onSaved(); },
    (msg: string) => showToast({ message: msg, type: 'error' }),
  );

  function handleSave() {
    saveConfig({
      client_id: clientId,
      frequency,
      ...(frequency === 'custom' && customDays ? { custom_days: Number(customDays) } : {}),
      template,
      medium,
    } as Record<string, unknown>);
  }

  return (
    <div className={s.stateCard}>
      <div className={s.setupIcon}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="28" height="28">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <div className={s.setupHeading}>Set up Pulse</div>
      <div className={s.setupSub}>Define how often you meet with this client and how you connect.</div>

      <div className={s.configForm}>
        <div className={s.formRow}>
          <div className={s.formField}>
            <label className={s.fieldLabel}>Frequency</label>
            <select className={s.fieldSelect} value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="bimonthly">Every 2 Months</option>
              <option value="quarterly">Quarterly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {frequency === 'custom' && (
            <div className={s.formField}>
              <label className={s.fieldLabel}>Every (days)</label>
              <input className={s.fieldInput} type="number" min="7" max="365"
                value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="45" />
            </div>
          )}
          <div className={s.formField}>
            <label className={s.fieldLabel}>Template</label>
            <select className={s.fieldSelect} value={template} onChange={e => setTemplate(e.target.value)}>
              <option value="full_review">Full Review</option>
              <option value="quick_checkin">Quick Check-in</option>
              <option value="annual_review">Annual Review</option>
              <option value="gap_followup">Gap Follow-up</option>
            </select>
          </div>
          <div className={s.formField}>
            <label className={s.fieldLabel}>Meeting Medium</label>
            <select className={s.fieldSelect} value={medium} onChange={e => setMedium(e.target.value)}>
              <option value="phone">Phone Call</option>
              <option value="google_meet">Google Meet</option>
              <option value="in_person">In Person</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
        </div>
        <div className={s.formActions}>
          <VdfButton variant="primary" size="sm" loading={isSaving} onClick={handleSave}>
            Save & Activate
          </VdfButton>
        </div>
      </div>
    </div>
  );
}

/* ── No Session state ───────────────────────────────────────────────────────── */

interface NoSessionProps {
  clientId: number;
  config: PulseConfig;
  onScheduled: () => void;
  onEditConfig: () => void;
}

function NoSessionState({ clientId, config, onScheduled, onEditConfig }: NoSessionProps) {
  const { showToast } = useToast();
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [time, setTime] = useState('10:00');

  const { mutate: createSession, isPending } = useCreatePulseSession(
    () => { showToast({ message: 'Session scheduled', type: 'success' }); onScheduled(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleSchedule() {
    createSession({
      client_id: clientId,
      config_id: config.id,
      scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
      template: config.template,
      medium: config.medium,
    } as Record<string, unknown>);
  }

  return (
    <div className={s.stateCard}>
      <div className={s.configStrip}>
        <span className={s.configDot} />
        <span className={s.configChip}>{FREQ_LABEL[config.frequency] ?? config.frequency}</span>
        <span className={s.configSep}>·</span>
        <span className={s.configText}>{MEDIUM_ICON[config.medium]} {MEDIUM_LABEL[config.medium] ?? config.medium}</span>
        <button className={s.configEdit} onClick={onEditConfig}>Edit</button>
      </div>

      <div className={s.emptyIcon}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="24" height="24">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <path d="M12 14v4M10 16h4" />
        </svg>
      </div>
      <div className={s.emptyHeading}>Schedule First Session</div>
      <div className={s.emptySub}>No pulse sessions yet. Book the first one.</div>

      <div className={s.scheduleRow}>
        <input className={s.dateInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input className={s.timeInput} type="time" value={time} onChange={e => setTime(e.target.value)} />
        <VdfButton variant="primary" size="sm" loading={isPending} onClick={handleSchedule}>
          Schedule
        </VdfButton>
      </div>
    </div>
  );
}

/* ── Scheduled state ────────────────────────────────────────────────────────── */

interface ScheduledProps {
  session: PulseHistoryItem;
  config: PulseConfig;
  onStartPrep: () => void;
  onReschedule: () => void;
  onEditConfig: () => void;
}

function ScheduledState({ session, config, onStartPrep, onReschedule, onEditConfig }: ScheduledProps) {
  const { showToast } = useToast();
  const { mutate: updateSession, isPending } = useUpdatePulseSession(
    () => { showToast({ message: 'Prep started', type: 'success' }); onStartPrep(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleStartPrep() {
    updateSession({ id: session.id, status: 'prep_ready' } as Record<string, unknown>);
  }

  return (
    <div className={s.stateCard}>
      <div className={s.configStrip}>
        <span className={s.configDot} />
        <span className={s.configChip}>{FREQ_LABEL[config.frequency] ?? config.frequency}</span>
        <span className={s.configSep}>·</span>
        <span className={s.configText}>{MEDIUM_ICON[config.medium]} {MEDIUM_LABEL[config.medium] ?? config.medium}</span>
        <button className={s.configEdit} onClick={onEditConfig}>Edit</button>
      </div>

      <Stepper status="scheduled" />

      <div className={s.sessionMeta}>
        <div className={s.sessionDate}>{fmtDate(session.scheduled_at)}</div>
        <div className={s.sessionAgo}>{daysFromNow(session.scheduled_at)}</div>
        <div className={s.sessionMedium}>
          {MEDIUM_ICON[session.medium]} {MEDIUM_LABEL[session.medium] ?? session.medium}
          {' · '}{TEMPLATE_LABEL[session.template] ?? session.template}
        </div>
      </div>

      <div className={s.stateActions}>
        <VdfButton variant="primary" size="sm" loading={isPending} onClick={handleStartPrep}>
          Start Prep
        </VdfButton>
        <VdfButton variant="ghost" size="sm" onClick={onReschedule}>
          Reschedule
        </VdfButton>
      </div>
    </div>
  );
}

/* ── Prep Ready state ───────────────────────────────────────────────────────── */

interface PrepReadyProps {
  session: PulseHistoryItem;
  config: PulseConfig;
  onStartMeeting: () => void;
  onEditConfig: () => void;
}

function PrepReadyState({ session, config, onStartMeeting, onEditConfig }: PrepReadyProps) {
  const { showToast } = useToast();
  const { mutate: updateSession, isPending } = useUpdatePulseSession(
    () => { showToast({ message: 'Meeting started', type: 'success' }); onStartMeeting(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleStartMeeting() {
    updateSession({ id: session.id, status: 'in_progress', started_at: new Date().toISOString() } as Record<string, unknown>);
  }

  return (
    <div className={s.stateCard}>
      <div className={s.configStrip}>
        <span className={s.configDot} />
        <span className={s.configChip}>{FREQ_LABEL[config.frequency] ?? config.frequency}</span>
        <span className={s.configSep}>·</span>
        <span className={s.configText}>{MEDIUM_ICON[config.medium]} {MEDIUM_LABEL[config.medium] ?? config.medium}</span>
        <button className={s.configEdit} onClick={onEditConfig}>Edit</button>
      </div>

      <Stepper status="prep_ready" />

      <div className={s.sessionMeta}>
        <div className={s.sessionDate}>{fmtDate(session.scheduled_at)}</div>
        <div className={s.sessionAgo}>{daysFromNow(session.scheduled_at)}</div>
      </div>

      {session.vani_brief && (
        <div className={s.vaniBrief}>
          <div className={s.vaniHeader}>
            <span className={s.vaniStar}>✦</span>
            <span className={s.vaniLabel}>VaNi Brief</span>
          </div>
          <p className={s.vaniText}>{session.vani_brief}</p>
        </div>
      )}

      {!session.vani_brief && (
        <div className={s.briefPending}>
          <span className={s.briefIcon}>📋</span>
          <span>No brief generated yet. You can start the meeting without it.</span>
        </div>
      )}

      <div className={s.stateActions}>
        <VdfButton variant="primary" size="sm" loading={isPending} onClick={handleStartMeeting}>
          Start Meeting
        </VdfButton>
      </div>
    </div>
  );
}

/* ── In Progress state ──────────────────────────────────────────────────────── */

interface InProgressProps {
  session: PulseHistoryItem;
  config: PulseConfig;
  onEndMeeting: () => void;
  onEditConfig: () => void;
}

function InProgressState({ session, config, onEndMeeting, onEditConfig }: InProgressProps) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState(session.meeting_notes ?? '');
  const [actionText, setActionText] = useState('');
  const [actions, setActions] = useState<string[]>([]);

  const { mutate: updateSession, isPending } = useUpdatePulseSession(
    () => { showToast({ message: 'Session completed', type: 'success' }); onEndMeeting(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleAddAction() {
    if (!actionText.trim()) return;
    setActions(prev => [...prev, actionText.trim()]);
    setActionText('');
  }

  function handleEndMeeting() {
    updateSession({
      id:           session.id,
      status:       'completed',
      ended_at:     new Date().toISOString(),
      meeting_notes: notes,
      ...(actions.length > 0 ? { action_items: actions } : {}),
    } as Record<string, unknown>);
  }

  const elapsed = session.started_at ? elapsedMin(session.started_at) : 0;

  return (
    <div className={s.stateCard}>
      <div className={s.configStrip}>
        <span className={s.configDot} />
        <span className={s.configChip}>{FREQ_LABEL[config.frequency] ?? config.frequency}</span>
        <span className={s.configSep}>·</span>
        <span className={s.configText}>{MEDIUM_ICON[config.medium]} {MEDIUM_LABEL[config.medium] ?? config.medium}</span>
        <button className={s.configEdit} onClick={onEditConfig}>Edit</button>
      </div>

      <Stepper status="in_progress" />

      <div className={s.liveIndicator}>
        <span className={s.liveDot} />
        <span className={s.liveText}>In Session · {elapsed} min</span>
      </div>

      <div className={s.notesSection}>
        <label className={s.notesLabel}>Meeting Notes</label>
        <textarea
          className={s.notesArea}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="What was discussed? Key decisions, concerns, portfolio updates…"
          rows={5}
        />
      </div>

      <div className={s.actionsSection}>
        <div className={s.actionsLabel}>Action Items</div>
        {actions.map((a, i) => (
          <div key={i} className={s.actionItem}>
            <span className={s.actionBullet} />
            <span>{a}</span>
            <button className={s.actionRemove} onClick={() => setActions(prev => prev.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div className={s.addActionRow}>
          <input
            className={s.addActionInput}
            value={actionText}
            onChange={e => setActionText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddAction()}
            placeholder="+ Add action item"
          />
        </div>
      </div>

      <div className={s.stateActions}>
        <VdfButton variant="danger" size="sm" loading={isPending} onClick={handleEndMeeting}>
          End Meeting
        </VdfButton>
      </div>
    </div>
  );
}

/* ── Completed state ────────────────────────────────────────────────────────── */

interface CompletedProps {
  session: PulseHistoryItem;
  config: PulseConfig;
  clientId: number;
  onScheduledNext: () => void;
  onEditConfig: () => void;
}

function CompletedState({ session, config, clientId, onScheduledNext, onEditConfig }: CompletedProps) {
  const { showToast } = useToast();
  const [showScheduler, setShowScheduler] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');

  const dur = session.duration_minutes ?? (
    session.ended_at && session.started_at
      ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
      : null
  );

  const { mutate: createSession, isPending } = useCreatePulseSession(
    () => { showToast({ message: 'Next session scheduled', type: 'success' }); onScheduledNext(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleScheduleNext() {
    createSession({
      client_id: clientId,
      config_id: config.id,
      scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
      template: config.template,
      medium: config.medium,
    } as Record<string, unknown>);
  }

  return (
    <div className={s.stateCard}>
      <div className={s.configStrip}>
        <span className={s.configDot} />
        <span className={s.configChip}>{FREQ_LABEL[config.frequency] ?? config.frequency}</span>
        <span className={s.configSep}>·</span>
        <span className={s.configText}>{MEDIUM_ICON[config.medium]} {MEDIUM_LABEL[config.medium] ?? config.medium}</span>
        <button className={s.configEdit} onClick={onEditConfig}>Edit</button>
      </div>

      <Stepper status="completed" />

      <div className={s.completedMeta}>
        <div className={s.completedBadge}>✓ Completed</div>
        <div className={s.completedDate}>{fmtDate(session.scheduled_at)}{dur ? ` · ${dur} min` : ''}</div>
      </div>

      {(session.vani_summary || session.meeting_notes) && (
        <div className={s.summaryBlock}>
          {session.vani_summary ? (
            <>
              <div className={s.summaryHeader}>
                <span className={s.vaniStar}>✦</span>
                <span>VaNi Summary</span>
              </div>
              <p className={s.summaryText}>{session.vani_summary}</p>
            </>
          ) : (
            <p className={s.summaryText}>{session.meeting_notes}</p>
          )}
        </div>
      )}

      {session.actions.length > 0 && (
        <div className={s.completedActions}>
          {session.actions.map(a => (
            <div key={a.id} className={`${s.completedAction} ${a.status === 'done' ? s.actionDone : ''}`}>
              <span className={`${s.actionTick} ${a.status === 'done' ? s.tickDone : ''}`}>
                {a.status === 'done' ? '✓' : '○'}
              </span>
              <span className={s.actionText}>{a.text}</span>
              {a.due_date && (
                <span className={s.actionDate}>
                  {new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!showScheduler ? (
        <div className={s.stateActions}>
          <VdfButton variant="primary" size="sm" onClick={() => setShowScheduler(true)}>
            Schedule Next Session
          </VdfButton>
        </div>
      ) : (
        <div className={s.scheduleNext}>
          <div className={s.scheduleNextLabel}>Schedule Next Session</div>
          <div className={s.scheduleRow}>
            <input className={s.dateInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
            <input className={s.timeInput} type="time" value={time} onChange={e => setTime(e.target.value)} />
            <VdfButton variant="primary" size="sm" loading={isPending} onClick={handleScheduleNext} disabled={!date}>
              Confirm
            </VdfButton>
            <VdfButton variant="ghost" size="sm" onClick={() => setShowScheduler(false)}>Cancel</VdfButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Missed state ───────────────────────────────────────────────────────────── */

interface MissedProps {
  session: PulseHistoryItem;
  config: PulseConfig;
  clientId: number;
  onRescheduled: () => void;
  onEditConfig: () => void;
}

function MissedState({ session, config, clientId, onRescheduled, onEditConfig }: MissedProps) {
  const { showToast } = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('10:00');

  const { mutate: updateSession, isPending: isCancelling } = useUpdatePulseSession(
    () => { showToast({ message: 'Session cancelled', type: 'success' }); onRescheduled(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );
  const { mutate: createSession, isPending: isScheduling } = useCreatePulseSession(
    () => { showToast({ message: 'Rescheduled', type: 'success' }); onRescheduled(); },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleReschedule() {
    createSession({
      client_id: clientId,
      config_id: config.id,
      scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
      template: config.template,
      medium: config.medium,
    } as Record<string, unknown>);
  }

  return (
    <div className={`${s.stateCard} ${s.stateMissed}`}>
      <div className={s.configStrip}>
        <span className={s.configDot} />
        <span className={s.configChip}>{FREQ_LABEL[config.frequency] ?? config.frequency}</span>
        <span className={s.configSep}>·</span>
        <span className={s.configText}>{MEDIUM_ICON[config.medium]} {MEDIUM_LABEL[config.medium] ?? config.medium}</span>
        <button className={s.configEdit} onClick={onEditConfig}>Edit</button>
      </div>

      <div className={s.missedBanner}>
        <span className={s.missedIcon}>⚠</span>
        <div>
          <div className={s.missedTitle}>Session Missed</div>
          <div className={s.missedDate}>Was scheduled for {fmtDate(session.scheduled_at)}</div>
        </div>
      </div>

      <div className={s.scheduleRow} style={{ marginTop: '16px' }}>
        <input className={s.dateInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input className={s.timeInput} type="time" value={time} onChange={e => setTime(e.target.value)} />
        <VdfButton variant="primary" size="sm" loading={isScheduling} onClick={handleReschedule}>
          Reschedule
        </VdfButton>
      </div>
      <div className={s.stateActions} style={{ marginTop: '8px' }}>
        <VdfButton variant="ghost" size="sm" loading={isCancelling}
          onClick={() => updateSession({ id: session.id, status: 'cancelled' } as Record<string, unknown>)}>
          Mark Cancelled
        </VdfButton>
      </div>
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────────────── */

export interface PulseSessionCardProps {
  clientId:   number;
  config:     PulseConfig | null;
  session:    PulseHistoryItem | null;
  onRefresh:  () => void;
  onEditConfig: () => void;
}

export function PulseSessionCard({ clientId, config, session, onRefresh, onEditConfig }: PulseSessionCardProps) {
  if (!config) {
    return <NoConfigState clientId={clientId} onSaved={onRefresh} />;
  }

  if (!session) {
    return <NoSessionState clientId={clientId} config={config} onScheduled={onRefresh} onEditConfig={onEditConfig} />;
  }

  const status = session.status;

  if (status === 'scheduled') {
    return (
      <ScheduledState
        session={session} config={config}
        onStartPrep={onRefresh} onReschedule={onRefresh} onEditConfig={onEditConfig}
      />
    );
  }
  if (status === 'prep_ready') {
    return (
      <PrepReadyState
        session={session} config={config}
        onStartMeeting={onRefresh} onEditConfig={onEditConfig}
      />
    );
  }
  if (status === 'in_progress') {
    return (
      <InProgressState
        session={session} config={config}
        onEndMeeting={onRefresh} onEditConfig={onEditConfig}
      />
    );
  }
  if (status === 'completed') {
    return (
      <CompletedState
        session={session} config={config} clientId={clientId}
        onScheduledNext={onRefresh} onEditConfig={onEditConfig}
      />
    );
  }
  if (status === 'missed') {
    return (
      <MissedState
        session={session} config={config} clientId={clientId}
        onRescheduled={onRefresh} onEditConfig={onEditConfig}
      />
    );
  }

  return <NoSessionState clientId={clientId} config={config} onScheduled={onRefresh} onEditConfig={onEditConfig} />;
}
