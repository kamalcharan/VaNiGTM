/**
 * KI-32: Goal Dashboard — Priority 4
 *
 * Recipe: goal-dashboard (dashboard-3row layout)
 * Skill:  planning-skill/get_goals
 *
 * Requires client_id (from URL search params).
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { useSkill } from '../../../hooks/use-skill';
import { SkillLoading } from '../../../components/skill-loading';
import { SkillError } from '../../../components/skill-error';

interface GoalItem {
  id: number;
  name: string;
  type: string;
  target_amount: number;
  target_date: string;
  current_corpus: number;
  monthly_sip: number;
  inflation_rate: number;
  expected_return: number;
  probability: number | null;
  status: string;
}

interface GoalDashboardData {
  goals: GoalItem[];
}

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

const STATUS_COLORS: Record<string, string> = {
  on_track: '#22c55e',
  at_risk: '#eab308',
  behind: '#ef4444',
  active: '#3b82f6',
};

function GoalCard({ goal }: { goal: GoalItem }) {
  const statusColor = STATUS_COLORS[goal.status] || '#6b7280';
  const progress = goal.target_amount > 0
    ? Math.min((goal.current_corpus / goal.target_amount) * 100, 100)
    : 0;
  const yearsLeft = Math.max(0,
    (new Date(goal.target_date).getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000)
  );

  return (
    <div style={{
      padding: '1.25rem',
      borderRadius: '0.5rem',
      background: 'var(--card-bg, #fff)',
      border: '1px solid var(--border-color, #e5e7eb)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{goal.name}</h3>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary, #6b7280)', textTransform: 'capitalize' }}>
            {goal.type.replace(/_/g, ' ')}
          </p>
        </div>
        <span style={{
          padding: '0.15rem 0.5rem',
          borderRadius: '9999px',
          fontSize: '0.7rem',
          fontWeight: 600,
          background: `${statusColor}18`,
          color: statusColor,
          textTransform: 'capitalize',
          whiteSpace: 'nowrap',
        }}>
          {goal.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.3rem' }}>
          <span style={{ color: 'var(--text-secondary, #6b7280)' }}>Progress</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{progress.toFixed(1)}%</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-color, #e5e7eb)' }}>
          <div style={{
            height: '100%',
            borderRadius: '3px',
            background: statusColor,
            width: `${progress}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
        <div>
          <p style={{ margin: 0, color: 'var(--text-secondary, #6b7280)', fontSize: '0.7rem' }}>Target</p>
          <p style={{ margin: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(goal.target_amount)}</p>
        </div>
        <div>
          <p style={{ margin: 0, color: 'var(--text-secondary, #6b7280)', fontSize: '0.7rem' }}>Current</p>
          <p style={{ margin: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(goal.current_corpus)}</p>
        </div>
        <div>
          <p style={{ margin: 0, color: 'var(--text-secondary, #6b7280)', fontSize: '0.7rem' }}>Monthly SIP</p>
          <p style={{ margin: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(goal.monthly_sip)}</p>
        </div>
        <div>
          <p style={{ margin: 0, color: 'var(--text-secondary, #6b7280)', fontSize: '0.7rem' }}>Time Left</p>
          <p style={{ margin: 0, fontWeight: 600 }}>{yearsLeft.toFixed(1)} yrs</p>
        </div>
      </div>

      {/* Probability */}
      {goal.probability !== null && (
        <div style={{ textAlign: 'center', padding: '0.5rem 0 0', borderTop: '1px solid var(--border-color, #f3f4f6)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #6b7280)' }}>Success Probability </span>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: statusColor }}>{goal.probability}%</span>
        </div>
      )}
    </div>
  );
}

export default function GoalDashboardPage() {
  const searchParams = useSearchParams();
  const clientId = Number(searchParams.get('client_id')) || 1;

  const { data, loading, error } = useSkill<GoalDashboardData>(
    'planning-skill',
    'get_goals',
    { client_id: clientId },
    [clientId]
  );

  if (loading) return <SkillLoading message="Loading goals..." />;
  if (error) return <SkillError error={error} />;
  if (!data) return <SkillError error="No data returned" />;

  const { goals } = data;

  const onTrack = goals.filter((g) => g.status === 'on_track').length;
  const atRisk = goals.filter((g) => g.status === 'at_risk').length;
  const behind = goals.filter((g) => g.status === 'behind').length;

  return (
    <div className="recipe-page recipe-goal-dashboard">
      <header style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Financial Goals</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #6b7280)' }}>
          {goals.length} goal{goals.length !== 1 ? 's' : ''} ·{' '}
          <span style={{ color: '#22c55e' }}>{onTrack} on track</span>
          {atRisk > 0 && <> · <span style={{ color: '#eab308' }}>{atRisk} at risk</span></>}
          {behind > 0 && <> · <span style={{ color: '#ef4444' }}>{behind} behind</span></>}
        </p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1rem',
        padding: '1.5rem',
      }}>
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
        {goals.length === 0 && (
          <p style={{ color: 'var(--text-secondary, #6b7280)', padding: '2rem', textAlign: 'center' }}>
            No goals found for this client
          </p>
        )}
      </div>
    </div>
  );
}
