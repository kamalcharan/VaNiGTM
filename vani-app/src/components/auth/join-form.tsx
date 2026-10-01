'use client';

/**
 * Join — the page an invitation link opens (/join/<token>).
 *
 * The person was invited by someone already in a workspace, so this is NOT
 * signup: no access phrase, no organisation field, and the email is fixed to
 * the one the link was made for (the server ignores any other). The account is
 * created inside the inviting workspace and signed straight in.
 *
 * Five states: reading the link (loader) · the link cannot be used (the
 * server's reason, and what to do) · the form · submitting · joined (toast,
 * then the dashboard).
 */

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { ApiError, apiRequest } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { formatDate } from '@/lib/format';
import { InlineLoader, useToast } from '@/platform/feedback';
import VaniMark from './vani-mark';
import styles from './auth-card.module.css';

const RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: '8+ characters', test: (pw) => pw.length >= 8 && pw.length <= 128 },
  { label: '1 uppercase', test: (pw) => /[A-Z]/.test(pw) },
  { label: '1 number', test: (pw) => /[0-9]/.test(pw) },
];

interface Invitation {
  email: string;
  workspace_name: string;
  role: string;
  invited_by: string | null;
  expires_at: string;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'refused'; message: string; code?: string }
  | { kind: 'ready'; invitation: Invitation };

export default function JoinForm() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? '');
  const { join, user } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiRequest<{ invitation: Invitation }>(
          API.auth.invitationPreview.method,
          `${API.auth.invitationPreview.path}/${encodeURIComponent(token)}`,
          { authenticated: false },
        );
        if (!cancelled) setLoad({ kind: 'ready', invitation: r.invitation });
      } catch (err) {
        if (cancelled) return;
        setLoad({
          kind: 'refused',
          message: err instanceof ApiError ? err.message : 'Could not reach VaNi to read this invitation. Check your connection and reload.',
          code: err instanceof ApiError ? err.code : undefined,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const rulesMet = RULES.map((r) => r.test(password));
  const passwordOk = rulesMet.every(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || load.kind !== 'ready') return;
    if (name.trim().length < 2) { setError('Enter your full name.'); return; }
    if (!passwordOk) { setError('Your password does not meet all three rules below.'); return; }

    setError('');
    setBusy(true);
    try {
      await join({ token, name: name.trim(), password });
      toast.success(
        `You have joined ${load.invitation.workspace_name}.`,
        `Signed in as ${load.invitation.email}.`,
      );
      router.replace('/dashboard');
    } catch (err) {
      setPassword('');
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.glow} />
      <div className={styles.mesh} />

      <div className={styles.card}>
        <div className={styles.brand}>
          <VaniMark className={styles.mark} />
          <div className={styles.word}>VaNi</div>
          <div className={styles.kicker}>Join a workspace</div>
        </div>

        {load.kind === 'loading' && <InlineLoader size="md" message="Reading your invitation…" />}

        {load.kind === 'refused' && (
          <>
            <div className={styles.error} role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{load.message}</span>
            </div>
            <div className={styles.alt}>
              {load.code === 'INVITE_USED' || load.code === 'EMAIL_EXISTS' ? 'Have an account?' : 'Already joined?'}
              <Link className={styles.altLink} href="/login">Sign in</Link>
            </div>
          </>
        )}

        {load.kind === 'ready' && (
          <>
            <p className={styles.lead}>
              {load.invitation.invited_by ? `${load.invitation.invited_by} invited you` : 'You are invited'} to{' '}
              <strong>{load.invitation.workspace_name}</strong> as {load.invitation.role}. Set your name and a
              password to join.
            </p>

            {user && user.email.toLowerCase() !== load.invitation.email.toLowerCase() && (
              <p className={styles.foot}>
                You are signed in as {user.email}. Joining signs you in as {load.invitation.email} instead.
              </p>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="join-email">Email</label>
                <input id="join-email" className={styles.input} type="email" value={load.invitation.email}
                  readOnly autoComplete="username" />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="join-name">Your name</label>
                <input id="join-name" className={styles.input} type="text" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace"
                  autoComplete="name" autoFocus disabled={busy} />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="join-password">Password</label>
                <div className={styles.pwWrap}>
                  <input id="join-password" className={styles.input} type={showPw ? 'text' : 'password'}
                    value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    autoComplete="new-password" disabled={busy} />
                  <button type="button" className={styles.reveal} onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className={styles.rules}>
                {RULES.map((rule, i) => (
                  <span key={rule.label} className={`${styles.rule} ${rulesMet[i] ? styles.ruleMet : ''}`}>
                    {rulesMet[i] ? '✓' : '○'} {rule.label}
                  </span>
                ))}
              </div>

              {error && (
                <div className={styles.error} role="alert">
                  <span aria-hidden="true">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className={styles.submit} disabled={busy}>
                {busy ? 'Joining…' : `Join ${load.invitation.workspace_name}`}
              </button>
            </form>

            <p className={styles.foot}>
              This link works once, for {load.invitation.email}, until {formatDate(load.invitation.expires_at)}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
