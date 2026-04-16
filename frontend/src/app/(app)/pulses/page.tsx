'use client';

import { useState, useEffect } from 'react';
import { VdfPageHeader } from '@/components/vdf/page-header/VdfPageHeader';
import { usePulses, type PulseItem } from '@/hooks/usePulses';
import { PulseListPanel } from '@/components/pulses/PulseListPanel';
import { CreatePulseModal } from '@/components/pulses/CreatePulseModal';
import { useToast } from '@/components/toast';
import s from './pulses-page.module.css';

export default function PulsesPage() {
  const [activeStatus, setActiveStatus] = useState<'open' | 'done' | 'all'>('open');
  const [showCreate, setShowCreate]     = useState(false);
  const [originFilter, setOriginFilter] = useState<'all' | 'manual' | 'system'>('all');
  const { showToast } = useToast();

  const queryStatus = activeStatus === 'all' ? undefined : activeStatus;
  const queryOrigin = originFilter === 'all'  ? undefined : originFilter;

  const { data, isLoading, isError, error } = usePulses({
    status:     queryStatus,
    origin:     queryOrigin as 'system' | 'manual' | undefined,
    limit:      100,
  });

  useEffect(() => {
    if (isError) {
      showToast({ message: (error as Error)?.message || 'Failed to load follow-ups', type: 'error' });
    }
  }, [isError, error, showToast]);

  const pulses: PulseItem[] = data?.data?.pulses ?? [];
  const total:  number      = data?.data?.total  ?? 0;

  const openCount = pulses.filter(p => p.status === 'open').length;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="FOLLOW-UPS"
        title="Pulses"
        meta={
          <>
            <strong>{total}</strong> {activeStatus === 'all' ? 'total' : activeStatus}
            {activeStatus === 'open' && openCount > 0 && (
              <> · <strong style={{ color: 'var(--color-warning)' }}>{openCount} open</strong></>
            )}
          </>
        }
        actions={
          <div className={s.headerActions}>
            {/* Origin filter pills */}
            <div className={s.originPills}>
              {(['all', 'manual', 'system'] as const).map(o => (
                <button
                  key={o}
                  className={`${s.originPill} ${originFilter === o ? s.originPillActive : ''}`}
                  onClick={() => setOriginFilter(o)}
                >
                  {o === 'all' ? 'All' : o === 'manual' ? 'Manual' : 'System'}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className={s.body}>
        <PulseListPanel
          pulses={pulses}
          isLoading={isLoading}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          showSubject={true}
          onAdd={() => setShowCreate(true)}
          emptyMessage={
            activeStatus === 'open'
              ? 'No open follow-ups. Great job!'
              : activeStatus === 'done'
                ? 'No completed follow-ups yet.'
                : 'No follow-ups yet.'
          }
        />
      </div>

      <CreatePulseModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
