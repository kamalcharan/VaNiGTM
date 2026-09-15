'use client';

/**
 * Settings → Model provider (BYOK).
 *
 * Two postures, and the screen's job is to make which one you are in
 * unmistakable. On the platform model Vikuna pays for inference and caps
 * daily spend; on your own key you pay your provider directly and no cap
 * applies. That is a billing consequence, so it is stated on the screen
 * rather than buried in docs.
 *
 * The key goes in and never comes back. The API returns a hint (`sk-a…7f3c`)
 * and never the credential, so an edit shows the hint beside an EMPTY key
 * field — and an empty field on save means "leave the key as it is", which is
 * what lets you change the model without re-typing a 100-character secret.
 */

import { useState, useEffect, useCallback } from 'react';
import { KeyRound, ServerCog, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch, getAccessToken, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import { VdfLoader, VdfStatusBadge, VdfEmptyState } from '@/components/vdf';
import FormInput from '@/components/ui/form-input';
import { formatDateTime } from '@/lib/format';
import s from './settings-tabs.module.css';

interface CatalogueEntry {
  code: string;
  label: string;
  defaultModel: string;
  keyRequired: boolean;
  needsBaseUrl: boolean;
}

interface Provider {
  providerCode: string;
  model: string | null;
  baseUrl: string | null;
  testStatus: 'untested' | 'passed' | 'failed';
  lastTestAt: string | null;
  keyHint: string | null;
}

interface TestResult {
  ok: boolean;
  detail: string;
  model: string;
  latencyMs: number;
}

export default function ModelProviderTab() {
  const { showToast } = useToast();

  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [encryptionReady, setEncryptionReady] = useState(true);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [lastTest, setLastTest] = useState<TestResult | null>(null);

  const selected = catalogue.find((c) => c.code === code);

  const load = useCallback(async () => {
    if (!getAccessToken()) return;
    setLoading(true);
    try {
      const [cat, current] = await Promise.all([
        apiFetch<{ providers: CatalogueEntry[]; encryptionReady: boolean }>(API.llmProvider.catalogue),
        apiFetch<{ provider: Provider | null }>(API.llmProvider.get),
      ]);
      setCatalogue(cat.providers || []);
      setEncryptionReady(cat.encryptionReady);
      setProvider(current.provider);
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to load model provider', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (getAccessToken()) load();
    else setLoading(false);
  }, [load]);

  function beginEdit(existing: Provider | null) {
    const initial = existing?.providerCode || catalogue[0]?.code || '';
    setCode(initial);
    setModel(existing?.model || '');
    setBaseUrl(existing?.baseUrl || '');
    setKey(''); // never pre-filled — the API does not return it
    setLastTest(null);
    setEditing(true);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ provider: Provider }>(API.llmProvider.save, {
        body: {
          provider_code: code,
          key: key || undefined,
          model: model || undefined,
          base_url: baseUrl || undefined,
        },
      });
      setProvider(res.provider);
      setEditing(false);
      setKey('');
      showToast({ message: 'Model provider saved — test it to confirm it works', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not save the provider', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (testing) return;
    setTesting(true);
    setLastTest(null);
    try {
      const res = await apiFetch<TestResult>(API.llmProvider.test, { body: {} });
      setLastTest(res);
      // The request succeeded either way; the RESULT is the answer, so a
      // failed test is reported in place rather than as a request error.
      showToast({
        message: res.ok ? 'Connection works' : 'The provider rejected the test — see the detail below',
        type: res.ok ? 'success' : 'error',
      });
      load();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not run the test', type: 'error' });
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      await apiFetch(API.llmProvider.remove, {});
      setProvider(null);
      setLastTest(null);
      showToast({ message: 'Back on the Vikuna model', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not remove the provider', type: 'error' });
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return <VdfLoader message="Loading model provider" hint="Checking what this workspace uses" />;
  }

  return (
    <>
      {/* An operator problem, stated before anyone fills in a form that
          cannot be saved. */}
      {!encryptionReady && (
        <div className={s.card}>
          <div className={s.cardTitle}>
            <AlertTriangle size={16} strokeWidth={1.75} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Key storage is not configured
          </div>
          <div className={s.cardDesc}>
            This deployment has no encryption key set, so a provider key cannot be
            stored. Your administrator needs to set <code>TENANT_SECRET_KEY</code> on
            the server. Everything below is read-only until then.
          </div>
        </div>
      )}

      {/* ── Which posture is in force ── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.cardTitle}>Current model</div>
            <div className={s.cardDesc}>
              {provider
                ? 'Your agents run on your own provider. You are billed by them directly, and no daily token cap applies.'
                : 'Your agents run on the Vikuna model. We pay for inference, and a daily token cap may apply to your workspace.'}
            </div>
          </div>
          <VdfStatusBadge
            label={provider ? 'Your key' : 'Vikuna model'}
            variant={provider ? 'success' : 'muted'}
          />
        </div>

        {provider ? (
          <div className={s.readGrid}>
            <div className={s.readItem}>
              <div className={s.readLabel}>Provider</div>
              <div className={s.readValue}>
                {catalogue.find((c) => c.code === provider.providerCode)?.label ?? provider.providerCode}
              </div>
            </div>
            <div className={s.readItem}>
              <div className={s.readLabel}>Model</div>
              <div className={s.readMono}>{provider.model || '—'}</div>
            </div>
            <div className={s.readItem}>
              <div className={s.readLabel}>Endpoint</div>
              <div className={s.readMono}>{provider.baseUrl || '—'}</div>
            </div>
            <div className={s.readItem}>
              <div className={s.readLabel}>API key</div>
              <div className={s.readMono}>{provider.keyHint || '—'}</div>
            </div>
            <div className={s.readItem}>
              <div className={s.readLabel}>Last tested</div>
              <div className={s.readValue}>
                {provider.lastTestAt ? formatDateTime(provider.lastTestAt) : 'Never'}
                {provider.testStatus !== 'untested' && (
                  <VdfStatusBadge
                    label={provider.testStatus === 'passed' ? 'Passed' : 'Failed'}
                    variant={provider.testStatus === 'passed' ? 'success' : 'danger'}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          // Rule 9b: an empty state says what to do about it.
          <VdfEmptyState
            title="No provider of your own"
            description="Bring your own key to run every agent on your chosen model and your own billing. Declared once — every agent picks it up."
            action={encryptionReady ? (
              <button className={s.btnSave} onClick={() => beginEdit(null)}>
                <ServerCog size={15} strokeWidth={1.75} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Add your provider
              </button>
            ) : undefined}
          />
        )}

        {provider && !editing && (
          <div className={s.actions}>
            <button className={s.btnSave} onClick={handleTest} disabled={testing}>
              {testing ? <InlineLoader size="sm" message="Testing..." /> : 'Test connection'}
            </button>
            <button className={s.btnChange} onClick={() => beginEdit(provider)} disabled={!encryptionReady}>
              Change
            </button>
            <button className={s.btnDanger} onClick={handleRemove} disabled={removing}>
              {removing ? <InlineLoader size="sm" message="Removing..." /> : 'Use the Vikuna model'}
            </button>
          </div>
        )}

        {/* The real reason, verbatim from the provider — not "connection
            failed". A revoked key and a wrong model name look identical
            otherwise, and only the tenant can fix either. */}
        {lastTest && (
          <div className={lastTest.ok ? s.inviteOk : s.inviteFail}>
            {lastTest.ok
              ? <CheckCircle2 size={14} strokeWidth={2} />
              : <XCircle size={14} strokeWidth={2} />}
            <span>{lastTest.detail}</span>
          </div>
        )}
      </div>

      {/* ── Declare or change ── */}
      {editing && (
        <div className={s.card}>
          <div className={s.cardTitle}>
            <KeyRound size={16} strokeWidth={1.75} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {provider ? 'Change your provider' : 'Bring your own key'}
          </div>
          <div className={s.cardDesc}>
            Your key is encrypted before it is stored and is never shown again —
            not here, not to an administrator. Keep your own copy.
          </div>

          <div className={s.formRow}>
            <div className={s.selectGroup} style={{ flex: 1 }}>
              <label className={s.selectLabel}>Provider</label>
              <select
                className={s.select}
                value={code}
                onChange={(e) => { setCode(e.target.value); setBaseUrl(''); setModel(''); }}
                disabled={saving}
              >
                {catalogue.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <FormInput
                label="Model"
                placeholder={selected?.defaultModel || 'e.g. gpt-4o-mini'}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          {selected?.needsBaseUrl && (
            <FormInput
              label="Endpoint URL"
              placeholder="https://llm.example.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={saving}
            />
          )}

          <FormInput
            label={provider ? 'API key (leave blank to keep the current one)' : 'API key'}
            type="password"
            placeholder={provider?.keyHint ? `Currently ${provider.keyHint}` : 'sk-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={saving}
          />

          <div className={s.actions}>
            <button
              className={s.btnSave}
              onClick={handleSave}
              disabled={saving || !code || (selected?.keyRequired && !key && !provider)}
            >
              {saving ? <InlineLoader size="sm" message="Saving..." /> : 'Save provider'}
            </button>
            <button className={s.btnCancel} onClick={() => { setEditing(false); setKey(''); }} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
