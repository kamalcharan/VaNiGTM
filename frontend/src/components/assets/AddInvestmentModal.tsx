'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { VdfModal, VdfButton } from '@/components/vdf';
import { useSkillMutation } from '@/hooks/useSkill';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import f from '@/styles/forms.module.css';
import s from './AddInvestmentModal.module.css';

/* ── Types ────────────────────────────────────────────── */

export interface AssetTypeItem {
  id:                      number;
  asset_type_code:         string;
  asset_type_name:         string;
  category:                string;
  default_assumption_rate: number;
  display_order:           number;
}

export interface AssetAssignmentForEdit {
  assignment_id:           number;
  asset_type_id:           number;
  asset_type_code:         string;
  scheme_code:             string | null;
  notes:                   string | null;
  investment_type:         string | null;
  principal_amount:        number | null;
  start_date:              string | null;
  duration_months:         number | null;
  recurring_amount:        number | null;
  investment_frequency:    string | null;
  custom_assumption_rate:  number | null;
  effective_rate:          number;
}

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  clientId:  number;
  editData?: AssetAssignmentForEdit | null;   // null = create mode
}

/* ── Form state shape ─────────────────────────────────── */

interface FormState {
  asset_type_id:           string;
  notes:                   string;
  scheme_code:             string;
  investment_type:         'one_time' | 'sip' | 'recurring';
  principal_amount:        string;
  start_date:              string;
  duration_months:         string;
  recurring_amount:        string;
  investment_frequency:    'monthly' | 'quarterly' | 'yearly';
  custom_assumption_rate:  string;
}

const EMPTY: FormState = {
  asset_type_id:          '',
  notes:                  '',
  scheme_code:            '',
  investment_type:        'one_time',
  principal_amount:       '',
  start_date:             '',
  duration_months:        '',
  recurring_amount:       '',
  investment_frequency:   'monthly',
  custom_assumption_rate: '',
};

const CATEGORY_LABELS: Record<string, string> = {
  equity:       'Equity',
  fixed_income: 'Fixed Income',
  commodity:    'Commodities',
  real_estate:  'Real Estate',
  insurance:    'Insurance',
};

/* ── Component ────────────────────────────────────────── */

export function AddInvestmentModal({ isOpen, onClose, clientId, editData }: Props) {
  const { showToast } = useToast();
  const queryClient  = useQueryClient();
  const isEdit       = !!editData;

  /* ── Load asset types (global master data — no tenant filter) ── */
  const { data: typesData, isLoading: typesLoading } = useQuery<{ asset_types: AssetTypeItem[] }>({
    queryKey: ['master-data', 'asset-types'],
    queryFn: () => apiFetch<{ asset_types: AssetTypeItem[] }>(API.masterData.assetTypes),
    staleTime: 10 * 60_000,
  });

  const assetTypes = typesData?.asset_types ?? [];

  /* ── Form state ───────────────────────────── */
  const [form, setForm]   = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // Prime form when modal opens or editData changes
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && editData) {
      setForm({
        asset_type_id:          String(editData.asset_type_id),
        notes:                  editData.notes ?? '',
        scheme_code:            editData.scheme_code ?? '',
        investment_type:        (editData.investment_type as FormState['investment_type']) ?? 'one_time',
        principal_amount:       String(editData.principal_amount ?? ''),
        start_date:             editData.start_date ? editData.start_date.slice(0, 10) : '',
        duration_months:        String(editData.duration_months ?? ''),
        recurring_amount:       String(editData.recurring_amount ?? ''),
        investment_frequency:   (editData.investment_frequency as FormState['investment_frequency']) ?? 'monthly',
        custom_assumption_rate: String(editData.custom_assumption_rate ?? ''),
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [isOpen, isEdit, editData]);

  /* ── Derived values ───────────────────────── */
  const selectedType    = assetTypes.find(t => t.id === Number(form.asset_type_id));
  const defaultRate     = Number(selectedType?.default_assumption_rate ?? 0);
  const isMF            = selectedType?.asset_type_code === 'MF';
  const isSIP           = form.investment_type === 'sip' || form.investment_type === 'recurring';
  const effectiveRate   = form.custom_assumption_rate !== ''
    ? Number(form.custom_assumption_rate)
    : defaultRate;

  /* ── Skill mutations ──────────────────────── */
  const { mutateAsync: createAssignment, isPending: creating } =
    useSkillMutation('portfolio-skill', 'create_asset_assignment');

  const { mutateAsync: updateAssignment, isPending: updating } =
    useSkillMutation('portfolio-skill', 'update_asset_assignment');

  const saving = creating || updating;

  /* ── Helpers ──────────────────────────────── */
  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const setRadio = (field: keyof FormState, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  /* ── Validation ───────────────────────────── */
  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.asset_type_id) errs.asset_type_id = 'Select an asset type';
    if (!form.notes.trim())  errs.notes = 'Enter an investment name';
    if (!form.principal_amount || Number(form.principal_amount) <= 0)
      errs.principal_amount = 'Enter a principal amount > 0';
    if (isMF && !form.scheme_code.trim()) errs.scheme_code = 'Enter the scheme code for MF';
    if (isSIP && (!form.recurring_amount || Number(form.recurring_amount) <= 0))
      errs.recurring_amount = 'Enter a recurring amount > 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /* ── Submit ───────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      client_id:               clientId,
      asset_type_id:           Number(form.asset_type_id),
      scheme_code:             isMF && form.scheme_code.trim() ? form.scheme_code.trim() : null,
      notes:                   form.notes.trim() || null,
      investment_type:         form.investment_type,
      principal_amount:        Number(form.principal_amount),
      start_date:              form.start_date || null,
      duration_months:         form.duration_months ? Number(form.duration_months) : null,
      recurring_amount:        isSIP && form.recurring_amount ? Number(form.recurring_amount) : null,
      investment_frequency:    isSIP ? form.investment_frequency : null,
      custom_assumption_rate:  form.custom_assumption_rate !== '' ? Number(form.custom_assumption_rate) : null,
    };

    try {
      if (isEdit && editData) {
        await updateAssignment({ assignment_id: editData.assignment_id, ...payload });
        showToast({ message: 'Investment updated', type: 'success' });
      } else {
        await createAssignment(payload);
        showToast({ message: 'Investment added', type: 'success' });
      }
      await queryClient.invalidateQueries({ queryKey: ['skill', 'portfolio-skill', 'get_asset_assignments'] });
      onClose();
    } catch (err: any) {
      showToast({ message: err?.message ?? 'Failed to save investment', type: 'error' });
    }
  }

  /* ── Group asset types by category for select ── */
  const byCategory = assetTypes.reduce<Record<string, AssetTypeItem[]>>((acc, t) => {
    const cat = CATEGORY_LABELS[t.category] ?? t.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  /* ── Render ───────────────────────────────── */
  return (
    <VdfModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Investment' : 'Add Investment'}
      subtitle={isEdit ? 'Update investment details' : 'Record a new asset in this client\'s plan'}
      width="md"
      footer={
        <div className={s.footer}>
          <VdfButton variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </VdfButton>
          <VdfButton variant="primary" size="sm" onClick={handleSubmit as any} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Investment'}
          </VdfButton>
        </div>
      }
    >
      {typesLoading ? (
        <div className={s.loading}>Loading asset types…</div>
      ) : (
        <form onSubmit={handleSubmit} className={s.form}>

          {/* ── Asset Type + Name ── */}
          <div className={s.row2}>
            <div className={f.group}>
              <label className={f.label}>Asset Type *</label>
              <select
                className={`${f.select} ${errors.asset_type_id ? f.inputError : ''}`}
                value={form.asset_type_id}
                onChange={set('asset_type_id')}
                disabled={isEdit} /* can't change type on edit */
              >
                <option value="">Select asset type…</option>
                {Object.entries(byCategory).map(([cat, types]) => (
                  <optgroup key={cat} label={cat}>
                    {types.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.asset_type_name}
                        {Number(t.default_assumption_rate) > 0 ? ` (${Number(t.default_assumption_rate)}% p.a.)` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {errors.asset_type_id && <span className={s.err}>{errors.asset_type_id}</span>}
            </div>

            <div className={f.group}>
              <label className={f.label}>Investment Name *</label>
              <input
                className={`${f.input} ${errors.notes ? f.inputError : ''}`}
                placeholder="e.g. Kotak FD 2024, SBI Gold ETF"
                value={form.notes}
                onChange={set('notes')}
              />
              {errors.notes && <span className={s.err}>{errors.notes}</span>}
            </div>
          </div>

          {/* ── MF scheme code (conditional) ── */}
          {isMF && (
            <div className={f.group}>
              <label className={f.label}>Scheme Code *</label>
              <input
                className={`${f.input} ${errors.scheme_code ? f.inputError : ''}`}
                placeholder="e.g. 101206"
                value={form.scheme_code}
                onChange={set('scheme_code')}
                disabled={isEdit}
              />
              {errors.scheme_code && <span className={s.err}>{errors.scheme_code}</span>}
            </div>
          )}

          {/* ── Investment type radio ── */}
          <div className={f.group}>
            <label className={f.label}>Investment Type</label>
            <div className={s.radioGroup}>
              {(['one_time', 'sip', 'recurring'] as const).map(opt => (
                <label key={opt} className={`${s.radioOption} ${form.investment_type === opt ? s.radioActive : ''}`}>
                  <input
                    type="radio"
                    name="investment_type"
                    value={opt}
                    checked={form.investment_type === opt}
                    onChange={() => setRadio('investment_type', opt)}
                  />
                  {opt === 'one_time' ? 'One-time' : opt === 'sip' ? 'SIP' : 'Recurring'}
                </label>
              ))}
            </div>
          </div>

          {/* ── Principal + Start Date ── */}
          <div className={s.row2}>
            <div className={f.group}>
              <label className={f.label}>Principal Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                className={`${f.input} ${errors.principal_amount ? f.inputError : ''}`}
                placeholder="0.00"
                value={form.principal_amount}
                onChange={set('principal_amount')}
              />
              {errors.principal_amount && <span className={s.err}>{errors.principal_amount}</span>}
            </div>

            <div className={f.group}>
              <label className={f.label}>Start Date</label>
              <input
                type="date"
                className={f.input}
                value={form.start_date}
                onChange={set('start_date')}
              />
            </div>
          </div>

          {/* ── SIP / Recurring fields (conditional) ── */}
          {isSIP && (
            <div className={s.row2}>
              <div className={f.group}>
                <label className={f.label}>Recurring Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  className={`${f.input} ${errors.recurring_amount ? f.inputError : ''}`}
                  placeholder="Monthly instalment"
                  value={form.recurring_amount}
                  onChange={set('recurring_amount')}
                />
                {errors.recurring_amount && <span className={s.err}>{errors.recurring_amount}</span>}
              </div>

              <div className={f.group}>
                <label className={f.label}>Frequency</label>
                <div className={s.radioGroup}>
                  {(['monthly', 'quarterly', 'yearly'] as const).map(opt => (
                    <label key={opt} className={`${s.radioOption} ${form.investment_frequency === opt ? s.radioActive : ''}`}>
                      <input
                        type="radio"
                        name="investment_frequency"
                        value={opt}
                        checked={form.investment_frequency === opt}
                        onChange={() => setRadio('investment_frequency', opt)}
                      />
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Duration + Growth Rate ── */}
          <div className={s.row2}>
            <div className={f.group}>
              <label className={f.label}>Duration (months)</label>
              <input
                type="number"
                min="1"
                className={f.input}
                placeholder="Optional — investment horizon"
                value={form.duration_months}
                onChange={set('duration_months')}
              />
            </div>

            <div className={f.group}>
              <label className={f.label}>
                Custom Growth Rate (% p.a.)
                {selectedType && (
                  <span className={s.defaultRate}>
                    {' '}default: {defaultRate}%
                  </span>
                )}
              </label>
              <input
                type="number"
                min="0"
                max="50"
                step="0.1"
                className={f.input}
                placeholder={String(defaultRate)}
                value={form.custom_assumption_rate}
                onChange={set('custom_assumption_rate')}
              />
            </div>
          </div>

          {/* ── Effective rate preview ── */}
          {selectedType && (
            <div className={s.ratePreview}>
              <span className={s.ratePreviewLabel}>Effective growth rate:</span>
              <span className={s.ratePreviewValue}>{effectiveRate.toFixed(1)}% per annum</span>
              {form.custom_assumption_rate !== '' && (
                <span className={s.ratePreviewNote}>(custom override)</span>
              )}
            </div>
          )}

        </form>
      )}
    </VdfModal>
  );
}
