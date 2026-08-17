'use client';

/**
 * The signup gate.
 *
 * VaNi is operator-provisioned: accounts are not open to the public. But
 * "provisioned" does not have to mean an operator types every account by hand.
 * Whoever is given the phrase can create their own tenant; whoever is not never
 * sees the form.
 *
 * The check is client-side and so is the guard on /signup — see lib/gate.ts for
 * what that does and does not buy. This screen is a front door, not a lock.
 */

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { checkGatePhrase, markGatePassed } from '@/lib/gate';
import VaniMark from './vani-mark';
import styles from './auth-card.module.css';

export default function GateForm() {
  const router = useRouter();
  const [phrase, setPhrase] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setError('');
    setBusy(true);

    const ok = await checkGatePhrase(phrase);
    if (!ok) {
      setPhrase('');
      setError('That phrase is not recognised.');
      setBusy(false);
      return;
    }

    markGatePassed();
    router.replace('/signup');
  }

  return (
    <div className={styles.screen}>
      <div className={styles.glow} />
      <div className={styles.mesh} />

      <div className={styles.card}>
        <div className={styles.brand}>
          <VaniMark className={styles.mark} />
          <div className={styles.word}>VaNi</div>
          <div className={styles.kicker}>Access Phrase</div>
        </div>

        <p className={styles.lead}>
          VaNi is not open to the public. If someone at Vikuna gave you an access
          phrase, enter it here to create your organisation.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="vani-gate">
              Access phrase
            </label>
            <div className={styles.pwWrap}>
              <input
                id="vani-gate"
                className={styles.input}
                type={show ? 'text' : 'password'}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                disabled={busy}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide phrase' : 'Show phrase'}
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className={styles.error} role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>

        <p className={styles.foot}>
          No phrase? Ask the person at Vikuna who invited you — we do not issue
          them on request from this screen.
        </p>

        <div className={styles.alt}>
          Already have an account?
          <Link className={styles.altLink} href="/login">
            Sign in
          </Link>
        </div>

        <Link className={styles.back} href="/">
          ← What is VaNi?
        </Link>
      </div>
    </div>
  );
}
