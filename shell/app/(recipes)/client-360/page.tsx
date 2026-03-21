/**
 * KI-32: Client 360 — Priority 3
 *
 * Recipe: client-360 (detail-sidebar layout)
 * Skills: client-skill/get_client_profile + portfolio-skill/get_portfolio_summary
 *
 * Requires client_id (from URL search params).
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { useSkills } from '../../../hooks/use-skill';
import { SkillLoading } from '../../../components/skill-loading';
import { SkillError } from '../../../components/skill-error';

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function RiskBadge({ profile }: { profile: string | null }) {
  if (!profile) return <span>—</span>;
  const colorMap: Record<string, string> = {
    conservative: '#22c55e', moderate: '#eab308', aggressive: '#ef4444',
  };
  const color = colorMap[profile.toLowerCase()] || '#6b7280';
  return (
    <span style={{
      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem',
      fontWeight: 500, background: `${color}18`, color, textTransform: 'capitalize',
    }}>{profile}</span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '0.75rem 1rem',
      borderRadius: '0.5rem',
      background: 'var(--card-bg, #fff)',
      border: '1px solid var(--border-color, #e5e7eb)',
    }}>
      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ margin: '0.15rem 0 0', fontSize: '1.1rem', fontWeight: 700, color: color || 'var(--text-primary, #111827)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

export default function Client360Page() {
  const searchParams = useSearchParams();
  const clientId = Number(searchParams.get('client_id')) || 1;

  const { data, loading, errors, hasErrors } = useSkills(
    {
      profile: { skill: 'client-skill', fn: 'get_client_profile', params: { client_id: clientId } },
      portfolio: { skill: 'portfolio-skill', fn: 'get_portfolio_summary', params: { client_id: clientId } },
    },
    [clientId]
  );

  if (loading) return <SkillLoading message="Loading client profile..." />;
  if (hasErrors) {
    const msg = Object.values(errors).join('; ');
    return <SkillError error={msg} />;
  }

  const profile = data.profile;
  const portfolio = data.portfolio;

  if (!profile) return <SkillError error="Client not found" />;

  const ps = profile.portfolio_summary || {};
  const gs = profile.goals_summary || {};
  const rp = profile.risk_profile || {};

  return (
    <div className="recipe-page recipe-client-360">
      {/* Hero header */}
      <header style={{
        padding: '1.5rem',
        borderBottom: '1px solid var(--border-color, #e5e7eb)',
        display: 'flex', alignItems: 'center', gap: '1.5rem',
      }}>
        <div style={{
          width: '3.5rem', height: '3.5rem', borderRadius: '50%',
          background: 'var(--primary, #3b82f6)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.25rem', fontWeight: 700,
        }}>
          {profile.name?.charAt(0) || '?'}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{profile.name}</h1>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #6b7280)' }}>
            {[profile.email, profile.phone].filter(Boolean).join(' · ') || 'No contact info'}
          </p>
        </div>
        <RiskBadge profile={rp.overall} />
      </header>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', padding: '1.25rem 1.5rem' }}>
        <StatCard label="Portfolio Value" value={formatCurrency(ps.total_value || 0)} />
        <StatCard
          label="Return"
          value={formatPct(ps.return_pct || 0)}
          color={(ps.return_pct || 0) >= 0 ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)'}
        />
        <StatCard label="Goals On Track" value={`${gs.on_track || 0} / ${gs.total_goals || 0}`} />
        <StatCard label="Schemes" value={String(ps.scheme_count || 0)} />
      </div>

      {/* Detail grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', padding: '0 1.5rem 1.5rem' }}>
        {/* Personal info */}
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.5rem',
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border-color, #e5e7eb)',
        }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Personal Details</h3>
          <dl style={{ margin: 0, fontSize: '0.8rem', display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '0.4rem' }}>
            {profile.pan && <><dt style={dtStyle}>PAN</dt><dd style={ddStyle}>{profile.pan}</dd></>}
            {profile.dob && <><dt style={dtStyle}>DOB</dt><dd style={ddStyle}>{profile.dob}</dd></>}
            {profile.occupation && <><dt style={dtStyle}>Occupation</dt><dd style={ddStyle}>{profile.occupation}</dd></>}
            {profile.annual_income && <><dt style={dtStyle}>Annual Income</dt><dd style={ddStyle}>{formatCurrency(profile.annual_income)}</dd></>}
            {profile.address && <><dt style={dtStyle}>Address</dt><dd style={ddStyle}>{profile.address}</dd></>}
          </dl>
        </div>

        {/* Goals summary */}
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.5rem',
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border-color, #e5e7eb)',
        }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Goals Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <StatCard label="On Track" value={String(gs.on_track || 0)} color="var(--success, #22c55e)" />
            <StatCard label="At Risk" value={String(gs.at_risk || 0)} color="var(--warning, #eab308)" />
            <StatCard label="Behind" value={String(gs.behind || 0)} color="var(--error, #ef4444)" />
            <StatCard label="Total Goals" value={String(gs.total_goals || 0)} />
          </div>
        </div>

        {/* Portfolio performers (from portfolio-skill) */}
        {portfolio && (
          <div style={{
            gridColumn: '1 / -1',
            padding: '1rem 1.25rem',
            borderRadius: '0.5rem',
            background: 'var(--card-bg, #fff)',
            border: '1px solid var(--border-color, #e5e7eb)',
          }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Portfolio Performance</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--success, #22c55e)', textTransform: 'uppercase' }}>Top Performers</h4>
                {(portfolio.top_performers || []).map((p: any) => (
                  <div key={p.scheme_name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: '0.8rem' }}>
                    <span>{p.scheme_name}</span>
                    <span style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>{formatPct(p.gain_pct)}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--error, #ef4444)', textTransform: 'uppercase' }}>Needs Attention</h4>
                {(portfolio.bottom_performers || []).map((p: any) => (
                  <div key={p.scheme_name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: '0.8rem' }}>
                    <span>{p.scheme_name}</span>
                    <span style={{ color: p.gain_pct < 0 ? 'var(--error, #ef4444)' : 'var(--text-secondary)', fontWeight: 600 }}>{formatPct(p.gain_pct)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const dtStyle: React.CSSProperties = {
  color: 'var(--text-secondary, #6b7280)',
  fontWeight: 500,
};

const ddStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-primary, #111827)',
};
