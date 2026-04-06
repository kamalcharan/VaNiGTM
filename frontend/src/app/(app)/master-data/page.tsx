'use client';

/**
 * Master Data — Admin CRUD page
 *
 * Four tabs:
 *   1. Transaction Types — toggle active, edit name/description
 *   2. Asset Types       — toggle active, edit name/description/assumption rate
 *   3. Bookmark Reasons  — add/edit/reorder/toggle active (tenant-scoped)
 *   4. Job Scheduler     — edit cron/toggle enabled (tenant-scoped, admin-visible)
 *
 * Admin-only: 403 guard via useAuth().isAdmin
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/context/auth-provider';
import { VdfTabs, VdfLoader, VdfErrorScreen, VdfEmptyState } from '@/components/vdf';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import s from './master-data.module.css';

/* ── Types ──────────────────────────────────────────────────────────── */

interface TransactionType {
  id: number;
  txn_code: string;
  txn_name: string;
  txn_type: 'Addition' | 'Deduction';
  is_active: boolean;
  description: string | null;
}

interface AssetType {
  id: number;
  asset_type_code: string;
  asset_type_name: string;
  category: string;
  default_assumption_rate: string | number;
  display_order: number;
  is_active: boolean;
  description: string | null;
}

interface BookmarkReason {
  id: number;
  reason_code: string;
  reason_label: string;
  display_order: number;
  is_active: boolean;
}

interface JobType {
  code: string;
  name: string;
  description: string | null;
  default_cron_expression: string | null;
  is_global: boolean;
  is_active: boolean;
  config_id: number | null;
  tenant_cron: string | null;
  tenant_enabled: boolean | null;
  tenant_max_retries: number | null;
  execution_count: number | null;
  failure_count: number | null;
  last_success_at: string | null;
}

/* ── Tab definitions ─────────────────────────────────────────────────── */

const TABS = [
  { id: 'txn',      label: 'Transaction Types', icon: '↔' },
  { id: 'asset',    label: 'Asset Types',        icon: '◆' },
  { id: 'bookmark', label: 'Bookmark Reasons',   icon: '🏷' },
  { id: 'jobs',     label: 'Job Scheduler',      icon: '⚙' },
] as const;

type TabId = typeof TABS[number]['id'];

/* ════════════════════════════════════════════════════════════════════════
   TRANSACTION TYPES TAB
════════════════════════════════════════════════════════════════════════ */

function TransactionTypesTab() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ txn_name: string; description: string }>({ txn_name: '', description: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['master-data', 'transaction-types'],
    queryFn: () => apiFetch<{ transaction_types: TransactionType[] }>(API.masterData.transactionTypes),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiFetch(API.masterData.updateTransactionType, { pathParams: { id: String(id) }, body: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master-data', 'transaction-types'] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number; txn_name: string; description: string }) =>
      apiFetch(API.masterData.updateTransactionType, { pathParams: { id: String(id) }, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-data', 'transaction-types'] });
      setEditId(null);
    },
  });

  const startEdit = (t: TransactionType) => {
    setEditId(t.id);
    setEditValues({ txn_name: t.txn_name, description: t.description ?? '' });
  };

  const rows = data?.transaction_types ?? [];
  const addition = rows.filter(t => t.txn_type === 'Addition');
  const deduction = rows.filter(t => t.txn_type === 'Deduction');

  return (
    <div className={s.sectionCard}>
      <div className={s.sectionHeader}>
        <div>
          <h2 className={s.sectionTitle}>Transaction Types</h2>
          <p className={s.sectionMeta}>
            Global master — {rows.length} types ({addition.length} Addition · {deduction.length} Deduction)
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <VdfLoader size="md" />
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                editId === t.id ? (
                  <tr key={t.id} className={s.editRow}>
                    <td colSpan={6}>
                      <div className={s.editForm}>
                        <input
                          className={s.editInput}
                          value={editValues.txn_name}
                          onChange={e => setEditValues(v => ({ ...v, txn_name: e.target.value }))}
                          placeholder="Name"
                        />
                        <input
                          className={s.editInput}
                          value={editValues.description}
                          onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))}
                          placeholder="Description"
                        />
                        <div className={s.editActions}>
                          <button
                            className={s.saveBtn}
                            disabled={updateMut.isPending || !editValues.txn_name.trim()}
                            onClick={() => updateMut.mutate({ id: t.id, ...editValues })}
                          >
                            {updateMut.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button className={s.cancelBtn} onClick={() => setEditId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id}>
                    <td><span className={s.mono}>{t.txn_code}</span></td>
                    <td>{t.txn_name}</td>
                    <td>
                      <span className={`${s.typeBadge} ${t.txn_type === 'Addition' ? s.addition : s.deduction}`}>
                        {t.txn_type === 'Addition' ? '+' : '−'} {t.txn_type}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.8rem', maxWidth: 280 }}>
                      {t.description ?? '—'}
                    </td>
                    <td>
                      <label className={s.toggle}>
                        <input
                          type="checkbox"
                          checked={t.is_active}
                          onChange={() => toggleMut.mutate({ id: t.id, is_active: !t.is_active })}
                        />
                        <span className={s.toggleSlider} />
                      </label>
                    </td>
                    <td>
                      <button className={s.rowAction} onClick={() => startEdit(t)}>Edit</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ASSET TYPES TAB
════════════════════════════════════════════════════════════════════════ */

function AssetTypesTab() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{
    asset_type_name: string; description: string; default_assumption_rate: string;
  }>({ asset_type_name: '', description: '', default_assumption_rate: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['master-data', 'asset-types'],
    queryFn: () => apiFetch<{ asset_types: AssetType[] }>(API.masterData.assetTypes),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiFetch(API.masterData.updateAssetType, { pathParams: { id: String(id) }, body: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master-data', 'asset-types'] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number; asset_type_name: string; description: string; default_assumption_rate: number }) =>
      apiFetch(API.masterData.updateAssetType, { pathParams: { id: String(id) }, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-data', 'asset-types'] });
      setEditId(null);
    },
  });

  const startEdit = (a: AssetType) => {
    setEditId(a.id);
    setEditValues({
      asset_type_name: a.asset_type_name,
      description: a.description ?? '',
      default_assumption_rate: String(Number(a.default_assumption_rate)),
    });
  };

  const rows = data?.asset_types ?? [];

  return (
    <div className={s.sectionCard}>
      <div className={s.sectionHeader}>
        <div>
          <h2 className={s.sectionTitle}>Asset Types</h2>
          <p className={s.sectionMeta}>Global master — {rows.length} asset types with default growth rate assumptions</p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <VdfLoader size="md" />
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Default Rate</th>
                <th>Description</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                editId === a.id ? (
                  <tr key={a.id} className={s.editRow}>
                    <td colSpan={7}>
                      <div className={s.editForm}>
                        <input
                          className={s.editInput}
                          value={editValues.asset_type_name}
                          onChange={e => setEditValues(v => ({ ...v, asset_type_name: e.target.value }))}
                          placeholder="Name"
                        />
                        <input
                          className={`${s.editInput} ${s.editInputSm}`}
                          value={editValues.default_assumption_rate}
                          onChange={e => setEditValues(v => ({ ...v, default_assumption_rate: e.target.value }))}
                          placeholder="Rate %"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                        <input
                          className={s.editInput}
                          value={editValues.description}
                          onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))}
                          placeholder="Description"
                        />
                        <div className={s.editActions}>
                          <button
                            className={s.saveBtn}
                            disabled={updateMut.isPending || !editValues.asset_type_name.trim()}
                            onClick={() => updateMut.mutate({
                              id: a.id,
                              asset_type_name: editValues.asset_type_name,
                              description: editValues.description,
                              default_assumption_rate: parseFloat(editValues.default_assumption_rate) || 0,
                            })}
                          >
                            {updateMut.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button className={s.cancelBtn} onClick={() => setEditId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id}>
                    <td><span className={s.mono}>{a.asset_type_code}</span></td>
                    <td>{a.asset_type_name}</td>
                    <td><span className={s.categoryTag}>{a.category?.replace('_', ' ')}</span></td>
                    <td><span className={s.rate}>{Number(a.default_assumption_rate).toFixed(2)}%</span></td>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.8rem', maxWidth: 240 }}>
                      {a.description ?? '—'}
                    </td>
                    <td>
                      <label className={s.toggle}>
                        <input
                          type="checkbox"
                          checked={a.is_active}
                          onChange={() => toggleMut.mutate({ id: a.id, is_active: !a.is_active })}
                        />
                        <span className={s.toggleSlider} />
                      </label>
                    </td>
                    <td>
                      <button className={s.rowAction} onClick={() => startEdit(a)}>Edit</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   BOOKMARK REASONS TAB
════════════════════════════════════════════════════════════════════════ */

function BookmarkReasonsTab() {
  const qc = useQueryClient();
  const [isLive, setIsLive] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editOrder, setEditOrder] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['master-data', 'bookmark-reasons', isLive],
    queryFn: () =>
      apiFetch<{ bookmark_reasons: BookmarkReason[] }>(
        API.masterData.bookmarkReasons,
        { queryParams: { is_live: isLive ? 'true' : 'false' } },
      ),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiFetch(API.masterData.updateBookmarkReason, { pathParams: { id: String(id) }, body: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master-data', 'bookmark-reasons', isLive] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, reason_label, display_order }: { id: number; reason_label: string; display_order: number }) =>
      apiFetch(API.masterData.updateBookmarkReason, { pathParams: { id: String(id) }, body: { reason_label, display_order } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-data', 'bookmark-reasons', isLive] });
      setEditId(null);
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch(API.masterData.createBookmarkReason, {
        body: { reason_code: newCode, reason_label: newLabel, is_live: isLive },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-data', 'bookmark-reasons', isLive] });
      setNewCode('');
      setNewLabel('');
    },
  });

  const startEdit = (r: BookmarkReason) => {
    setEditId(r.id);
    setEditLabel(r.reason_label);
    setEditOrder(String(r.display_order));
  };

  const rows = data?.bookmark_reasons ?? [];

  return (
    <div className={s.sectionCard}>
      <div className={s.sectionHeader}>
        <div>
          <h2 className={s.sectionTitle}>Bookmark Reasons</h2>
          <p className={s.sectionMeta}>Tenant-scoped — {rows.length} reasons in {isLive ? 'Live' : 'Sandbox'} environment</p>
        </div>
        <div className={s.envSwitch}>
          <button className={`${s.envBtn} ${isLive ? s.active : ''}`} onClick={() => setIsLive(true)}>Live</button>
          <button className={`${s.envBtn} ${!isLive ? s.active : ''}`} onClick={() => setIsLive(false)}>Sandbox</button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <VdfLoader size="md" />
        </div>
      ) : (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Code</th>
                  <th>Label</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr className={s.emptyRow}>
                    <td colSpan={5}>No bookmark reasons — add one below</td>
                  </tr>
                )}
                {rows.map((r) => (
                  editId === r.id ? (
                    <tr key={r.id} className={s.editRow}>
                      <td colSpan={5}>
                        <div className={s.editForm}>
                          <input
                            className={`${s.editInput} ${s.editInputSm}`}
                            value={editOrder}
                            onChange={e => setEditOrder(e.target.value)}
                            placeholder="Order"
                            type="number"
                            style={{ minWidth: 70, flex: '0 0 80px' }}
                          />
                          <input
                            className={s.editInput}
                            value={editLabel}
                            onChange={e => setEditLabel(e.target.value)}
                            placeholder="Label"
                          />
                          <div className={s.editActions}>
                            <button
                              className={s.saveBtn}
                              disabled={updateMut.isPending || !editLabel.trim()}
                              onClick={() => updateMut.mutate({
                                id: r.id,
                                reason_label: editLabel,
                                display_order: parseInt(editOrder, 10) || r.display_order,
                              })}
                            >
                              {updateMut.isPending ? 'Saving…' : 'Save'}
                            </button>
                            <button className={s.cancelBtn} onClick={() => setEditId(null)}>Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id}>
                      <td><span className={s.mono}>{r.display_order}</span></td>
                      <td><span className={s.mono}>{r.reason_code}</span></td>
                      <td>{r.reason_label}</td>
                      <td>
                        <label className={s.toggle}>
                          <input
                            type="checkbox"
                            checked={r.is_active}
                            onChange={() => toggleMut.mutate({ id: r.id, is_active: !r.is_active })}
                          />
                          <span className={s.toggleSlider} />
                        </label>
                      </td>
                      <td>
                        <button className={s.rowAction} onClick={() => startEdit(r)}>Edit</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>

          {/* Add new reason */}
          <div className={s.addForm}>
            <label className={s.addFormLabel}>
              Code
              <input
                className={s.editInput}
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                placeholder="CUSTOM_REASON"
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <label className={s.addFormLabel}>
              Label
              <input
                className={s.editInput}
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Display label"
              />
            </label>
            <button
              className={s.saveBtn}
              style={{ alignSelf: 'flex-end', marginBottom: 0 }}
              disabled={createMut.isPending || !newCode.trim() || !newLabel.trim()}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Adding…' : '+ Add Reason'}
            </button>
          </div>
          {createMut.isError && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 8 }}>
              {(createMut.error as any)?.message ?? 'Failed to add reason'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   JOB SCHEDULER TAB
════════════════════════════════════════════════════════════════════════ */

function JobSchedulerTab() {
  const qc = useQueryClient();
  const [isLive, setIsLive] = useState(true);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ cron_expression: string; max_retries: string }>({
    cron_expression: '', max_retries: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['master-data', 'job-types', isLive],
    queryFn: () =>
      apiFetch<{ job_types: JobType[] }>(
        API.masterData.jobTypes,
        { queryParams: { is_live: isLive ? 'true' : 'false' } },
      ),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) =>
      apiFetch(API.masterData.updateJobConfig, { pathParams: { id: String(id) }, body: { is_enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master-data', 'job-types', isLive] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number; cron_expression: string; max_retries: number }) =>
      apiFetch(API.masterData.updateJobConfig, { pathParams: { id: String(id) }, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-data', 'job-types', isLive] });
      setEditCode(null);
    },
  });

  const startEdit = (j: JobType) => {
    if (!j.config_id) return;
    setEditCode(j.code);
    setEditValues({
      cron_expression: j.tenant_cron ?? j.default_cron_expression ?? '',
      max_retries: String(j.tenant_max_retries ?? 3),
    });
  };

  const rows = data?.job_types ?? [];

  return (
    <div className={s.sectionCard}>
      <div className={s.sectionHeader}>
        <div>
          <h2 className={s.sectionTitle}>Job Scheduler</h2>
          <p className={s.sectionMeta}>Cron schedules for background jobs — {isLive ? 'Live' : 'Sandbox'} environment</p>
        </div>
        <div className={s.envSwitch}>
          <button className={`${s.envBtn} ${isLive ? s.active : ''}`} onClick={() => setIsLive(true)}>Live</button>
          <button className={`${s.envBtn} ${!isLive ? s.active : ''}`} onClick={() => setIsLive(false)}>Sandbox</button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <VdfLoader size="md" />
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Scope</th>
                <th>Cron</th>
                <th>Executions</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                editCode === j.code ? (
                  <tr key={j.code} className={s.editRow}>
                    <td colSpan={6}>
                      <div className={s.editForm}>
                        <input
                          className={s.editInput}
                          value={editValues.cron_expression}
                          onChange={e => setEditValues(v => ({ ...v, cron_expression: e.target.value }))}
                          placeholder="Cron expression"
                          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}
                        />
                        <input
                          className={s.editInput}
                          value={editValues.max_retries}
                          onChange={e => setEditValues(v => ({ ...v, max_retries: e.target.value }))}
                          placeholder="Max retries"
                          type="number"
                          min="0"
                          max="10"
                          style={{ minWidth: 80, flex: '0 0 100px' }}
                        />
                        <div className={s.editActions}>
                          <button
                            className={s.saveBtn}
                            disabled={updateMut.isPending || !editValues.cron_expression.trim() || !j.config_id}
                            onClick={() => updateMut.mutate({
                              id: j.config_id!,
                              cron_expression: editValues.cron_expression,
                              max_retries: parseInt(editValues.max_retries, 10) || 3,
                            })}
                          >
                            {updateMut.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button className={s.cancelBtn} onClick={() => setEditCode(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={j.code}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{j.name}</div>
                      {j.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 2 }}>
                          {j.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={j.is_global ? s.globalBadge : s.mono} style={j.is_global ? {} : { fontSize: '0.75rem' }}>
                        {j.is_global ? 'Global' : 'Per-Tenant'}
                      </span>
                    </td>
                    <td>
                      <span className={s.cronBadge}>
                        {j.tenant_cron ?? j.default_cron_expression ?? '—'}
                      </span>
                    </td>
                    <td>
                      {j.config_id ? (
                        <span className={s.execStats}>
                          <span>{j.execution_count ?? 0}</span> runs · {j.failure_count ?? 0} failed
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>No config</span>
                      )}
                    </td>
                    <td>
                      {j.config_id ? (
                        <label className={s.toggle}>
                          <input
                            type="checkbox"
                            checked={j.tenant_enabled ?? false}
                            onChange={() => toggleMut.mutate({ id: j.config_id!, is_enabled: !j.tenant_enabled })}
                          />
                          <span className={s.toggleSlider} />
                        </label>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {j.config_id && !j.is_global ? (
                        <button className={s.rowAction} onClick={() => startEdit(j)}>Edit</button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                          {j.is_global ? 'Global' : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════════════════════════ */

export default function MasterDataPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('txn');

  // Auth guards — must come after all hook calls
  if (authLoading) return <VdfLoader overlay message="Loading" />;
  if (!isAdmin) {
    return (
      <VdfErrorScreen
        code="403"
        icon="🔒"
        title="Admin Access Only"
        description="Master Data management is restricted to admin users."
      />
    );
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.headerText}>
          <h1 className={s.title}>Master Data</h1>
          <p className={s.subtitle}>Manage transaction types, asset types, bookmark reasons, and job schedules</p>
        </div>
      </div>

      <VdfTabs
        tabs={TABS as unknown as Array<{ id: string; label: string; icon?: string }>}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        variant="pill"
      />

      <div className={s.tabContent}>
        {activeTab === 'txn'      && <TransactionTypesTab />}
        {activeTab === 'asset'    && <AssetTypesTab />}
        {activeTab === 'bookmark' && <BookmarkReasonsTab />}
        {activeTab === 'jobs'     && <JobSchedulerTab />}
      </div>
    </div>
  );
}
