/**
 * KI-32: Client List — Priority 1 (verified end-to-end)
 *
 * Recipe: client-list (list-detail layout)
 * Skill:  client-skill/get_clients
 * Data:   { clients: ClientItem[], total: number }
 */

'use client';

import { useState } from 'react';
import { useSkill } from '../../../hooks/use-skill';
import { SkillLoading } from '../../../components/skill-loading';
import { SkillError } from '../../../components/skill-error';
import { resolveDataPath } from '../../../lib/resolve-data-path';

interface ClientItem {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  aum: number;
  sip_count: number;
  active_sips_total: number;
  goals_count: number;
  risk_profile: string | null;
  last_interaction_date: string | null;
  tags: string[];
}

interface ClientListData {
  clients: ClientItem[];
  total: number;
}

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function RiskBadge({ profile }: { profile: string | null }) {
  if (!profile) return <span className="badge badge-muted">—</span>;
  const colorMap: Record<string, string> = {
    conservative: '#22c55e',
    moderate: '#eab308',
    aggressive: '#ef4444',
  };
  const color = colorMap[profile.toLowerCase()] || '#6b7280';
  return (
    <span style={{
      padding: '0.15rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 500,
      background: `${color}18`,
      color,
      textTransform: 'capitalize',
    }}>
      {profile}
    </span>
  );
}

export default function ClientListPage() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data, loading, error } = useSkill<ClientListData>(
    'client-skill',
    'get_clients',
    {
      filters: {
        ...(search ? { search } : {}),
        sort_by: sortBy,
        sort_order: sortOrder,
      },
    },
    [search, sortBy, sortOrder]
  );

  if (loading) return <SkillLoading message="Loading clients..." />;
  if (error) return <SkillError error={error} />;
  if (!data) return <SkillError error="No data returned" />;

  const { clients, total } = data;

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const sortIndicator = (col: string) =>
    sortBy === col ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="recipe-page recipe-client-list">
      <header style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Clients</h1>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #6b7280)', fontSize: '0.875rem' }}>
          {total} client{total !== 1 ? 's' : ''}
        </p>
      </header>

      {/* Filter row */}
      <div style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--border-color, #d1d5db)',
            fontSize: '0.875rem',
            background: 'var(--input-bg, #fff)',
            color: 'var(--text-primary, #111827)',
          }}
        />
      </div>

      {/* Data table */}
      <div style={{ overflowX: 'auto', padding: '0 1.5rem 1.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
              <th onClick={() => handleSort('name')} style={thStyle}>
                Name{sortIndicator('name')}
              </th>
              <th onClick={() => handleSort('aum')} style={{ ...thStyle, textAlign: 'right' }}>
                AUM{sortIndicator('aum')}
              </th>
              <th onClick={() => handleSort('sip_count')} style={{ ...thStyle, textAlign: 'right' }}>
                SIPs{sortIndicator('sip_count')}
              </th>
              <th style={thStyle}>Goals</th>
              <th style={thStyle}>Risk Profile</th>
              <th style={thStyle}>Contact</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)', cursor: 'pointer' }}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 500 }}>{client.name}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(client.aum)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {client.sip_count}
                </td>
                <td style={tdStyle}>
                  {client.goals_count}
                </td>
                <td style={tdStyle}>
                  <RiskBadge profile={client.risk_profile} />
                </td>
                <td style={{ ...tdStyle, fontSize: '0.8rem', color: 'var(--text-secondary, #6b7280)' }}>
                  {client.email || client.phone || '—'}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                  No clients found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.75rem 0.5rem',
  fontWeight: 600,
  color: 'var(--text-secondary, #6b7280)',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 0.5rem',
  verticalAlign: 'middle',
};
