// src/components/vikuna/VaNiLogin.tsx
// Sign-in screen for VaNi.
//
// This is intentionally NOT wired to an auth backend yet. The form is entirely
// local: nothing is fetched, POSTed, stored or logged anywhere, and the entered
// values live only in component state for the lifetime of the page. Every
// submission returns the same generic mismatch, which is the agreed placeholder
// until VaNi's auth is connected.
//
// When wiring this up: replace the body of `handleSubmit` and keep the generic
// error text — telling an attacker which of the two fields was wrong is how
// account enumeration starts.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

// ─── Tokens ──────────────────────────────────────────────────
const INK_DEEP = '#070B16';
const WHITE = '#FFFFFF';
const TEAL = '#12A090';
const GOLD = '#C9973A';
const CRIMSON = '#F87171';
const BORDER = 'rgba(255,255,255,0.14)';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const Screen = styled.div`
  min-height: 100vh;
  background: ${INK_DEEP};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 110px 22px 60px;
  position: relative;
  overflow: hidden;
`;

const Glow = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 46% 44% at 50% 34%, rgba(201, 151, 58, 0.15) 0%, transparent 66%),
    radial-gradient(ellipse 40% 40% at 16% 88%, rgba(18, 160, 144, 0.07) 0%, transparent 62%);
  pointer-events: none;
`;

const Card = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${BORDER};
  border-radius: 14px;
  padding: 40px 36px 32px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5);

  @media (max-width: 480px) {
    padding: 30px 22px 26px;
  }
`;

const Brand = styled.div`
  text-align: center;
  margin-bottom: 30px;
`;

const Mark = styled.svg`
  width: 46px;
  height: 46px;
  margin-bottom: 14px;
`;

const Wordmark = styled.div`
  font-family: 'Fraunces', serif;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -1.6px;
  line-height: 1;
  color: ${WHITE};
  margin-bottom: 8px;
`;

const Kicker = styled.div`
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
`;

const Field = styled.div`
  margin-bottom: 16px;

  label {
    display: block;
    font-family: ${MONO};
    font-size: 10.5px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 7px;
  }

  input {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid ${BORDER};
    border-radius: 6px;
    padding: 12px 14px;
    font-family: ${MONO};
    font-size: 13.5px;
    color: ${WHITE};
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;

    &::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }

    &:focus {
      border-color: rgba(201, 151, 58, 0.6);
      box-shadow: 0 0 0 3px rgba(201, 151, 58, 0.12);
    }
  }
`;

const ErrorBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid rgba(248, 113, 113, 0.36);
  background: rgba(248, 113, 113, 0.09);
  border-radius: 6px;
  padding: 11px 13px;
  margin-bottom: 16px;
  font-family: ${MONO};
  font-size: 11.5px;
  line-height: 1.6;
  color: ${CRIMSON};
`;

const Submit = styled.button`
  width: 100%;
  background: ${GOLD};
  color: ${INK_DEEP};
  border: none;
  border-radius: 6px;
  padding: 13px 18px;
  font-family: ${MONO};
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 0 30px rgba(201, 151, 58, 0.34);
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const NoSignup = styled.p`
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
  font-family: ${MONO};
  font-size: 10.5px;
  line-height: 1.75;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.42);
  text-align: center;
`;

const Back = styled(Link)`
  display: block;
  margin-top: 20px;
  text-align: center;
  font-family: ${MONO};
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;

  &:hover {
    color: ${TEAL};
  }
`;

const VaNiLogin: React.FC = () => {
  const [uid, setUid] = useState('');
  const [pw, setPw] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid.trim() || !pw) {
      setError('Enter both a user ID and a password.');
      return;
    }
    // No auth backend is connected yet. Nothing leaves the browser: the values
    // are never sent, stored or logged — every attempt fails the same way.
    setError('');
    setChecking(true);
    window.setTimeout(() => {
      setChecking(false);
      setPw('');
      setError('User ID and password do not match.');
    }, 650);
  };

  return (
    <Screen>
      <Glow />
      <Card>
        <Brand>
          <Mark viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="3.2" fill={GOLD} />
            <circle cx="16" cy="5.5" r="2.4" fill="none" stroke={GOLD} strokeWidth="1.5" />
            <circle cx="25" cy="21.5" r="2.4" fill="none" stroke={GOLD} strokeWidth="1.5" />
            <circle cx="7" cy="21.5" r="2.4" fill="none" stroke={GOLD} strokeWidth="1.5" />
            <line x1="16" y1="8" x2="16" y2="12.8" stroke={GOLD} strokeWidth="1" strokeOpacity="0.6" />
            <line x1="23" y1="19.8" x2="18.9" y2="17.6" stroke={GOLD} strokeWidth="1" strokeOpacity="0.6" />
            <line x1="9" y1="19.8" x2="13.1" y2="17.6" stroke={GOLD} strokeWidth="1" strokeOpacity="0.6" />
            <circle cx="16" cy="16" r="12.5" stroke={GOLD} strokeWidth="1" strokeOpacity="0.22" />
          </Mark>
          <Wordmark>VaNi</Wordmark>
          <Kicker>Vikuna AI Framework</Kicker>
        </Brand>

        <form onSubmit={handleSubmit} noValidate>
          <Field>
            <label htmlFor="vani-uid">User ID</label>
            <input
              id="vani-uid"
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="you@vikuna.io"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>

          <Field>
            <label htmlFor="vani-pw">Password</label>
            <input
              id="vani-pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>

          {error && (
            <ErrorBox role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </ErrorBox>
          )}

          <Submit type="submit" disabled={checking}>
            {checking ? 'Checking…' : 'Sign in'}
          </Submit>
        </form>

        <NoSignup>
          VaNi is an internal platform. Accounts are issued by the Vikuna team — there is no
          public registration.
        </NoSignup>

        <Back to="/vani">← Back to VaNi</Back>
      </Card>
    </Screen>
  );
};

export default VaNiLogin;
