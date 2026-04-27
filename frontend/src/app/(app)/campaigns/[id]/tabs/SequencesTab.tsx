'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfDrawer } from '@/components/vdf';
import s from '../campaign-detail.module.css';
import f from '@/styles/forms.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Sequence {
  id: number;
  name: string;
  description: string | null;
  status: string;
  contacts_count: number;
  avg_open_rate: number;
  avg_reply_rate: number;
  step_count: number;
}

interface StepTemplate {
  id: number;
  variant_label: string;
  subject: string | null;
  body: string;
}

interface Step {
  id: number;
  step_type: string;
  title: string;
  day_offset: number;
  sort_order: number;
  wait_duration_hours: number | null;
  condition_type: string | null;
  channel_name: string | null;
  channel_channel_type: string | null;
  total_sent: number;
  open_rate: number;
  reply_rate: number;
  templates: StepTemplate[];
}

interface SequenceDetail {
  id: number;
  name: string;
  description: string | null;
  status: string;
  steps: Step[];
}

const SEQ_STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'info' }> = {
  draft:     { label: 'Draft',     variant: 'muted' },
  live:      { label: 'Live',      variant: 'success' },
  paused:    { label: 'Paused',    variant: 'warning' },
  completed: { label: 'Completed', variant: 'info' },
};

const STEP_ICONS: Record<string, { emoji: string; css: string }> = {
  email:     { emoji: '📧', css: s.stepIconEmail },
  whatsapp:  { emoji: '💬', css: s.stepIconWhatsapp },
  linkedin:  { emoji: '🔗', css: s.stepIconLinkedin },
  wait:      { emoji: '⏳', css: s.stepIconWait },
  condition: { emoji: '🔀', css: s.stepIconCondition },
};

const STEP_TYPES = [
  { value: 'email',     label: 'Email' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'wait',      label: 'Wait' },
  { value: 'condition', label: 'Condition' },
];

/* ── Component ───────────────────────────────────────── */

export function SequencesTab({ campaignId }: { campaignId: number }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // View mode: list or detail
  const [selectedSeqId, setSelectedSeqId] = useState<number | null>(null);

  // Drawers
  const [seqDrawerOpen, setSeqDrawerOpen]   = useState(false);
  const [stepDrawerOpen, setStepDrawerOpen] = useState(false);
  const [tplDrawerOpen, setTplDrawerOpen]   = useState(false);

  // New sequence form
  const [seqName, setSeqName] = useState('');
  const [seqDesc, setSeqDesc] = useState('');

  // New step form
  const [stepType, setStepType]           = useState('email');
  const [stepTitle, setStepTitle]         = useState('');
  const [stepDay, setStepDay]             = useState('0');
  const [stepWait, setStepWait]           = useState('');

  // Template form
  const [tplStepId, setTplStepId]         = useState<number | null>(null);
  const [tplSubject, setTplSubject]       = useState('');
  const [tplBody, setTplBody]             = useState('');
  const [tplVariant, setTplVariant]       = useState('A');

  /* ── Queries ─────────────────────────────────────────── */

  const { data: seqListData, isLoading: loadingList } = useSkillQuery<{ sequences: Sequence[] }>(
    'sequence-skill', 'get_sequences', { campaign_id: campaignId }
  );

  const { data: seqDetailData, isLoading: loadingDetail } = useSkillQuery<{ sequence: SequenceDetail }>(
    'sequence-skill', 'get_sequence', { sequence_id: selectedSeqId! },
    { enabled: selectedSeqId !== null }
  );

  /* ── Mutations ───────────────────────────────────────── */

  const { mutate: createSeq, isPending: creatingSeq } = useSkillMutation('sequence-skill', 'create_sequence', {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['skill', 'sequence-skill'] }); showToast({ message: 'Sequence created.', type: 'success' }); setSeqDrawerOpen(false); },
    onError: (err) => showToast({ message: err.message || 'Failed', type: 'error' }),
  });

  const { mutate: addStep, isPending: addingStep } = useSkillMutation('sequence-skill', 'add_step', {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['skill', 'sequence-skill'] }); showToast({ message: 'Step added.', type: 'success' }); setStepDrawerOpen(false); },
    onError: (err) => showToast({ message: err.message || 'Failed', type: 'error' }),
  });

  const { mutate: removeStep } = useSkillMutation('sequence-skill', 'remove_step', {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['skill', 'sequence-skill'] }); showToast({ message: 'Step removed.', type: 'success' }); },
    onError: (err) => showToast({ message: err.message || 'Failed', type: 'error' }),
  });

  const { mutate: upsertTpl, isPending: savingTpl } = useSkillMutation('sequence-skill', 'upsert_template', {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['skill', 'sequence-skill'] }); showToast({ message: 'Template saved.', type: 'success' }); setTplDrawerOpen(false); },
    onError: (err) => showToast({ message: err.message || 'Failed', type: 'error' }),
  });

  /* ── Handlers ────────────────────────────────────────── */

  function openSeqDrawer() { setSeqName(''); setSeqDesc(''); setSeqDrawerOpen(true); }
  function handleCreateSeq() {
    if (!seqName.trim()) { showToast({ message: 'Name required', type: 'error' }); return; }
    createSeq({ campaign_id: campaignId, name: seqName.trim(), description: seqDesc.trim() || undefined });
  }

  function openStepDrawer() { setStepType('email'); setStepTitle(''); setStepDay('0'); setStepWait(''); setStepDrawerOpen(true); }
  function handleAddStep() {
    if (!stepTitle.trim()) { showToast({ message: 'Title required', type: 'error' }); return; }
    addStep({
      sequence_id: selectedSeqId!,
      step_type: stepType,
      title: stepTitle.trim(),
      day_offset: Number(stepDay) || 0,
      wait_duration_hours: stepType === 'wait' && stepWait ? Number(stepWait) : undefined,
    });
  }

  function openTplDrawer(stepId: number) { setTplStepId(stepId); setTplSubject(''); setTplBody(''); setTplVariant('A'); setTplDrawerOpen(true); }
  function handleSaveTpl() {
    if (!tplBody.trim()) { showToast({ message: 'Body required', type: 'error' }); return; }
    upsertTpl({ step_id: tplStepId!, variant_label: tplVariant, subject: tplSubject.trim() || undefined, body: tplBody.trim() });
  }

  /* ── Render ──────────────────────────────────────────── */

  const sequences = seqListData?.data?.sequences ?? [];
  const seqDetail = seqDetailData?.data?.sequence;

  // If a sequence is selected, show detail view
  if (selectedSeqId && seqDetail) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <VdfButton variant="ghost" size="sm" onClick={() => setSelectedSeqId(null)}>Back</VdfButton>
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-fg)' }}>{seqDetail.name}</span>
            <VdfStatusBadge label={SEQ_STATUS_MAP[seqDetail.status]?.label ?? 'Draft'} variant={SEQ_STATUS_MAP[seqDetail.status]?.variant ?? 'muted'} />
          </div>
          <VdfButton variant="primary" size="sm" onClick={openStepDrawer}>+ Add Step</VdfButton>
        </div>

        {loadingDetail ? <VdfLoader message="Loading steps…" /> : (
          seqDetail.steps.length === 0 ? (
            <VdfEmptyState title="No steps yet" description="Add your first outreach step." action={<VdfButton variant="primary" size="sm" onClick={openStepDrawer}>+ Add Step</VdfButton>} />
          ) : (
            <div className={s.stepTimeline}>
              {seqDetail.steps.map((step, i) => {
                const icon = STEP_ICONS[step.step_type] ?? STEP_ICONS.email;
                return (
                  <div key={step.id}>
                    {i > 0 && <div className={s.stepConnector} />}
                    <div className={s.stepCard}>
                      <div className={`${s.stepIcon} ${icon.css}`}>{icon.emoji}</div>
                      <div className={s.stepBody}>
                        <div className={s.stepTitle}>{step.title}</div>
                        <div className={s.stepMeta}>
                          <span className={s.stepDay}>Day {step.day_offset}</span>
                          {step.channel_name && <span className={s.personaMetaChip}>{step.channel_name}</span>}
                          {step.wait_duration_hours && <span className={s.personaMetaChip}>{step.wait_duration_hours}h wait</span>}
                          {step.total_sent > 0 && <span className={s.personaMetaChip}>{step.total_sent} sent</span>}
                        </div>
                        {step.templates.length > 0 && (
                          <div className={s.variantPills}>
                            {step.templates.map(t => (
                              <span key={t.id} className={s.variantPill}>Variant {t.variant_label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={s.stepActions}>
                        <VdfButton variant="ghost" size="sm" onClick={() => openTplDrawer(step.id)}>Template</VdfButton>
                        <VdfButton variant="ghost" size="sm" onClick={() => removeStep({ step_id: step.id })}>Remove</VdfButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Step drawer */}
        <VdfDrawer isOpen={stepDrawerOpen} onClose={() => setStepDrawerOpen(false)} title="Add Step" width={420}
          footer={<><VdfButton variant="ghost" size="sm" onClick={() => setStepDrawerOpen(false)} disabled={addingStep}>Cancel</VdfButton><VdfButton variant="primary" size="sm" onClick={handleAddStep} disabled={addingStep}>{addingStep ? 'Adding…' : 'Add Step'}</VdfButton></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={s.fieldGroup}>
              <label className={f.label}>Step Type</label>
              <select className={f.select} value={stepType} onChange={e => setStepType(e.target.value)}>
                {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Title *</label>
              <input className={f.input} value={stepTitle} onChange={e => setStepTitle(e.target.value)} placeholder="e.g. Initial outreach email" />
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Day Offset</label>
              <input className={f.input} type="number" value={stepDay} onChange={e => setStepDay(e.target.value)} placeholder="0" min="0" />
            </div>
            {stepType === 'wait' && (
              <div className={s.fieldGroup}>
                <label className={f.label}>Wait Duration (hours)</label>
                <input className={f.input} type="number" value={stepWait} onChange={e => setStepWait(e.target.value)} placeholder="e.g. 48" min="1" />
              </div>
            )}
          </div>
        </VdfDrawer>

        {/* Template drawer */}
        <VdfDrawer isOpen={tplDrawerOpen} onClose={() => setTplDrawerOpen(false)} title="Message Template" width={520}
          footer={<><VdfButton variant="ghost" size="sm" onClick={() => setTplDrawerOpen(false)} disabled={savingTpl}>Cancel</VdfButton><VdfButton variant="primary" size="sm" onClick={handleSaveTpl} disabled={savingTpl}>{savingTpl ? 'Saving…' : 'Save Template'}</VdfButton></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={s.fieldGroup}>
              <label className={f.label}>Variant</label>
              <select className={f.select} value={tplVariant} onChange={e => setTplVariant(e.target.value)}>
                <option value="A">A</option><option value="B">B</option><option value="C">C</option>
              </select>
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Subject Line</label>
              <input className={f.input} value={tplSubject} onChange={e => setTplSubject(e.target.value)} placeholder="Email subject (optional for WhatsApp/LinkedIn)" />
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Body *</label>
              <textarea className={f.input} rows={8} value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Hi {{first_name}}, …" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>
              Placeholders: {'{{first_name}}'}, {'{{company}}'}, {'{{title}}'}, {'{{product_name}}'}
            </div>
          </div>
        </VdfDrawer>
      </>
    );
  }

  // List view
  if (loadingList) return <VdfLoader message="Loading sequences…" />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <VdfButton variant="primary" size="sm" onClick={openSeqDrawer}>+ New Sequence</VdfButton>
      </div>

      {sequences.length === 0 ? (
        <VdfEmptyState title="No sequences yet" description="Create your first outreach sequence." action={<VdfButton variant="primary" size="sm" onClick={openSeqDrawer}>+ New Sequence</VdfButton>} />
      ) : (
        <div className={s.sequenceList}>
          {sequences.map((seq) => {
            const badge = SEQ_STATUS_MAP[seq.status] ?? SEQ_STATUS_MAP.draft;
            return (
              <div key={seq.id} className={s.sequenceCard} onClick={() => setSelectedSeqId(seq.id)}>
                <div className={s.sequenceInfo}>
                  <div className={s.sequenceName}>{seq.name}</div>
                  {seq.description && <div className={s.sequenceDesc}>{seq.description}</div>}
                </div>
                <div className={s.sequenceStats}>
                  <div className={s.channelStat}><span className={s.channelStatValue}>{seq.step_count}</span><span className={s.channelStatLabel}>Steps</span></div>
                  <div className={s.channelStat}><span className={s.channelStatValue}>{seq.contacts_count}</span><span className={s.channelStatLabel}>Contacts</span></div>
                  <div className={s.channelStat}><span className={s.channelStatValue}>{seq.avg_open_rate}%</span><span className={s.channelStatLabel}>Open</span></div>
                </div>
                <VdfStatusBadge label={badge.label} variant={badge.variant} />
              </div>
            );
          })}
        </div>
      )}

      <VdfDrawer isOpen={seqDrawerOpen} onClose={() => setSeqDrawerOpen(false)} title="New Sequence" width={420}
        footer={<><VdfButton variant="ghost" size="sm" onClick={() => setSeqDrawerOpen(false)} disabled={creatingSeq}>Cancel</VdfButton><VdfButton variant="primary" size="sm" onClick={handleCreateSeq} disabled={creatingSeq}>{creatingSeq ? 'Creating…' : 'Create'}</VdfButton></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={s.fieldGroup}><label className={f.label}>Name *</label><input className={f.input} value={seqName} onChange={e => setSeqName(e.target.value)} placeholder="e.g. Cold Outreach v1" /></div>
          <div className={s.fieldGroup}><label className={f.label}>Description</label><textarea className={f.input} rows={3} value={seqDesc} onChange={e => setSeqDesc(e.target.value)} placeholder="Brief description…" style={{ resize: 'vertical' }} /></div>
        </div>
      </VdfDrawer>
    </>
  );
}
