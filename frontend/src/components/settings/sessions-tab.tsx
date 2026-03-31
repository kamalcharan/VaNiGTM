'use client';

import { useCallback, useEffect, useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/components/toast';
import { FullPageLoader } from '@/components/loader';
import s from './settings-tabs.module.css';

interface Session {
  session_id: string;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  ip_address: string | null;
  last_activity_at: string;
  created_at: string;
  is_current?: boolean;
}

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
  const { apiUrl } = useShellConfig();
  const { getAuthHeaders } = useAuth();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/sessions`, {
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || data || []);
      } else {
        setSessions([]);
      }
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [apiUrl, getAuthHeaders]);

  useEffect(() => {
    fetchSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function revokeSession(sessionId: string) {
    setRevokingIds((prev) => new Set(prev).add(sessionId));
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/sessions/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ session_ids: [sessionId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to revoke session');
      }
      setSessions((prev) => prev.filter((sess) => sess.session_id !== sessionId));
      showToast({ message: 'Session revoked', type: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Revoke failed', type: 'error' });
    } finally {
      setRevokingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }

  if (loadingSessions) {
    return <FullPageLoader overlay={false} message="Loading sessions..." />;
  }

  if (sessions.length === 0) {
    return (
      <div className={s.card}>
        <div className={s.cardTitle}>Active Sessions</div>
        <div className={s.cardDesc}>Devices currently signed in to your account</div>
        <div className={s.placeholder}>
          Session management coming soon. Check back later.
        </div>
      </div>
    );
  }

  return (
    <div className={s.card}>
      <div className={s.cardTitle}>Active Sessions</div>
      <div className={s.cardDesc}>Devices currently signed in to your account</div>

      {sessions.map((sess) => (
        <div
          key={sess.session_id}
          className={`${s.sessionCard} ${sess.is_current ? s.sessionCurrent : ''}`}
        >
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
          {sess.is_current ? (
            <span className={s.sessionBadge}>This device</span>
          ) : (
            <button
              className={s.sessionRevoke}
              onClick={() => revokeSession(sess.session_id)}
              disabled={revokingIds.has(sess.session_id)}
            >
              {revokingIds.has(sess.session_id) ? 'Revoking...' : 'Revoke'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
