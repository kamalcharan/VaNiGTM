'use client';

import { useState } from 'react';
import { apiFetch, clearTokens, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import FormInput from '@/components/ui/form-input';
import PasswordStrength from '@/components/ui/password-strength';
import s from './settings-tabs.module.css';

export default function SecurityTab() {
  const { showToast } = useToast();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signingOutAll, setSigningOutAll] = useState(false);

  function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
    return (
      <button type="button" className={s.eyeToggle} onClick={onToggle} tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}>
        {visible ? '\u{1F648}' : '\u{1F441}'}
      </button>
    );
  }

  const showMatch = confirmPw.length > 0;
  const matched = newPw === confirmPw && newPw.length > 0;

  async function handleUpdate() {
    const e: Record<string, string> = {};
    if (!currentPw) e.currentPw = 'Current password is required';
    if (!newPw || newPw.length < 8) e.newPw = 'Min 8 characters';
    if (newPw !== confirmPw) e.confirmPw = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      await apiFetch(API.auth.changePassword, {
        body: { current_password: currentPw, new_password: newPw },
      });
      showToast({ message: 'Password updated', type: 'success' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setErrors({});
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Update failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className={s.card}>
        <div className={s.cardTitle}>Change Password</div>
        <div className={s.cardDesc}>Update your password regularly for security</div>

        <FormInput
          label="Current Password"
          type={showCurrent ? 'text' : 'password'}
          placeholder="Enter current password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          error={errors.currentPw}
          disabled={loading}
          rightElement={<EyeToggle visible={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />}
        />

        <FormInput
          label="New Password"
          type={showNew ? 'text' : 'password'}
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          error={errors.newPw}
          disabled={loading}
          rightElement={<EyeToggle visible={showNew} onToggle={() => setShowNew(!showNew)} />}
        />
        <div className={s.strengthWrap}>
          <PasswordStrength password={newPw} />
        </div>

        <FormInput
          label="Confirm New Password"
          type={showConfirm ? 'text' : 'password'}
          placeholder="Re-enter new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          error={errors.confirmPw}
          disabled={loading}
          rightElement={<EyeToggle visible={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />}
        />
        {showMatch && (
          <div className={`${s.matchIndicator} ${matched ? s.matchOk : s.matchNo}`}>
            <span className={s.matchDot} />
            <span>{matched ? 'Passwords match' : 'Passwords do not match'}</span>
          </div>
        )}

        <div className={s.actions}>
          <button className={s.btnCancel} onClick={() => { setCurrentPw(''); setNewPw(''); setConfirmPw(''); setErrors({}); }} disabled={loading}>
            Cancel
          </button>
          <button className={s.btnSave} onClick={handleUpdate} disabled={loading}>
            {loading ? <InlineLoader size="sm" message="Updating..." /> : 'Update Password'}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className={s.dangerCard}>
        <div className={s.dangerTitle}>Danger Zone</div>
        <div className={s.dangerItem}>
          <div>
            <div className={s.dangerItemText}>Sign out of all devices</div>
            <div className={s.dangerItemHint}>Revokes all active sessions — you will need to sign in again</div>
          </div>
          <button
            className={s.btnDanger}
            disabled={signingOutAll}
            onClick={async () => {
              setSigningOutAll(true);
              try {
                // Fetch all sessions, then revoke them all
                const sessRes = await apiFetch<{ sessions: { session_id: string }[] }>(API.auth.sessionsList);
                const ids = (sessRes.sessions || []).map((sess) => sess.session_id);
                if (ids.length > 0) {
                  await apiFetch(API.auth.sessionsRevoke, { body: { session_ids: ids } });
                }
                clearTokens();
                showToast({ message: 'All sessions revoked', type: 'success' });
                window.location.href = '/login';
              } catch {
                showToast({ message: 'Failed to revoke sessions', type: 'error' });
                setSigningOutAll(false);
              }
            }}
          >
            {signingOutAll ? 'Signing out...' : 'Sign Out All'}
          </button>
        </div>
        <div className={s.dangerItem}>
          <div>
            <div className={s.dangerItemText}>Delete account</div>
            <div className={s.dangerItemHint}>Permanently remove your account and all data</div>
          </div>
          <button className={s.btnDanger} disabled title="Contact support to delete your account">
            Delete Account
          </button>
        </div>
      </div>
    </>
  );
}
