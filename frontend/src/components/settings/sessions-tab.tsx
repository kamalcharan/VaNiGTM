'use client';

import { useSessions } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { FullPageLoader } from '@/components/loader';
import { useState } from 'react';
import s from './settings-tabs.module.css';

function deviceIcon(type: string | null): string {
  if (type === 'mobile') return '\uD83D\uDCF1';
  return '\uD83D\uDCBB';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Active now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SessionsTab() {
  const { data, isLoading, refetch } = useSessions();
  const { showToast } = useToast();
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());

  const sessions = data?.sessions || [];

  async function revokeSession(sessionId: string) {
    setRevokingIds((prev) => new Set(prev).add(sessionId));
    try {
      await apiFetch(API.auth.sessionsRevoke, {
        body: { session_ids: [sessionId] },
      });
      showToast({ message: 'Session revoked', type: 'success' });
      refetch();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Revoke failed', type: 'error' });
    } finally {
      setRevokingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }

  if (isLoading) {
    return <FullPageLoader overlay={false} message="Loading sessions..." />;
  }

  if (sessions.length === 0) {
    return (
      <div className={s.card}>
        <div className={s.cardTitle}>Active Sessions</div>
        <div className={s.cardDesc}>Devices currently signed in to your account</div>
        <div className={s.placeholder}>No active sessions found.</div>
      </div>
    );
  }

  return (
    <div className={s.card}>
      <div className={s.cardTitle}>Active Sessions</div>
      <div className={s.cardDesc}>Devices currently signed in to your account</div>

      {sessions.map((sess) => (
        <div key={sess.session_id} className={s.sessionCard}>
          <div className={s.sessionIcon}>{deviceIcon(sess.device_type)}</div>
          <div className={s.sessionInfo}>
            <div className={s.sessionDevice}>
              {sess.browser || 'Unknown'} on {sess.os || 'Unknown'}
            </div>
            <div className={s.sessionMeta}>
              {sess.ip_address && <span>IP: {sess.ip_address}</span>}
              <span>{timeAgo(sess.last_activity_at)}</span>
            </div>
          </div>
          <button
            className={s.sessionRevoke}
            onClick={() => revokeSession(sess.session_id)}
            disabled={revokingIds.has(sess.session_id)}
          >
            {revokingIds.has(sess.session_id) ? 'Revoking...' : 'Revoke'}
          </button>
        </div>
      ))}
    </div>
  );
}
