'use client';

import { useState, type FormEvent } from 'react';
import { VdfModal } from '@/components/vdf/modal/VdfModal';
import { VdfButton } from '@/components/vdf/button/VdfButton';
import { VdfRichText } from '@/components/vdf';
import { useCreatePulse, type CreatePulseParams, type PulseItem } from '@/hooks/usePulses';
import { useToast } from '@/components/toast';
import s from './CreatePulseModal.module.css';

interface Props {
  isOpen:      boolean;
  onClose:     () => void;
  /** Pre-fill if opened from a contact profile */
  contactId?:  number;
  contactName?: string;
  /** Pre-fill if opened from a client profile */
  clientId?:   number;
  clientName?: string;
  /** Pre-fill if opened from a snapshot save */
  snapshotId?: number;
  onCreated?: (pulse: PulseItem) => void;
}

const PULSE_TYPE_LABELS: Record<string, string> = {
  prospect_followup: 'Prospect Follow-up',
  client_followup:   'Client Follow-up',
};

export function CreatePulseModal({
  isOpen, onClose,
  contactId, contactName,
  clientId, clientName,
  snapshotId,
  onCreated,
}: Props) {
  const { showToast } = useToast();

  // Infer default type from what was provided
  const defaultType = clientId ? 'client_followup' : 'prospect_followup';

  const [pulseType, setPulseType] = useState<'prospect_followup' | 'client_followup'>(defaultType);
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [dueDate,  setDueDate]  = useState('');
  const [notes,    setNotes]    = useState('');

  const { mutate, isPending } = useCreatePulse(
    (pulse) => {
      showToast({ message: 'Follow-up created', type: 'success' });
      onCreated?.(pulse);
      handleClose();
    },
    (msg) => showToast({ message: msg, type: 'error' }),
  );

  function handleClose() {
    setTitle(''); setBody(''); setPriority('medium'); setDueDate(''); setNotes('');
    setPulseType(defaultType);
    onClose();
  }

  /** Strip HTML tags to get plain text length for empty-check */
  function htmlIsEmpty(html: string): boolean {
    return !html || (html.replace(/<[^>]*>/g, '').trim() === '');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const params: CreatePulseParams = {
      pulse_type:  pulseType,
      title:       title.trim(),
      body:        htmlIsEmpty(body) ? undefined : body,
      priority,
      due_date:    dueDate || undefined,
      notes:       htmlIsEmpty(notes) ? undefined : notes,
      contact_id:  pulseType === 'prospect_followup' ? contactId : undefined,
      client_id:   pulseType === 'client_followup'   ? clientId  : undefined,
      snapshot_id: snapshotId,
    };

    mutate(params as unknown as Record<string, unknown>);
  }

  const subjectLabel = contactName || clientName || null;

  return (
    <VdfModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Follow-up"
      subtitle={subjectLabel ? `For ${subjectLabel}` : undefined}
      width="md"
      footer={
        <div className={s.footer}>
          <VdfButton variant="ghost" size="sm" onClick={handleClose} disabled={isPending}>
            Cancel
          </VdfButton>
          <VdfButton variant="primary" size="sm" type="submit" loading={isPending}
            onClick={(e) => { e.preventDefault(); handleSubmit(e as unknown as FormEvent); }}
          >
            {isPending ? 'Creating…' : 'Create Follow-up'}
          </VdfButton>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className={s.form}>

        {/* Type toggle — only show if neither contactId nor clientId is locked */}
        {!contactId && !clientId && (
          <div className={s.field}>
            <label className={s.label}>Type</label>
            <div className={s.toggleRow}>
              {(['prospect_followup', 'client_followup'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`${s.toggleBtn} ${pulseType === t ? s.toggleBtnActive : ''}`}
                  onClick={() => setPulseType(t)}
                >
                  {PULSE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Title */}
        <div className={s.field}>
          <label className={s.label}>What to follow up on <span className={s.req}>*</span></label>
          <input
            className={s.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Share ELSS comparison, Discuss SIP top-up"
            required
            autoFocus
            disabled={isPending}
          />
        </div>

        {/* Body — optional extra context */}
        <div className={s.field}>
          <VdfRichText
            label="Details"
            value={body}
            onChange={setBody}
            placeholder="Any context for this follow-up…"
            disabled={isPending}
            minHeight={72}
            maxHeight={180}
          />
        </div>

        {/* Priority + Due date row */}
        <div className={s.rowTwo}>
          <div className={s.field}>
            <label className={s.label}>Priority</label>
            <select
              className={s.select}
              value={priority}
              onChange={e => setPriority(e.target.value as typeof priority)}
              disabled={isPending}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Due date <span className={s.optional}>(optional)</span></label>
            <input
              type="date"
              className={s.input}
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        {/* Notes */}
        <div className={s.field}>
          <VdfRichText
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Private notes for your reference…"
            disabled={isPending}
            minHeight={72}
            maxHeight={160}
          />
        </div>

      </form>
    </VdfModal>
  );
}
