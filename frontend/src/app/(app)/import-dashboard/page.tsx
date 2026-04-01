'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { FullPageLoader } from '@/components/loader';
import s from './dashboard-page.module.css';

interface Session {
  id: number;
  import_type: string;
  status: string;
  total_records: number;
  processed_records: number;
  successful_records: number;
  failed_records: number;
  duplicate_records: number;
  original_filename: string;
  created_at: string;
  processing_completed_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'success',
  completed_with_errors: 'warning',
  processing: 'info',
  staged: 'info',
  pending: 'muted',
  failed: 'danger',
  cancelled: 'muted',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ImportDashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<{ sessions: Session[] }>(API.etl.sessions);
        setSessions(data.sessions || []);
      } catch {
        // Failed to load
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <FullPageLoader overlay={false} message="Loading import history..." />;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Import Dashboard</h1>
          <p className={s.subtitle}>Track and manage all your data imports</p>
        </div>
        <button className={s.newBtn} onClick={() => router.push('/import')}>
          + New Import
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h2 className={s.emptyTitle}>No imports yet</h2>
          <p className={s.emptyDesc}>Start by importing your Scheme Master data to build the foundation.</p>
          <button className={s.emptyBtn} onClick={() => router.push('/import')}>
            Import Your First File {'\u2192'}
          </button>
        </div>
      ) : (
        <div className={s.table}>
          <div className={s.tableHeader}>
            <span>File</span>
            <span>Type</span>
            <span>Status</span>
            <span>Records</span>
            <span>Success / Dup / Fail</span>
            <span>When</span>
          </div>
          {sessions.map((sess) => {
            const statusColor = STATUS_COLORS[sess.status] || 'muted';
            return (
              <div key={sess.id} className={s.tableRow}>
                <span className={s.fileName}>{sess.original_filename || `Session #${sess.id}`}</span>
                <span className={s.typeBadge}>{sess.import_type}</span>
                <span className={`${s.statusBadge} ${s[`status_${statusColor}`]}`}>
                  {sess.status.replace(/_/g, ' ')}
                </span>
                <span className={s.recordCount}>
                  {sess.total_records.toLocaleString()}
                </span>
                <span className={s.breakdown}>
                  <span className={s.breakdownOk}>{sess.successful_records.toLocaleString()}</span>
                  {' / '}
                  <span className={s.breakdownDup}>{sess.duplicate_records.toLocaleString()}</span>
                  {' / '}
                  <span className={s.breakdownFail}>{sess.failed_records.toLocaleString()}</span>
                </span>
                <span className={s.timeAgo}>{timeAgo(sess.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
