'use client';

/**
 * TransactionDetailDrawer — full detail panel for a single transaction.
 * Opened when the user clicks "View →" on a TransactionCard.
 * Uses VdfDrawer for the slide-in panel.
 */

import { VdfDrawer, VdfStatusBadge } from '@/components/vdf';
import type { TransactionCardItem } from './TransactionCard';
import { fmtAmount } from './TransactionCard';
import s from './TransactionDetailDrawer.module.css';

/* ── Helpers ──────────────────────────────────────────── */

const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  PURCHASE:            'success',
  SIP:                 'success',
  REDEMPTION:          'danger',
  SWP:                 'danger',
  'SWITCH IN':         'info',
  'STP IN':            'info',
  'SWITCH OUT':        'warning',
  'STP OUT':           'warning',
  'DIVIDEND PAYOUT':   'muted',
  'DIVIDEND REINVEST': 'muted',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/* ── Detail row ───────────────────────────────────────── */

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className={s.detailRow}>
      <span className={s.detailLabel}>{label}</span>
      <span className={`${s.detailValue} ${mono ? s.detailMono : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

/* ── Section header ───────────────────────────────────── */

function Section({ title }: { title: string }) {
  return <div className={s.section}>{title}</div>;
}

/* ── Drawer component ─────────────────────────────────── */

interface Props {
  txn:     TransactionCardItem | null;
  onClose: () => void;
}

export function TransactionDetailDrawer({ txn, onClose }: Props) {
  const isIn       = txn?.flow_direction === 'IN';
  const isDupe     = txn?.is_potential_duplicate ?? false;
  const isExcluded = !(txn?.portfolio_flag ?? true);

  return (
    <VdfDrawer
      isOpen={txn != null}
      onClose={onClose}
      title={txn?.fund_name ?? txn?.scheme_code ?? 'Transaction'}
      subtitle={txn ? fmtDate(txn.txn_date) : undefined}
      width={520}
    >
      {txn && (
        <div className={s.content}>

          {/* ── Status flags ── */}
          {(isDupe || isExcluded) && (
            <div className={s.flags}>
              {isDupe && (
                <span className={s.flagDupe}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="11" height="11">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Potential Duplicate
                </span>
              )}
              {isExcluded && (
                <span className={s.flagExcluded}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="11" height="11">
                    <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  Excluded from Portfolio
                </span>
              )}
            </div>
          )}

          {/* ── Big amount display ── */}
          <div className={s.amountDisplay}>
            <span className={`${s.amountValue} ${isIn ? s.amountIn : s.amountOut}`}>
              {isIn ? '+' : '−'}{fmtAmount(txn.amount)}
            </span>
            <VdfStatusBadge
              label={txn.txn_type_label}
              variant={TYPE_VARIANT[txn.txn_type] ?? 'muted'}
              size="sm"
            />
          </div>

          {/* ── Scheme info ── */}
          <Section title="Scheme" />
          <DetailRow label="Fund Name" value={txn.fund_name ?? txn.scheme_code} />
          {txn.category && <DetailRow label="Category" value={txn.category} />}
          {txn.folio_no && <DetailRow label="Folio No." value={txn.folio_no} mono />}
          <DetailRow label="Scheme Code" value={txn.scheme_code} mono />

          {/* ── Transaction details ── */}
          <Section title="Transaction" />
          <DetailRow label="Date" value={fmtDateShort(txn.txn_date)} />
          <DetailRow label="Type" value={txn.txn_type_label} />
          <DetailRow
            label="Units"
            value={
              txn.units != null
                ? txn.units.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                : null
            }
            mono
          />
          <DetailRow
            label="NAV"
            value={txn.nav != null ? `₹${txn.nav.toFixed(4)}` : null}
            mono
          />

          {/* ── Charges ── */}
          {(txn.tds > 0 || txn.stamp_duty != null || txn.stt != null) && (
            <>
              <Section title="Charges" />
              {txn.tds > 0          && <DetailRow label="TDS"        value={`₹${txn.tds.toFixed(2)}`}        mono />}
              {txn.stamp_duty != null && <DetailRow label="Stamp Duty" value={`₹${txn.stamp_duty.toFixed(2)}`} mono />}
              {txn.stt        != null && <DetailRow label="STT"        value={`₹${txn.stt.toFixed(2)}`}        mono />}
            </>
          )}

          {/* ── Compliance ── */}
          {(txn.euin || txn.arn || txn.sip_reg_date) && (
            <>
              <Section title="Compliance" />
              {txn.euin         && <DetailRow label="EUIN"            value={txn.euin}                         mono />}
              {txn.arn          && <DetailRow label="ARN"             value={txn.arn}                          mono />}
              {txn.sip_reg_date && <DetailRow label="SIP Reg. Date"   value={fmtDateShort(txn.sip_reg_date)} />}
            </>
          )}

          {/* ── Client (shown in global view) ── */}
          {txn.client_name && (
            <>
              <Section title="Client" />
              <DetailRow label="Name"      value={`${txn.client_prefix ?? ''} ${txn.client_name}`.trim()} />
              {txn.client_no  && <DetailRow label="Client No."  value={txn.client_no}  mono />}
              {txn.ext_ref_id && <DetailRow label="IWELL Code"  value={txn.ext_ref_id} mono />}
            </>
          )}

          {/* ── Source / notes ── */}
          {(txn.source || txn.description) && (
            <>
              <Section title="Source" />
              {txn.source      && <DetailRow label="Source"      value={txn.source} />}
              {txn.description && <DetailRow label="Description" value={txn.description} />}
            </>
          )}

          {/* ── Import session ── */}
          {txn.import_session_id != null && (
            <>
              <Section title="Import" />
              <DetailRow label="Session #" value={String(txn.import_session_id)} mono />
            </>
          )}

          {/* ── Portfolio flag (read-only indicator) ── */}
          <Section title="Portfolio" />
          <DetailRow
            label="Included in Portfolio"
            value={
              <span style={{ color: txn.portfolio_flag ? 'var(--color-success)' : 'var(--color-muted)' }}>
                {txn.portfolio_flag ? '✓ Yes' : '⊘ No (excluded)'}
              </span>
            }
          />

        </div>
      )}
    </VdfDrawer>
  );
}
