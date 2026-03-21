/**
 * KI-32: Scheme Explorer — Priority 5
 *
 * Recipe: scheme-explorer (list-detail layout)
 * Skills: market-skill/search_schemes + market-skill/get_nav_history
 */

'use client';

import { useState } from 'react';
import { useSkill } from '../../../hooks/use-skill';
import { callSkill } from '../../../lib/skill-client';
import { SkillLoading } from '../../../components/skill-loading';
import { SkillError } from '../../../components/skill-error';

interface SchemeItem {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  nav: number | null;
  nav_date: string | null;
}

interface SearchResult {
  results: SchemeItem[];
  total_matches: number;
}

interface NavPoint {
  date: string;
  nav: number;
}

interface NavHistoryData {
  scheme_code: string;
  scheme_name: string;
  data: NavPoint[];
  period_return_pct: number;
}

export default function SchemeExplorerPage() {
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedScheme, setSelectedScheme] = useState<string | null>(null);
  const [navData, setNavData] = useState<NavHistoryData | null>(null);
  const [navLoading, setNavLoading] = useState(false);

  const { data, loading, error } = useSkill<SearchResult>(
    'market-skill',
    'search_schemes',
    { query: searchTerm || 'fund', limit: 20 },
    [searchTerm]
  );

  const handleSearch = () => {
    setSearchTerm(query);
  };

  const handleSchemeClick = async (schemeCode: string) => {
    setSelectedScheme(schemeCode);
    setNavLoading(true);

    const today = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      const res = await callSkill<NavHistoryData>('market-skill', 'get_nav_history', {
        scheme_code: schemeCode,
        from_date: oneYearAgo,
        to_date: today,
      });
      if (res.success) {
        setNavData(res.data);
      }
    } finally {
      setNavLoading(false);
    }
  };

  return (
    <div className="recipe-page recipe-scheme-explorer">
      <header style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Scheme Explorer</h1>
      </header>

      {/* Search bar */}
      <div style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Search schemes by name, AMC, or category..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
        <button
          onClick={handleSearch}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: 'none',
            background: 'var(--primary, #3b82f6)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Search
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedScheme ? '1fr 350px' : '1fr', gap: '1.5rem', padding: '0 1.5rem 1.5rem' }}>
        {/* Search results table */}
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <SkillLoading message="Searching schemes..." />
          ) : error ? (
            <SkillError error={error} />
          ) : (
            <>
              {data && (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary, #6b7280)' }}>
                  {data.total_matches} scheme{data.total_matches !== 1 ? 's' : ''} found
                </p>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                    <th style={thStyle}>Scheme Name</th>
                    <th style={thStyle}>AMC</th>
                    <th style={thStyle}>Category</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>NAV</th>
                    <th style={thStyle}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.results || []).map((scheme) => (
                    <tr
                      key={scheme.scheme_code}
                      onClick={() => handleSchemeClick(scheme.scheme_code)}
                      style={{
                        borderBottom: '1px solid var(--border-color, #f3f4f6)',
                        cursor: 'pointer',
                        background: selectedScheme === scheme.scheme_code ? 'var(--primary-light, #eff6ff)' : 'transparent',
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500 }}>{scheme.scheme_name}</span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary, #6b7280)' }}>{scheme.amc}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '0.1rem 0.4rem', borderRadius: '4px',
                          fontSize: '0.75rem', background: 'var(--bg-muted, #f3f4f6)',
                        }}>{scheme.category}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {scheme.nav !== null ? `₹${scheme.nav.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.8rem', color: 'var(--text-secondary, #6b7280)' }}>
                        {scheme.nav_date || '—'}
                      </td>
                    </tr>
                  ))}
                  {(!data?.results || data.results.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                        No schemes found. Try a different search term.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* NAV history sidebar */}
        {selectedScheme && (
          <div style={{
            padding: '1rem',
            borderRadius: '0.5rem',
            background: 'var(--card-bg, #fff)',
            border: '1px solid var(--border-color, #e5e7eb)',
            alignSelf: 'start',
          }}>
            {navLoading ? (
              <SkillLoading message="Loading NAV history..." />
            ) : navData ? (
              <>
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 600 }}>{navData.scheme_name}</h3>
                <p style={{
                  margin: '0 0 0.75rem',
                  fontSize: '0.8rem',
                  color: navData.period_return_pct >= 0 ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                  fontWeight: 600,
                }}>
                  1Y Return: {navData.period_return_pct >= 0 ? '+' : ''}{navData.period_return_pct.toFixed(2)}%
                </p>

                {/* Simple text-based NAV data display */}
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                        <th style={{ ...thStyle, fontSize: '0.7rem' }}>Date</th>
                        <th style={{ ...thStyle, fontSize: '0.7rem', textAlign: 'right' }}>NAV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {navData.data.slice(-20).reverse().map((point) => (
                        <tr key={point.date} style={{ borderBottom: '1px solid var(--border-color, #f9fafb)' }}>
                          <td style={{ padding: '0.3rem 0.25rem' }}>{point.date}</td>
                          <td style={{ padding: '0.3rem 0.25rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            ₹{point.nav.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {navData.data.length > 20 && (
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary, #6b7280)', marginTop: '0.5rem' }}>
                      Showing latest 20 of {navData.data.length} data points
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-secondary, #6b7280)', fontSize: '0.85rem' }}>
                Click a scheme to view NAV history
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.4rem',
  fontWeight: 600,
  color: 'var(--text-secondary, #6b7280)',
  whiteSpace: 'nowrap',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.4rem',
  verticalAlign: 'middle',
};
