'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getAccessToken, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import { VdfLoader } from '@/components/vdf';
import FormInput from '@/components/ui/form-input';
import { INDIAN_STATES, validatePAN, validateGSTIN, validateARN, validatePIN } from '@/constants/business';
import s from './settings-tabs.module.css';

const BUSINESS_TYPES = [
  { value: 'mfd', label: 'Mutual Fund Distributor (MFD)' },
  { value: 'ria', label: 'Registered Investment Advisor (RIA)' },
  { value: 'ifa', label: 'Insurance Financial Advisor (IFA)' },
  { value: 'cfp', label: 'Certified Financial Planner (CFP)' },
  { value: 'wealthtech', label: 'Wealthtech Firm' },
  { value: 'other', label: 'Other' },
];

function getTypeLabel(value: string): string {
  return BUSINESS_TYPES.find((t) => t.value === value)?.label || value || '\u2014';
}

interface ProfileData {
  display_name: string;
  name: string;
  type: string;
  arn: string;
  pan: string;
  gstin: string;
  address_line1: string;
  address_line2: string;
  state: string;
  city: string;
  postal_code: string;
  country: string;
  brand_color: string;
}

const EMPTY: ProfileData = {
  display_name: '', name: '', type: '', arn: '', pan: '', gstin: '',
  address_line1: '', address_line2: '', state: '', city: '', postal_code: '',
  country: 'India', brand_color: '',
};

type EditSection = null | 'info' | 'compliance' | 'address';

export default function BusinessTab() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileData>(EMPTY);
  const [fetching, setFetching] = useState(true);
  const [editing, setEditing] = useState<EditSection>(null);
  const [saving, setSaving] = useState(false);

  // Draft state for editing
  const [draft, setDraft] = useState<ProfileData>(EMPTY);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ profile: Record<string, any> }>(API.tenant.profileGet);
      const p = res.profile || {};
      const data: ProfileData = {
        display_name: p.display_name || p.name || '',
        name: p.name || '',
        type: p.type || '',
        arn: p.arn || '',
        pan: p.pan || '',
        gstin: p.gstin || '',
        address_line1: p.address_line1 || '',
        address_line2: p.address_line2 || '',
        state: p.state || '',
        city: p.city || '',
        postal_code: p.postal_code || '',
        country: p.country || 'India',
        brand_color: p.brand_color || '',
      };
      setProfile(data);
      setDraft(data);
    } catch (err) {
      console.error('[BusinessTab] Failed to load profile:', err);
      showToast({ message: (err as ApiError).message || 'Failed to load business profile', type: 'error' });
    } finally {
      setFetching(false);
    }
  }, []);

  // Wait for auth token before loading
  useEffect(() => {
    if (getAccessToken()) load();
    else setFetching(false);
  }, [load]);

  function startEdit(section: EditSection) {
    setDraft({ ...profile });
    setEditing(section);
  }

  function cancelEdit() {
    setDraft({ ...profile });
    setEditing(null);
  }

  async function saveSection() {
    // Validate based on section
    if (editing === 'info') {
      if (!draft.display_name || draft.display_name.trim().length < 2) {
        showToast({ message: 'Firm name is required', type: 'error' }); return;
      }
    }
    if (editing === 'compliance') {
      if (draft.pan && !validatePAN(draft.pan)) {
        showToast({ message: 'Invalid PAN format (e.g. ABCDE1234F)', type: 'error' }); return;
      }
      if (draft.gstin && !validateGSTIN(draft.gstin)) {
        showToast({ message: 'Invalid GSTIN format', type: 'error' }); return;
      }
      if (draft.arn && !validateARN(draft.arn)) {
        showToast({ message: 'Invalid ARN format', type: 'error' }); return;
      }
    }
    if (editing === 'address') {
      if (draft.postal_code && !validatePIN(draft.postal_code)) {
        showToast({ message: 'PIN code must be 6 digits', type: 'error' }); return;
      }
    }

    setSaving(true);
    try {
      await apiFetch(API.tenant.profile, {
        body: {
          display_name: draft.display_name.trim(),
          type: draft.type || undefined,
          arn: draft.arn || undefined,
          pan: draft.pan.toUpperCase() || undefined,
          gstin: draft.gstin.toUpperCase() || undefined,
          address_line1: draft.address_line1 || undefined,
          address_line2: draft.address_line2 || undefined,
          state: draft.state || undefined,
          city: draft.city || undefined,
          postal_code: draft.postal_code || undefined,
          country: 'India',
        },
      });
      showToast({ message: 'Business profile updated', type: 'success' });
      setProfile({ ...draft });
      setEditing(null);
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (fetching) return <VdfLoader message="Loading business profile" hint="Fetching tenant data" />;

  const em = '\u2014'; // em dash for empty values

  return (
    <>
      {/* ── Business Information ── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.cardTitle}>Business Information</div>
            <div className={s.cardDescInline}>Your firm details visible on reports and client communications</div>
          </div>
          {editing !== 'info' && (
            <button className={s.btnChange} onClick={() => startEdit('info')}>
              {'\u270F'} Change
            </button>
          )}
        </div>

        {editing === 'info' ? (
          <>
            <FormInput label="Firm / Business Name" placeholder="Your advisory firm name" value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} required disabled={saving} />
            <div className={s.selectGroup}>
              <label className={s.selectLabel}>Business Type</label>
              <select className={s.select} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} disabled={saving}>
                <option value="">Select business type...</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className={s.actions}>
              <button className={s.btnCancel} onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button className={s.btnSave} onClick={saveSection} disabled={saving}>
                {saving ? <InlineLoader size="sm" message="Saving..." /> : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <div className={s.readGrid}>
            <div className={s.readItem}>
              <div className={s.readLabel}>Firm Name</div>
              <div className={s.readValue}>{profile.display_name || em}</div>
            </div>
            <div className={s.readItem}>
              <div className={s.readLabel}>Business Type</div>
              <div className={s.readValue}>{getTypeLabel(profile.type)}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Compliance / Registration ── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.cardTitle}>Compliance & Registration</div>
            <div className={s.cardDescInline}>Regulatory identifiers for SEBI, AMFI, and tax compliance</div>
          </div>
          {editing !== 'compliance' && (
            <button className={s.btnChange} onClick={() => startEdit('compliance')}>
              {'\u270F'} Change
            </button>
          )}
        </div>

        {editing === 'compliance' ? (
          <>
            <FormInput label="ARN" placeholder="ARN-12345" value={draft.arn} onChange={(e) => setDraft({ ...draft, arn: e.target.value })} disabled={saving} />
            <div className={s.formRow}>
              <FormInput label="PAN" placeholder="ABCDE1234F" value={draft.pan} onChange={(e) => setDraft({ ...draft, pan: e.target.value.toUpperCase() })} disabled={saving} />
              <FormInput label="GSTIN" placeholder="22AAAAA0000A1Z5" value={draft.gstin} onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })} disabled={saving} />
            </div>
            <div className={s.actions}>
              <button className={s.btnCancel} onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button className={s.btnSave} onClick={saveSection} disabled={saving}>
                {saving ? <InlineLoader size="sm" message="Saving..." /> : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <div className={s.readGrid}>
            <div className={s.readItem}>
              <div className={s.readLabel}>ARN</div>
              <div className={`${s.readValue} ${s.readMono}`}>{profile.arn || em}</div>
            </div>
            <div className={s.readItem}>
              <div className={s.readLabel}>PAN</div>
              <div className={`${s.readValue} ${s.readMono}`}>{profile.pan || em}</div>
            </div>
            <div className={s.readItem}>
              <div className={s.readLabel}>GSTIN</div>
              <div className={`${s.readValue} ${s.readMono}`}>{profile.gstin || em}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Business Address ── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.cardTitle}>Business Address</div>
            <div className={s.cardDescInline}>Used for compliance documents and correspondence</div>
          </div>
          {editing !== 'address' && (
            <button className={s.btnChange} onClick={() => startEdit('address')}>
              {'\u270F'} Change
            </button>
          )}
        </div>

        {editing === 'address' ? (
          <>
            <FormInput label="Address Line 1" placeholder="Building, street" value={draft.address_line1} onChange={(e) => setDraft({ ...draft, address_line1: e.target.value })} disabled={saving} />
            <FormInput label="Address Line 2" placeholder="Area, landmark" value={draft.address_line2} onChange={(e) => setDraft({ ...draft, address_line2: e.target.value })} disabled={saving} />
            <div className={s.formRow}>
              <div className={s.selectGroup}>
                <label className={s.selectLabel}>State</label>
                <select className={s.select} value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} disabled={saving}>
                  <option value="">Select...</option>
                  {INDIAN_STATES.map((st) => (
                    <option key={st.code} value={st.name}>{st.name}</option>
                  ))}
                </select>
              </div>
              <FormInput label="City" placeholder="City" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} disabled={saving} />
            </div>
            <div className={s.formRow}>
              <FormInput label="PIN Code" placeholder="500001" value={draft.postal_code} onChange={(e) => setDraft({ ...draft, postal_code: e.target.value.replace(/\D/g, '').slice(0, 6) })} disabled={saving} />
              <FormInput label="Country" value="India" onChange={() => {}} disabled readOnly />
            </div>
            <div className={s.actions}>
              <button className={s.btnCancel} onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button className={s.btnSave} onClick={saveSection} disabled={saving}>
                {saving ? <InlineLoader size="sm" message="Saving..." /> : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <>
            {profile.address_line1 || profile.city || profile.state ? (
              <div className={s.readGrid}>
                <div className={s.readItem} style={{ gridColumn: '1 / -1' }}>
                  <div className={s.readLabel}>Address</div>
                  <div className={s.readValue}>
                    {[profile.address_line1, profile.address_line2].filter(Boolean).join(', ') || em}
                  </div>
                </div>
                <div className={s.readItem}>
                  <div className={s.readLabel}>City</div>
                  <div className={s.readValue}>{profile.city || em}</div>
                </div>
                <div className={s.readItem}>
                  <div className={s.readLabel}>State</div>
                  <div className={s.readValue}>{profile.state || em}</div>
                </div>
                <div className={s.readItem}>
                  <div className={s.readLabel}>PIN Code</div>
                  <div className={`${s.readValue} ${s.readMono}`}>{profile.postal_code || em}</div>
                </div>
                <div className={s.readItem}>
                  <div className={s.readLabel}>Country</div>
                  <div className={s.readValue}>{profile.country || 'India'}</div>
                </div>
              </div>
            ) : (
              <div className={s.emptySection}>
                <div className={s.emptyText}>No address on file</div>
                <div className={s.emptyHint}>Add your business address for compliance documents</div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
