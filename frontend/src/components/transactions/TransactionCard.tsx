'use client';

/**
 * TransactionCard — reusable card for a single transaction row.
 * Used in:
 *   - /transactions (global view, showClient=true)
 *   - /customers/[id] → Transactions tab (showClient=false)
 */

import { VdfStatusBadge } from '@/components/vdf';
import s from './TransactionCard.module.css';

/* ── Shared Transaction shape ─────────────────────────── */

export interface TransactionCardItem {
  id:                     number;
  txn_date:               string;
  txn_type:               string;
  txn_type_label:         string;
  flow_direction:         string;
  amount:                 number;
  units:                  number | null;
  nav:                    number | null;
  folio_no:               string | null;
  fund_name:              string | null;
  category:               string | null;
  scheme_code:            string;
  tds:                    number;
  stamp_duty:             number | null;
  stt:                    number | null;
  euin:                   string | null;
  arn:                    string | null;
  sip_reg_date:           string | null;
  source:                 string | null;
  description:            string | null;
  is_potential_duplicate: boolean;
  portfolio_flag:         boolean;
  import_session_id:      number | null;
  // client fields — present in global view, optional in client tab
  client_id?:             number;
  client_name?:           string;
  client_prefix?:         string;
  client_no?:             string | null;
  ext_ref_id?:            string | null;
}

/* ── Constants ─────────────────────────────────────────── */

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

/* ── Helpers ─────────────────────────────────────────────*/

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

export function fmtAmount(n: number): string {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/* ── Component ─────────────────────────────────────────── */

interface Props {
  txn:            TransactionCardItem;
  /** Show client column — true in global view, false in client tab */
  showClient?:    boolean;
  onView:         (txn: TransactionCardItem) => void;
  onClientClick?: (clientId: number) => void;
}

export function TransactionCard({
  txn,
  showClient = true,
  onView,
  onClientClick,
}: Props) {
  const isIn       = txn.flow_direction === 'IN';
  const isDupe     = txn.is_potential_duplicate;
  const isExcluded = !txn.portfolio_flag;

  return (
    <div
      className={[
        s.card,
        isDupe     ? s.cardDupe     : '',
        isExcluded ? s.cardExcluded : '',
      ].filter(Boolean).join(' ')}
    >

      {/* ── Header row: date · type · flags · View ── */}
      <div className={s.header}>
        <span className={s.date}>{fmtDate(txn.txn_date)}</span>

        <VdfStatusBadge
          label={txn.txn_type_label}
          variant={TYPE_VARIANT[txn.txn_type] ?? 'muted'}
          size="sm"
        />

        {isDupe && (
          <span className={s.flagDupe} title="Potential duplicate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="10" height="10">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Duplicate
          </span>
        )}

        {isExcluded && (
          <span className={s.flagExcluded} title="Excluded from portfolio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="10" height="10">
              <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            Excluded
          </span>
        )}

        <button className={s.viewBtn} onClick={() => onView(txn)}>
          View
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Body: data columns ── */}
      <div className={showClient ? s.bodyWithClient : s.bodyNoClient}>

        {/* CLIENT — global view only */}
        {showClient && (
          <div className={s.col}>
            <div className={s.colLabel}>Client</div>
            {txn.client_name ? (
              <button
                className={s.clientName}
                onClick={() => onClientClick?.(txn.client_id!)}
              >
                {txn.client_prefix ? `${txn.client_prefix} ` : ''}{txn.client_name}
              </button>
            ) : (
              <span className={s.na}>—</span>
            )}
            {(txn.ext_ref_id || txn.client_no) && (
              <div className={s.clientSub}>
                IW: {txn.ext_ref_id ?? txn.client_no}
              </div>
            )}
          </div>
        )}

        {/* SCHEME */}
        <div className={s.col}>
          <div className={s.colLabel}>Scheme</div>
          <div className={s.fundName}>{txn.fund_name ?? txn.scheme_code}</div>
          {txn.category && <div className={s.fundSub}>{txn.category}</div>}
          {txn.folio_no && <div className={s.fundSub}>Folio {txn.folio_no}</div>}
        </div>

        {/* AMOUNT */}
        <div className={s.col}>
          <div className={s.colLabel}>Amount</div>
          <div className={`${s.amount} ${isIn ? s.amountIn : s.amountOut}`}>
            {isIn ? '+' : '−'}{fmtAmount(txn.amount)}
          </div>
          {txn.tds > 0 && (
            <div className={s.sub}>TDS ₹{txn.tds.toFixed(2)}</div>
          )}
        </div>

        {/* UNITS */}
        <div className={s.col}>
          <div className={s.colLabel}>Units</div>
          {txn.units != null ? (
            <div className={s.mono}>
              {txn.units.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            </div>
          ) : (
            <span className={s.na}>—</span>
          )}
        </div>

        {/* NAV */}
        <div className={s.col}>
          <div className={s.colLabel}>NAV</div>
          {txn.nav != null ? (
            <div className={s.mono}>₹{txn.nav.toFixed(4)}</div>
          ) : (
            <span className={s.na}>—</span>
          )}
        </div>

      </div>
    </div>
  );
}
