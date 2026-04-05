'use client';

import { useState } from 'react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfModal } from '../modal/VdfModal';
import { VdfButton } from '../button/VdfButton';
import s from './VdfDownloadNavModal.module.css';

/* ── Types ──────────────────────────────────────────── */

export interface VdfDownloadNavModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemeCode: string;
  schemeName: string;
  amc?: string;
  launchDate?: string | null;
  navRecords?: number;
  earliestNavDate?: string | null;
  latestNavDate?: string | null;
  onDownloaded?: (records: number) => void;
}

type Preset = '30d' | '90d' | '6m' | '1y' | '3y' | '5y' | 'inception' | 'all';

const PRESETS: { key: Preset; label: string }[] = [
  { key: '30d',       label: 'Last 30 Days' },
  { key: '90d',       label: 'Last 90 Days' },
  { key: '6m',        label: 'Last 6 Months' },
  { key: '1y',        label: 'Last 1 Year' },
  { key: '3y',        label: 'Last 3 Years' },
  { key: '5y',        label: 'Last 5 Years' },
  { key: 'inception', label: 'Since Inception' },
  { key: 'all',       label: 'Full History' },
];

function presetToRange(preset: Preset, launchDate?: string | null): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split('T')[0];
  if (preset === 'all') return { from: '', to: '' };
  if (preset === 'inception') return { from: launchDate || '2000-01-01', to };
  const from = new Date(today);
  if (preset === '30d')  from.setDate(from.getDate() - 30);
  if (preset === '90d')  from.setDate(from.getDate() - 90);
  if (preset === '6m')   from.setMonth(from.getMonth() - 6);
  if (preset === '1y')   from.setFullYear(from.getFullYear() - 1);
  if (preset === '3y')   from.setFullYear(from.getFullYear() - 3);
  if (preset === '5y')   from.setFullYear(from.getFullYear() - 5);
  return { from: from.toISOString().split('T')[0], to };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

/* ── Component ──────────────────────────────────────── */

export function VdfDownloadNavModal({
  isOpen, onClose,
  schemeCode, schemeName, amc, launchDate,
  navRecords = 0, earliestNavDate, latestNavDate,
  onDownloaded,
}: VdfDownloadNavModalProps) {
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<Preset>('1y');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]   = useState('');
  const [downloading, setDownloading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  function selectPreset(p: Preset) {
    setSelectedPreset(p);
    const range = presetToRange(p, launchDate);
    setCustomFrom(range.from);
    setCustomTo(range.to);
  }

  // Set default on open
  function handleOpen() {
    if (!customFrom) selectPreset('1y');
  }

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const body: Record<string, string> = {};
      if (selectedPreset !== 'all' && customFrom) {
        body.date_from = customFrom;
        body.date_to   = customTo || today;
      }
      const r = await apiFetch<{ records: number; status: string }>(
        { ...API.nav.downloadScheme, path: API.nav.downloadScheme.path.replace(':code', schemeCode) },
        { body },
      );
      const count = r.records || 0;
      showToast({ message: `${count.toLocaleString()} records downloaded`, type: 'success' });
      onDownloaded?.(count);
      onClose();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Download failed', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <VdfModal
      isOpen={isOpen}
      onClose={() => { if (!downloading) onClose(); }}
      title="Download NAV"
      subtitle={schemeName}
      width="md"
      footer={
        <>
          <VdfButton variant="ghost" size="sm" onClick={onClose} disabled={downloading}>Cancel</VdfButton>
          <VdfButton variant="primary" size="sm" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Downloading…' : '↓ Download'}
          </VdfButton>
        </>
      }
    >
      <div className={s.body} onLoad={handleOpen}>

        {/* Scheme info row */}
        <div className={s.schemeRow}>
          <span className={s.schemeCode}>{schemeCode}</span>
          {amc && <span className={s.schemeAmc}>{amc}</span>}
        </div>

        {/* Current data summary */}
        <div className={s.dataBox}>
          <div className={s.dataBoxLabel}>Current Data</div>
          {navRecords > 0 ? (
            <div className={s.dataBoxValue}>
              <span className={s.dataCount}>{navRecords.toLocaleString()} records</span>
              <span className={s.dataSep}>·</span>
              <span className={s.dataRange}>{fmtDate(earliestNavDate)} → {fmtDate(latestNavDate)}</span>
            </div>
          ) : (
            <div className={s.dataEmpty}>No data yet — select a range to download</div>
          )}
          {launchDate && (
            <div className={s.launchDate}>Fund started: {fmtDate(launchDate)}</div>
          )}
        </div>

        {/* Date presets */}
        <div className={s.presetsLabel}>Select range</div>
        <div className={s.presets}>
          {PRESETS.map(p => (
            <button
              key={p.key}
              className={`${s.preset} ${selectedPreset === p.key ? s.presetActive : ''}`}
              onClick={() => selectPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range — always visible, synced with preset */}
        {selectedPreset !== 'all' && (
          <div className={s.customRange}>
            <div className={s.rangeField}>
              <label className={s.rangeLabel}>From</label>
              <input
                type="date"
                className={s.rangeInput}
                value={customFrom}
                max={customTo || today}
                onChange={e => { setCustomFrom(e.target.value); setSelectedPreset('90d' as Preset); }}
              />
            </div>
            <div className={s.rangeSep}>→</div>
            <div className={s.rangeField}>
              <label className={s.rangeLabel}>To</label>
              <input
                type="date"
                className={s.rangeInput}
                value={customTo}
                min={customFrom}
                max={today}
                onChange={e => { setCustomTo(e.target.value); setSelectedPreset('90d' as Preset); }}
              />
            </div>
          </div>
        )}

        {selectedPreset === 'all' && (
          <div className={s.allNote}>Complete history from MFAPI will be downloaded.</div>
        )}

      </div>
    </VdfModal>
  );
}

export default VdfDownloadNavModal;
