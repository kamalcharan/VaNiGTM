'use client';

import { Fragment, useState, useCallback, type FormEvent } from 'react';
import { useSkillQuery, useSkillMutation, type SkillResult } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import type { ApiError } from '@/lib/api-client';
import {
  VdfPageHeader, VdfButton, VdfStatusBadge, VdfEmptyState,
  VdfLoader, VdfModal,
} from '@/components/vdf';
import s from './course-correction.module.css';
import d from '@/styles/data.module.css';

/* ── Types ────────────────────────────────────────────── */

type CorrectionStatus = 'pending' | 'completed' | 'rolled_back' | 'failed';
type StepStatus = 'pending' | 'pass' | 'fail';

interface CorrectionStep {
  step:   string;
  label:  string;
  status: StepStatus;
  detail?: string;
}

interface Correction {
  id:                 number;
  customer_id:        number;
  customer_name:      string;
  source_scheme_code: string;
  source_scheme_name: string | null;
  target_scheme_code: string;
  target_scheme_name: string | null;
  transaction_count:  number;
  total_invested:     number;
  status:             CorrectionStatus;
  notes:              string | null;
  error_message:      string | null;
  created_at:         string;
  executed_at:        string | null;
  rolled_back_at:     string | null;
  // step tracking
  step_1_check_existing?: StepStatus;
  step_2_get_customer?:   StepStatus;
  step_3_get_source_scheme?: StepStatus;
  step_4_get_target_scheme?: StepStatus;
  step_5_count_txns?:     StepStatus;
  step_6_backup?:         StepStatus;
  step_7_update_txns?:    StepStatus;
  step_8_snapshots?:      StepStatus;
}

interface CorrectionsData {
  corrections: Correction[];
  total:       number;
}

interface ExecuteResult {
  correction_id: number;
  steps:         CorrectionStep[];
  transactions_affected: number;
}

/* ── Constants ────────────────────────────────────────── */

const STEP_KEYS: Array<{ key: keyof Correction; label: string }> = [
  { key: 'step_1_check_existing',   label: 'Check existing migrations' },
  { key: 'step_2_get_customer',     label: 'Get customer' },
  { key: 'step_3_get_source_scheme',label: 'Get source scheme' },
  { key: 'step_4_get_target_scheme',label: 'Get target scheme' },
  { key: 'step_5_count_txns',       label: 'Count transactions' },
  { key: 'step_6_backup',           label: 'Backup transactions' },
  { key: 'step_7_update_txns',      label: 'Update transactions' },
  { key: 'step_8_snapshots',        label: 'Regenerate snapshots' },
];

const STATUS_VARIANT: Record<CorrectionStatus, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  pending:     'info',
  completed:   'success',
  rolled_back: 'warning',
  failed:      'danger',
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',         label: 'All'         },
  { value: 'pending',     label: 'Pending'     },
  { value: 'completed',   label: 'Completed'   },
  { value: 'rolled_back', label: 'Rolled back' },
  { value: 'failed',      label: 'Failed'      },
];

/* ── Helpers ──────────────────────────────────────────── */

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

function fmtCurrency(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/* ── Step tracker chip ────────────────────────────────── */
function StepChip({ status, label, index }: { status: StepStatus; label: string; index: number }) {
  return (
    <div className={`${s.stepChip} ${status === 'pass' ? s.stepPass : status === 'fail' ? s.stepFail : s.stepPending}`} title={label}>
      <span className={s.stepDot} />
      <span className={s.stepLabel}>{index + 1}</span>
    </div>
  );
}

/* ── Expanded step detail ─────────────────────────────── */
function StepTracker({ correction }: { correction: Correction }) {
  return (
    <div className={s.stepTracker}>
      {STEP_KEYS.map((sk, i) => {
        const raw = correction[sk.key] as StepStatus | undefined;
        const status: StepStatus = raw ?? 'pending';
        return (
          <div key={sk.key} className={`${s.stepRow} ${status === 'pass' ? s.stepRowPass : status === 'fail' ? s.stepRowFail : ''}`}>
            <div className={`${s.stepRowDot} ${status === 'pass' ? s.stepRowDotPass : status === 'fail' ? s.stepRowDotFail : s.stepRowDotPending}`} />
            <span className={s.stepRowNum}>{i + 1}</span>
            <span className={s.stepRowLabel}>{sk.label}</span>
            <span className={`${s.stepRowStatus} ${status === 'pass' ? s.stepRowStatusPass : status === 'fail' ? s.stepRowStatusFail : ''}`}>
              {status === 'pass' ? '✓' : status === 'fail' ? '✗' : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── New correction form ──────────────────────────────── */
interface NewCorrectionFormProps {
  onClose:   () => void;
  onSuccess: () => void;
}

function NewCorrectionForm({ onClose, onSuccess }: NewCorrectionFormProps) {
  const { showToast } = useToast();
  const [customerId,        setCustomerId]        = useState('');
  const [sourceSchemeCode,  setSourceSchemeCode]  = useState('');
  const [targetSchemeCode,  setTargetSchemeCode]  = useState('');
  const [notes,             setNotes]             = useState('');
  const [result,            setResult]            = useState<ExecuteResult | null>(null);

  const { mutate: execute, isPending } = useSkillMutation<ExecuteResult>(
    'etl-skill', 'execute_correction',
    {
      onSuccess: (data: SkillResult<ExecuteResult>) => {
        setResult(data?.data ?? null);
        showToast({ message: 'Course correction executed successfully.', type: 'success' });
        onSuccess();
      },
      onError: (err) => {
        showToast({ message: err?.message ?? 'Correction failed.', type: 'error' });
      },
    }
  );

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customerId || !sourceSchemeCode || !targetSchemeCode) {
      showToast({ message: 'All three fields are required.', type: 'error' });
      return;
    }
    execute({
      customer_id:        Number(customerId),
      source_scheme_code: sourceSchemeCode.trim().toUpperCase(),
      target_scheme_code: targetSchemeCode.trim().toUpperCase(),
      notes:              notes.trim() || undefined,
    });
  }

  /* Show step result after execution */
  if (result) {
    return (
      <div className={s.resultWrap}>
        <div className={s.resultHeader}>
          <div className={s.resultIcon}>✓</div>
          <div>
            <div className={s.resultTitle}>Migration Complete</div>
            <div className={s.resultSub}>
              {result.transactions_affected} transaction{result.transactions_affected !== 1 ? 's' : ''} updated
            </div>
          </div>
        </div>
        <div className={s.resultSteps}>
          {result.steps.map((step, i) => (
            <div key={step.step} className={`${s.stepRow} ${step.status === 'pass' ? s.stepRowPass : step.status === 'fail' ? s.stepRowFail : ''}`}>
              <div className={`${s.stepRowDot} ${step.status === 'pass' ? s.stepRowDotPass : step.status === 'fail' ? s.stepRowDotFail : s.stepRowDotPending}`} />
              <span className={s.stepRowNum}>{i + 1}</span>
              <span className={s.stepRowLabel}>{step.label}</span>
              <span className={`${s.stepRowStatus} ${step.status === 'pass' ? s.stepRowStatusPass : step.status === 'fail' ? s.stepRowStatusFail : ''}`}>
                {step.status === 'pass' ? '✓' : step.status === 'fail' ? '✗' : '—'}
              </span>
              {step.detail && <span className={s.stepRowDetail}>{step.detail}</span>}
            </div>
          ))}
        </div>
        <VdfButton variant="primary" size="sm" onClick={onClose}>Done</VdfButton>
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={handleSubmit}>
      <div className={s.formAlert}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        This will update all transactions for the customer from the source scheme code to the target scheme code. A backup is taken before any changes.
      </div>

      <div className={s.formGroup}>
        <label className={s.formLabel}>Customer ID</label>
        <input
          className={s.formInput}
          type="number"
          min="1"
          placeholder="Enter customer ID"
          value={customerId}
          onChange={e => setCustomerId(e.target.value)}
          required
        />
        <span className={s.formHint}>The numeric database ID for the client.</span>
      </div>

      <div className={s.schemePair}>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Source Scheme Code</label>
          <input
            className={s.formInput}
            type="text"
            placeholder="e.g. INF200K01RL5"
            value={sourceSchemeCode}
            onChange={e => setSourceSchemeCode(e.target.value.toUpperCase())}
            required
          />
          <span className={s.formHint}>Old / incorrect scheme code.</span>
        </div>

        <div className={s.schemePairArrow}>→</div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Target Scheme Code</label>
          <input
            className={s.formInput}
            type="text"
            placeholder="e.g. INF200K01RL6"
            value={targetSchemeCode}
            onChange={e => setTargetSchemeCode(e.target.value.toUpperCase())}
            required
          />
          <span className={s.formHint}>New / correct scheme code.</span>
        </div>
      </div>

      <div className={s.formGroup}>
        <label className={s.formLabel}>Notes <span className={s.formOptional}>(optional)</span></label>
        <textarea
          className={s.formTextarea}
          placeholder="Reason for migration, AMC notification ref, etc."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      <div className={s.formFooter}>
        <VdfButton variant="outline" size="sm" type="button" onClick={onClose}>Cancel</VdfButton>
        <VdfButton variant="primary" size="sm" type="submit" disabled={isPending}>
          {isPending ? 'Executing…' : 'Execute Migration'}
        </VdfButton>
      </div>
    </form>
  );
}

/* ── Main page ────────────────────────────────────────── */

export default function CourseCorrectionPage() {
  const { showToast } = useToast();

  const [statusFilter,   setStatusFilter]   = useState('all');
  const [expandedId,     setExpandedId]     = useState<number | null>(null);
  const [showNewForm,    setShowNewForm]     = useState(false);

  const { data, isLoading, isError, error, refetch } = useSkillQuery<CorrectionsData>(
    'etl-skill', 'get_corrections',
    { status: statusFilter === 'all' ? undefined : statusFilter }
  );

  const { mutate: rollback, isPending: isRollingBack } = useSkillMutation(
    'etl-skill', 'rollback_correction',
    {
      onSuccess: () => {
        showToast({ message: 'Correction rolled back successfully.', type: 'success' });
        refetch();
      },
      onError: (err: ApiError) => {
        showToast({ message: err?.message ?? 'Rollback failed.', type: 'error' });
      },
    }
  );

  const corrections = data?.data?.corrections ?? [];
  const total       = data?.data?.total       ?? 0;

  const completedCount   = corrections.filter(c => c.status === 'completed').length;
  const pendingCount     = corrections.filter(c => c.status === 'pending').length;
  const failedCount      = corrections.filter(c => c.status === 'failed').length;
  const rolledBackCount  = corrections.filter(c => c.status === 'rolled_back').length;

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleRollback = useCallback((correctionId: number) => {
    rollback({ correction_id: correctionId });
  }, [rollback]);

  const handleNewSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) return <VdfLoader overlay message="Loading corrections…" />;
  if (isError) {
    showToast({ message: error?.message ?? 'Failed to load corrections', type: 'error' });
  }

  return (
    <div className={s.page}>

      <VdfPageHeader
        eyebrow="OPERATIONS"
        title="Course Correction"
        meta={
          total > 0 ? (
            <>
              <strong>{total}</strong> total
              {completedCount > 0 && <>&nbsp;·&nbsp;<span className={s.metaSuccess}>{completedCount} completed</span></>}
              {pendingCount   > 0 && <>&nbsp;·&nbsp;<span className={s.metaPending}>{pendingCount} pending</span></>}
              {failedCount    > 0 && <>&nbsp;·&nbsp;<span className={s.metaDanger}>{failedCount} failed</span></>}
              {rolledBackCount > 0 && <>&nbsp;·&nbsp;<span className={s.metaWarning}>{rolledBackCount} rolled back</span></>}
            </>
          ) : 'Scheme code migration tool'
        }
        actions={
          <VdfButton variant="primary" size="sm" onClick={() => setShowNewForm(true)}>
            + New Correction
          </VdfButton>
        }
      />

      <div className={s.body}>

        {/* ── Info banner ── */}
        <div className={s.infoBanner}>
          <div className={s.infoIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className={s.infoText}>
            <strong>Scheme Code Migration</strong> — Use this when an AMC changes a scheme's code or two funds merge.
            All transactions for the selected customer are migrated from the old code to the new one in 8 steps.
            Every migration is backed up and can be rolled back.
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className={s.toolbar}>
          <div className={s.filterPills}>
            {STATUS_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${s.filterPill} ${statusFilter === opt.value ? s.filterPillActive : ''}`}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        {corrections.length === 0 ? (
          <VdfEmptyState
            title="No corrections found"
            description={
              statusFilter !== 'all'
                ? `No ${statusFilter.replace('_', ' ')} corrections.`
                : 'No scheme migrations have been run yet. Use the button above to start one.'
            }
            action={
              statusFilter === 'all' ? (
                <VdfButton variant="primary" size="sm" onClick={() => setShowNewForm(true)}>
                  + New Correction
                </VdfButton>
              ) : undefined
            }
          />
        ) : (
          <div className={d.tableWrap}>
            <table className={d.table}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Customer</th>
                  <th>Source → Target</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Txns</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Invested</th>
                  <th style={{ width: 120 }}>Steps</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 90 }}>Date</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {corrections.map((c, i) => (
                  <Fragment key={c.id}>
                    <tr
                      className={`${s.row} ${expandedId === c.id ? s.rowExpanded : ''}`}
                      onClick={() => handleToggleExpand(c.id)}
                    >
                      {/* Row number */}
                      <td className={`${d.tdMono} ${s.rowNum}`}>{i + 1}</td>

                      {/* Customer */}
                      <td>
                        <div className={s.customerName}>{c.customer_name}</div>
                        <div className={s.customerId}>ID {c.customer_id}</div>
                      </td>

                      {/* Scheme migration */}
                      <td>
                        <div className={s.schemeMigration}>
                          <span className={s.schemeCode}>{c.source_scheme_code}</span>
                          {c.source_scheme_name && (
                            <span className={s.schemeName}>{c.source_scheme_name}</span>
                          )}
                          <span className={s.schemeArrow}>→</span>
                          <span className={`${s.schemeCode} ${s.schemeCodeTarget}`}>{c.target_scheme_code}</span>
                          {c.target_scheme_name && (
                            <span className={s.schemeName}>{c.target_scheme_name}</span>
                          )}
                        </div>
                      </td>

                      {/* Counts */}
                      <td className={d.tdMono} style={{ textAlign: 'right' }}>
                        {c.transaction_count.toLocaleString('en-IN')}
                      </td>

                      {/* Invested */}
                      <td className={d.tdMono} style={{ textAlign: 'right' }}>
                        {fmtCurrency(c.total_invested)}
                      </td>

                      {/* Step chips */}
                      <td>
                        <div className={s.stepChips}>
                          {STEP_KEYS.map((sk, si) => (
                            <StepChip
                              key={sk.key}
                              index={si}
                              label={sk.label}
                              status={(c[sk.key] as StepStatus | undefined) ?? 'pending'}
                            />
                          ))}
                        </div>
                      </td>

                      {/* Status badge */}
                      <td>
                        <VdfStatusBadge
                          label={c.status.replace('_', ' ')}
                          variant={STATUS_VARIANT[c.status]}
                          size="sm"
                        />
                      </td>

                      {/* Date */}
                      <td className={`${d.tdMono} ${s.dateCell}`}>
                        {fmtDate(c.executed_at ?? c.created_at)}
                      </td>

                      {/* Actions */}
                      <td onClick={e => e.stopPropagation()}>
                        {c.status === 'completed' && (
                          <VdfButton
                            variant="outline"
                            size="sm"
                            onClick={() => handleRollback(c.id)}
                            disabled={isRollingBack}
                          >
                            Rollback
                          </VdfButton>
                        )}
                      </td>
                    </tr>

                    {/* Expanded step detail */}
                    {expandedId === c.id && (
                      <tr className={s.expandedRow}>
                        <td colSpan={9} className={s.expandedCell}>
                          <div className={s.expandedContent}>
                            <div className={s.expandedLeft}>
                              <div className={s.expandedSectionTitle}>Migration Steps</div>
                              <StepTracker correction={c} />
                            </div>
                            {(c.notes || c.error_message) && (
                              <div className={s.expandedRight}>
                                {c.notes && (
                                  <div className={s.expandedNote}>
                                    <div className={s.expandedNoteLabel}>Notes</div>
                                    <div className={s.expandedNoteText}>{c.notes}</div>
                                  </div>
                                )}
                                {c.error_message && (
                                  <div className={s.expandedError}>
                                    <div className={s.expandedNoteLabel}>Error</div>
                                    <div className={s.expandedErrorText}>{c.error_message}</div>
                                  </div>
                                )}
                                {c.rolled_back_at && (
                                  <div className={s.expandedNote}>
                                    <div className={s.expandedNoteLabel}>Rolled back</div>
                                    <div className={s.expandedNoteText}>{fmtDate(c.rolled_back_at)}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ── New correction modal ── */}
      <VdfModal
        isOpen={showNewForm}
        onClose={() => setShowNewForm(false)}
        title="New Course Correction"
        width="md"
      >
        <NewCorrectionForm
          onClose={() => setShowNewForm(false)}
          onSuccess={handleNewSuccess}
        />
      </VdfModal>

    </div>
  );
}
