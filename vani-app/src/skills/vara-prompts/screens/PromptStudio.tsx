'use client';

/**
 * Prompt Studio — list of every prompt every LLM-driven Vara worker uses,
 * with the tenant's overrides visible next to the system prompt.
 *
 * Design (2026-08-19):
 *
 *   ┌───────── list ──────────┐┌────────── detail ─────────────────────┐
 *   │ vara.composer.ask_next  ││ vara.composer.ask_next     v1  system │
 *   │   system v1 · override? ││                                       │
 *   │ vara.extractor.field…   ││ [ system body — read-only ]           │
 *   │ vara.candidate.turn     ││                                       │
 *   │                         ││ Your workspace override               │
 *   │                         ││ [ textarea, {{name}} variables shown ]│
 *   │                         ││ [Save override]  [Revert to system]   │
 *   └─────────────────────────┘└───────────────────────────────────────┘
 *
 * The override editor validates that every {{variable}} declared by the
 * system prompt is present in the override before enabling Save — the
 * server refuses otherwise anyway (OVERRIDE_MISSING_VARIABLE), but
 * catching it in the UI is a better shape than a red toast on click.
 *
 * Save is idempotent-in-practice via useSkillMutation's Idempotency-Key
 * (mint here per attempt); double-clicks don't create two versions.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import type { SkillResult } from '@/lib/useSkill';
import u from '@/platform/shell/ui.module.css';
import s from './prompt-studio.module.css';

interface PromptView {
  key: string;
  system: { version: number; body: string; variables: string[] } | null;
  override: { version: number; body: string; approved_at: string | null } | null;
  system_versions: number;
  override_versions: number;
}
interface PromptsResponse { prompts: PromptView[] }

function newIdemKey(): string {
  return `prompt-save-${Math.floor(performance.now() * 1000).toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export default function PromptStudio() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const idemRef = useRef<string | null>(null);

  const q = useQuery<SkillResult<PromptsResponse>, Error>({
    queryKey: ['vara', 'prompts'],
    queryFn: async () => {
      const r = await apiFetch<PromptsResponse>(API.vara.promptsList);
      return { success: true, skill: 'vara', function: 'prompts.list', data: r };
    },
  });

  const save = useCallback(async (key: string) => {
    if (saving) return;
    setSaving(true);
    if (!idemRef.current) idemRef.current = newIdemKey();
    try {
      await apiFetch(API.vara.promptSave, {
        pathParams: { key },
        body: { body: draftBody },
        idempotencyKey: idemRef.current,
      });
      showToast({ message: `Override saved for ${key}.`, type: 'success' });
      idemRef.current = null;
      await qc.invalidateQueries({ queryKey: ['vara', 'prompts'] });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not save override';
      showToast({ message: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [draftBody, qc, saving, showToast]);

  const revert = useCallback(async (key: string) => {
    if (reverting) return;
    setReverting(true);
    try {
      await apiFetch(API.vara.promptRevert, { pathParams: { key } });
      showToast({ message: `Reverted ${key} to the system prompt.`, type: 'success' });
      await qc.invalidateQueries({ queryKey: ['vara', 'prompts'] });
      // Reset editor after revert; PromptDetail's useEffect re-hydrates.
      setDraftBody('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not revert';
      showToast({ message: msg, type: 'error' });
    } finally {
      setReverting(false);
    }
  }, [qc, reverting, showToast]);

  return (
    <div>
      <div className={u.eyebrow}>// AGENTS · VARA · PROMPT STUDIO</div>
      <h1 className={u.h1}>Prompts</h1>
      <p className={s.lede}>
        Every LLM-driven Vara worker reads its prompt here. The system prompt
        is Vikuna-authored; your <b>workspace override</b> replaces it in the
        resolver when active. Overrides must keep every <code>{'{{variable}}'}</code>
        the system prompt declares — the API refuses otherwise.
      </p>

      <DataBoundary
        query={q}
        label="prompts"
        skeleton={<SkeletonRows rows={4} />}
        isEmpty={(d) => !d?.prompts?.length}
        empty="No Vara prompts registered yet — they arrive with each worker."
      >
        {(data: PromptsResponse) => (
          <PromptGrid
            prompts={data.prompts}
            selectedKey={selectedKey}
            onSelect={(k, body) => { setSelectedKey(k); setDraftBody(body); }}
            draftBody={draftBody}
            setDraftBody={setDraftBody}
            onSave={save}
            onRevert={revert}
            saving={saving}
            reverting={reverting}
          />
        )}
      </DataBoundary>
    </div>
  );
}

function PromptGrid({
  prompts, selectedKey, onSelect, draftBody, setDraftBody,
  onSave, onRevert, saving, reverting,
}: {
  prompts: PromptView[];
  selectedKey: string | null;
  onSelect: (key: string, body: string) => void;
  draftBody: string;
  setDraftBody: (v: string) => void;
  onSave: (key: string) => void;
  onRevert: (key: string) => void;
  saving: boolean;
  reverting: boolean;
}) {
  const active = prompts.find((p) => p.key === selectedKey) ?? prompts[0];
  const missingVars = useMemo(() => {
    if (!active?.system) return [];
    return active.system.variables.filter((v) => !draftBody.includes(`{{${v}}}`));
  }, [active, draftBody]);
  const canSave = draftBody.trim().length >= 10 && missingVars.length === 0 && !saving;

  return (
    <div className={s.grid}>
      <div className={s.list}>
        {prompts.map((p) => {
          const isActive = p.key === (selectedKey ?? active?.key);
          return (
            <button
              key={p.key}
              type="button"
              className={isActive ? `${s.listItem} ${s.listItemActive}` : s.listItem}
              onClick={() => onSelect(p.key, p.override?.body ?? p.system?.body ?? '')}
            >
              <div className={s.listKey}>{p.key}</div>
              <div className={s.listMeta}>
                <span>system v{p.system?.version ?? '—'}</span>
                {p.override ? (
                  <span className={s.overrideBadge}>override v{p.override.version} active</span>
                ) : (
                  <span className={s.systemBadge}>system in use</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {active && active.system && (
        <div className={s.detail}>
          <div className={s.detailHead}>
            <h2 className={s.detailKey}>{active.key}</h2>
            <div className={s.detailMeta}>
              system v{active.system.version} · {active.system_versions} in history
              {active.override_versions > 0 && (
                <> · your overrides: {active.override_versions}</>
              )}
            </div>
          </div>

          <div className={s.section}>
            <div className={s.sectionH}>System prompt (read-only)</div>
            <textarea
              className={`${s.body} ${s.bodyReadOnly}`}
              value={active.system.body}
              readOnly
              rows={14}
            />
            {active.system.variables.length > 0 && (
              <div className={s.varList}>
                <span className={s.varLabel}>Variables:</span>
                {active.system.variables.map((v) => (
                  <code key={v} className={s.varChip}>{`{{${v}}}`}</code>
                ))}
              </div>
            )}
          </div>

          <div className={s.section}>
            <div className={s.sectionH}>
              Your workspace override
              {active.override && (
                <span className={s.overrideActiveNote}>
                  active — v{active.override.version}, saved {active.override.approved_at?.slice(0, 10)}
                </span>
              )}
            </div>
            <textarea
              className={s.body}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={14}
              placeholder="Paste the system prompt and edit it — every {{variable}} must stay"
            />
            {missingVars.length > 0 && (
              <div className={s.missingVars}>
                Your override is missing required variable{missingVars.length === 1 ? '' : 's'}:{' '}
                {missingVars.map((v) => <code key={v}>{`{{${v}}}`}</code>).reduce((a, b, i) => <>{a}{i > 0 ? ', ' : ''}{b}</>, <></>)}.
                Add them back before you can save.
              </div>
            )}
            <div className={s.actions}>
              <button
                type="button"
                className={s.primary}
                onClick={() => onSave(active.key)}
                disabled={!canSave}
              >
                {saving ? 'Saving…' : (active.override ? 'Save new override version' : 'Save override')}
              </button>
              {active.override && (
                <button
                  type="button"
                  className={s.ghost}
                  onClick={() => onRevert(active.key)}
                  disabled={reverting}
                >
                  {reverting ? 'Reverting…' : 'Revert to system'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
