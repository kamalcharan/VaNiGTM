'use client';

/**
 * Signup — creates a tenant and its first user.
 *
 * Reachable only through the gate; see lib/gate.ts. Someone who lands here
 * without passing it is sent back rather than shown a form that would work.
 *
 * The password rules mirror validateRegisterInput in VaNiGTM's auth.service.ts
 * and are shown live. A 400 from the server should never be the first time
 * someone learns what was required — the server still decides, this just stops
 * the round trip being the teacher.
 */

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { ApiError } from '@/lib/api-client';
import { isGatePassed } from '@/lib/gate';
import VaniMark from './vani-mark';
import styles from './auth-card.module.css';

const RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: '8+ characters', test: (pw) => pw.length >= 8 && pw.length <= 128 },
  { label: '1 uppercase', test: (pw) => /[A-Z]/.test(pw) },
  { label: '1 number', test: (pw) => /[0-9]/.test(pw) },
];

export default function SignupForm() {
  const { signup } = useAuth();
  const router = useRouter();

  // Null until the gate has been checked — rendering the form before then
  // would flash it at someone who is about to be redirected away.
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isGatePassed()) {
      setAllowed(true);
    } else {
      setAllowed(false);
      router.replace('/gate');
    }
  }, [router]);

  const rulesMet = RULES.map((r) => r.test(password));
  const passwordOk = rulesMet.every(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!passwordOk) {
      setError('Your password does not meet all three rules below.');
      return;
    }

    setError('');
    setBusy(true);
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
        tenant_name: org.trim() || undefined,
      });
      // Registration returns a session, so go straight in. No second login.
      router.replace('/dashboard');
    } catch (err) {
      setPassword('');
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setBusy(false);
    }
  }

  if (allowed !== true) return null;

  return (
    <div className={styles.screen}>
      <div className={styles.glow} />
      <div className={styles.mesh} />

      <div className={`${styles.card} ${styles.wide}`}>
        <div className={styles.brand}>
          <VaniMark className={styles.mark} />
          <div className={styles.word}>VaNi</div>
          <div className={styles.kicker}>Create your organisation</div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="vani-name">
                Your name
              </label>
              <input
                id="vani-name"
                className={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
                autoFocus
                disabled={busy}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="vani-org">
                Organisation
              </label>
              <input
                id="vani-org"
                className={styles.input}
                type="text"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="Optional"
                autoComplete="organization"
                disabled={busy}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="vani-email">
              Work email
            </label>
            <input
              id="vani-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="vani-password">
              Password
            </label>
            <div className={styles.pwWrap}>
              <input
                id="vani-password"
                className={styles.input}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={busy}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className={styles.rules}>
            {RULES.map((rule, i) => (
              <span
                key={rule.label}
                className={`${styles.rule} ${rulesMet[i] ? styles.ruleMet : ''}`}
              >
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
            {busy ? 'Creating…' : 'Create organisation'}
          </button>
        </form>

        <p className={styles.foot}>
          This creates a new organisation in VaNi with you as its owner. Leave
          Organisation blank and it will be named after you.
        </p>

        <div className={styles.alt}>
          Already have an account?
          <Link className={styles.altLink} href="/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
