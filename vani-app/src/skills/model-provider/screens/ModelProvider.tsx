'use client';

/**
 * BYOK — the workspace's own model provider.
 *
 * Two postures, and the screen's first job is making which one you are in
 * unmistakable. On the platform model Vikuna pays for inference and a daily
 * token cap may apply; on your own key you pay your provider directly and no
 * cap applies. That is a billing consequence, so it is stated here rather than
 * left in a doc.
 *
 * ── THE KEY GOES IN AND NEVER COMES BACK ──────────────────────────────
 *
 * The API returns a HINT (`sk-a…7f3c`), never the credential — not to an
 * admin, not to the person who typed it. So an edit shows the hint beside an
 * EMPTY key field, and an empty field on save means "keep the stored one".
 * That is what lets someone change the model without re-typing a
 * 100-character secret they may not have kept.
 *
 * ── RETRY SAFETY ──────────────────────────────────────────────────────
 *
 * save is idempotent by CONSTRUCTION (an upsert on the unique
 * (tenant_id, provider_code)), not because anything honours the
 * Idempotency-Key header — VaNiGTM honours it nowhere yet (CLAUDE.md section
 * 2). So nothing here tells a user a write is safe to retry, and nothing
 * auto-retries.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import { DataBoundary, SkeletonRows, InlineLoader, useToast } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../model-provider.module.css';

const SKILL = 'llm-provider-skill';

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

interface ProviderView {
  provider: Provider | null;
  posture: 'platform' | 'byok';
}

interface TestResult {
  ok: boolean;
  detail: string;
  model: string;
  latencyMs: number;
}

/** DD-MMM-YYYY, the format used across both repos. */
function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()}`
       + ` ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ModelProvider() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const current = useSkillQuery<ProviderView>(SKILL, 'get_provider');
  const catalogue = useSkillQuery<{ providers: CatalogueEntry[]; encryptionReady: boolean }>(
    SKILL, 'get_catalogue',
  );

  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [lastTest, setLastTest] = useState<TestResult | null>(null);

  const providers = catalogue.data?.success ? catalogue.data.data.providers : [];
  const encryptionReady = catalogue.data?.success ? catalogue.data.data.encryptionReady : true;
  const selected = providers.find((p) => p.code === code);

  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', SKILL] });

  const save = useSkillMutation<{ provider: Provider }>(SKILL, 'save_provider', {
    successMessage: 'Saved — test it to confirm it works.',
    errorMessage: 'Could not save the provider.',
  });

  // No successMessage: a test's ANSWER is the outcome, and it is reported in
  // place below. A generic "done" toast over a failing key would be worse than
  // silence.
  const test = useSkillMutation<TestResult>(SKILL, 'test_provider', {
    errorMessage: 'Could not run the test.',
  });

  const remove = useSkillMutation<ProviderView>(SKILL, 'remove_provider', {
    successMessage: 'Back on the Vikuna model.',
    errorMessage: 'Could not remove the provider.',
  });

  function beginEdit(existing: Provider | null) {
    setCode(existing?.providerCode || providers[0]?.code || '');
    setModel(existing?.model || '');
    setBaseUrl(existing?.baseUrl || '');
    setKey('');            // never pre-filled — the API does not return it
    setLastTest(null);
    setEditing(true);
  }

  async function onSave() {
    const result = await save.mutate({
      provider_code: code,
      key: key || undefined,
      model: model || undefined,
      base_url: baseUrl || undefined,
    });
    if (!result) return;
    setEditing(false);
    setKey('');
    refresh();
  }

  async function onTest() {
    const result = await test.mutate({});
    if (!result) return;
    setLastTest(result);
    // The request succeeded either way; the result is the answer.
    showToast({
      message: result.ok ? 'Connection works.' : 'The provider rejected the test.',
      type: result.ok ? 'success' : 'error',
    });
    refresh();
  }

  async function onRemove() {
    const result = await remove.mutate({});
    if (!result) return;
    setLastTest(null);
    setEditing(false);
    refresh();
  }

  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM</div>
      <h1 className={u.h1}>Model Provider</h1>
      <p className={u.lede}>
        Which model answers when an agent needs one. Declared once — every agent
        in this workspace picks it up.
      </p>

      {/* An operator problem, stated before anyone fills in a form that cannot
          be saved. */}
      {!encryptionReady && (
        <section className={u.card}>
          <div className={u.cardHead}>
            Key storage is not configured
            <span className={u.tagBad}>blocked</span>
          </div>
          <div className={s.body}>
            This deployment has no encryption key set, so a provider key cannot
            be stored. An administrator needs to set <code className={u.mono}>TENANT_SECRET_KEY</code>{' '}
            on the server. Everything below is read-only until then.
          </div>
        </section>
      )}

      <section className={u.card}>
        <div className={u.cardHead}>
          Current model
          <span className={u.cardMeta}>
            {current.data?.success && current.data.data.provider ? 'your key' : 'Vikuna model'}
          </span>
        </div>

        <DataBoundary
          query={current}
          label="the model provider"
          skeleton={<SkeletonRows rows={4} />}
        >
          {(d) => (d.provider ? (
            <div className={s.body}>
              <p className={s.note}>
                Your agents run on your own provider. You are billed by them
                directly, and no daily token cap applies.
              </p>

              <div className={u.tableWrap}>
                <table className={s.rows}>
                  <tbody>
                    <tr>
                      <th>Provider</th>
                      <td>{providers.find((p) => p.code === d.provider!.providerCode)?.label
                           ?? d.provider!.providerCode}</td>
                    </tr>
                    <tr><th>Model</th><td className={s.mono}>{d.provider!.model || '—'}</td></tr>
                    <tr><th>Endpoint</th><td className={s.mono}>{d.provider!.baseUrl || '—'}</td></tr>
                    <tr><th>API key</th><td className={s.mono}>{d.provider!.keyHint || '—'}</td></tr>
                    <tr>
                      <th>Last tested</th>
                      <td>
                        {formatWhen(d.provider!.lastTestAt)}{' '}
                        {d.provider!.testStatus !== 'untested' && (
                          <span className={d.provider!.testStatus === 'passed' ? u.tagOk : u.tagBad}>
                            {d.provider!.testStatus}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {!editing && (
                <div className={s.actions}>
                  <button type="button" className={s.btn} onClick={onTest} disabled={test.isPending}>
                    {test.isPending ? <InlineLoader size="sm" message="Testing…" /> : 'Test connection'}
                  </button>
                  <button type="button" className={s.btn} onClick={() => beginEdit(d.provider)} disabled={!encryptionReady}>
                    Change
                  </button>
                  <button type="button" className={`${s.btn} ${s.btnDanger}`} onClick={onRemove} disabled={remove.isPending}>
                    {remove.isPending
                      ? <InlineLoader size="sm" message="Removing…" />
                      : 'Use the Vikuna model'}
                  </button>
                </div>
              )}

              {/* The provider's own words, not "connection failed". A revoked
                  key and a wrong model name are indistinguishable otherwise,
                  and only the tenant can fix either. */}
              {lastTest && (
                <p className={`${s.result} ${lastTest.ok ? s.resultOk : s.resultFail}`}>{lastTest.detail}</p>
              )}
            </div>
          ) : (
            // Empty state carries its next action.
            <div className={s.body}>
              <p className={s.note}>
                Your agents run on the Vikuna model. We pay for inference, and a
                daily token cap may apply to this workspace.
              </p>
              <p className={s.note}>
                Bring your own key to run every agent on your chosen model and
                your own billing, with no cap.
              </p>
              {!editing && (
                <div className={s.actions}>
                  <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => beginEdit(null)} disabled={!encryptionReady}>
                    Add your provider
                  </button>
                </div>
              )}
            </div>
          ))}
        </DataBoundary>
      </section>

      {editing && (
        <section className={u.card}>
          <div className={u.cardHead}>
            {current.data?.success && current.data.data.provider
              ? 'Change your provider'
              : 'Bring your own key'}
          </div>
          <div className={s.body}>
            <p className={s.note}>
              Your key is encrypted before it is stored and is never shown
              again — not here, not to an administrator. Keep your own copy.
            </p>

            <label className={s.field}>
              Provider
              <select
                value={code}
                onChange={(e) => { setCode(e.target.value); setBaseUrl(''); setModel(''); }}
                disabled={save.isPending}
              >
                {providers.map((p) => (
                  <option key={p.code} value={p.code}>{p.label}</option>
                ))}
              </select>
            </label>

            <label className={s.field}>
              Model
              <input
                value={model}
                placeholder={selected?.defaultModel || 'e.g. gpt-4o-mini'}
                onChange={(e) => setModel(e.target.value)}
                disabled={save.isPending}
              />
            </label>

            {selected?.needsBaseUrl && (
              <label className={s.field}>
                Endpoint URL
                <input
                  value={baseUrl}
                  placeholder="https://llm.example.com/v1"
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={save.isPending}
                />
              </label>
            )}

            <label className={s.field}>
              {current.data?.success && current.data.data.provider
                ? 'API key (leave blank to keep the current one)'
                : 'API key'}
              <input
                type="password"
                value={key}
                placeholder={
                  current.data?.success && current.data.data.provider?.keyHint
                    ? `Currently ${current.data.data.provider.keyHint}`
                    : 'sk-…'
                }
                onChange={(e) => setKey(e.target.value)}
                disabled={save.isPending}
              />
            </label>

            <div className={s.actions}>
              <button
                type="button"
                className={`${s.btn} ${s.btnPrimary}`}
                onClick={onSave}
                disabled={
                  save.isPending
                  || !code
                  || (!!selected?.keyRequired && !key
                      && !(current.data?.success && current.data.data.provider))
                }
              >
                {save.isPending ? <InlineLoader size="sm" message="Saving…" /> : 'Save provider'}
              </button>
              <button
                type="button"
                className={s.btn}
                onClick={() => { setEditing(false); setKey(''); }}
                disabled={save.isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
