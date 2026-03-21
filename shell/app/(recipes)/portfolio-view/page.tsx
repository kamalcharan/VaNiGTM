/**
 * KI-32: Portfolio View — Priority 2
 *
 * Recipe: portfolio-view (dashboard-3row layout)
 * Skills: portfolio-skill/get_holdings + portfolio-skill/get_allocation
 * Also:   portfolio-skill/get_portfolio_summary for KPI row
 *
 * Requires client_id (from URL search params or route context).
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { useSkills } from '../../../hooks/use-skill';
import { SkillLoading } from '../../../components/skill-loading';
import { SkillError } from '../../../components/skill-error';

interface HoldingItem {
  scheme_name: string;
  scheme_code: string;
  category: string;
  units: number;
  nav: number;
  value: number;
  invested: number;
  gain_loss: number;
  gain_pct: number;
}

interface AllocationItem {
  category: string;
  value: number;
  percentage: number;
  scheme_count: number;
}

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function KpiCard({ label, value, variant }: { label: string; value: string; variant?: 'positive' | 'negative' | 'neutral' }) {
  const color =
    variant === 'positive' ? 'var(--success, #22c55e)' :
    variant === 'negative' ? 'var(--error, #ef4444)' :
    'var(--text-primary, #111827)';

  return (
    <div style={{
      padding: '1rem 1.25rem',
      borderRadius: '0.5rem',
      background: 'var(--card-bg, #fff)',
      border: '1px solid var(--border-color, #e5e7eb)',
    }}>
      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '1.25rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  );
}

const ALLOCATION_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#6b7280'];

export default function PortfolioViewPage() {
  const searchParams = useSearchParams();
  const clientId = Number(searchParams.get('client_id')) || 1;

  const { data, loading, errors, hasErrors } = useSkills(
    {
      holdings: { skill: 'portfolio-skill', fn: 'get_holdings', params: { client_id: clientId } },
      allocation: { skill: 'portfolio-skill', fn: 'get_allocation', params: { client_id: clientId } },
    },
    [clientId]
  );

  if (loading) return <SkillLoading message="Loading portfolio..." />;
  if (hasErrors) {
    const msg = Object.values(errors).join('; ');
    return <SkillError error={msg} />;
  }

  const holdings: HoldingItem[] = data.holdings?.holdings || [];
  const summary = data.holdings?.summary || { total_value: 0, total_invested: 0, overall_gain_pct: 0, scheme_count: 0 };
  const allocation: AllocationItem[] = data.allocation?.allocation || [];

  const gainVariant = summary.overall_gain_pct >= 0 ? 'positive' : 'negative';

  return (
    <div className="recipe-page recipe-portfolio-view">
      <header style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Portfolio Overview</h1>
      </header>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', padding: '1.5rem' }}>
        <KpiCard label="Current Value" value={formatCurrency(summary.total_value)} />
        <KpiCard label="Total Invested" value={formatCurrency(summary.total_invested)} />
        <KpiCard label="Overall Gain" value={formatPct(summary.overall_gain_pct)} variant={gainVariant} />
        <KpiCard label="Schemes" value={String(summary.scheme_count)} />
      </div>

      {/* Allocation + Holdings */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', padding: '0 1.5rem 1.5rem' }}>
        {/* Allocation breakdown */}
        <div style={{
          padding: '1rem',
          borderRadius: '0.5rem',
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border-color, #e5e7eb)',
        }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>Asset Allocation</h3>
          {allocation.map((a, i) => (
            <div key={a.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                  display: 'inline-block',
                }} />
                <span style={{ fontSize: '0.8rem' }}>{a.category}</span>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {a.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
          {allocation.length === 0 && (
            <p style={{ color: 'var(--text-secondary, #6b7280)', fontSize: '0.8rem' }}>No allocation data</p>
          )}
        </div>

        {/* Holdings table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                <th style={thStyle}>Scheme</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Units</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>NAV</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Invested</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Gain/Loss</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Return</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const gainColor = h.gain_pct >= 0 ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)';
                return (
                  <tr key={h.scheme_code} style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{h.scheme_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #6b7280)' }}>{h.category}</div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{h.units.toFixed(3)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>₹{h.nav.toFixed(2)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(h.value)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(h.invested)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: gainColor }}>{formatCurrency(h.gain_loss)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: gainColor, fontWeight: 600 }}>{formatPct(h.gain_pct)}</td>
                  </tr>
                );
              })}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    No holdings found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.5rem',
  fontWeight: 600,
  color: 'var(--text-secondary, #6b7280)',
  whiteSpace: 'nowrap',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.5rem',
  verticalAlign: 'middle',
};
