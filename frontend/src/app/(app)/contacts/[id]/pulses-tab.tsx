'use client';

import { useState, useEffect } from 'react';
import {
  usePulses,
  useClientPulseHistory,
  type PulseItem,
} from '@/hooks/usePulses';
import { PulseListPanel }        from '@/components/pulses/PulseListPanel';
import { CreatePulseModal }      from '@/components/pulses/CreatePulseModal';
import { PulseConfigCard }       from '@/components/pulses/PulseConfigCard';
import { PulseHistoryTimeline }  from '@/components/pulses/PulseHistoryTimeline';
import { useToast }              from '@/components/toast';
import s                         from './pulses-tab.module.css';

interface Props {
  contactId:   number;
  contactName: string;
  isClient:    boolean;
  clientId?:   number | null;
}

export function PulsesTab({ contactId, contactName, isClient, clientId }: Props) {
  const [activeStatus, setActiveStatus] = useState<'open' | 'done' | 'all'>('open');
  const [showCreate,   setShowCreate]   = useState(false);
  const { showToast } = useToast();

  const queryStatus = activeStatus === 'all' ? undefined : activeStatus;

  const { data, isLoading: taskLoading, isError, error } = usePulses(
    isClient && clientId
      ? { client_id: clientId,   status: queryStatus, limit: 100 }
      : { contact_id: contactId, status: queryStatus, limit: 100 },
  );

  const { data: historyData, isLoading: historyLoading } = useClientPulseHistory(
    isClient && clientId ? clientId : null,
  );

  useEffect(() => {
    if (isError) {
      showToast({ message: (error as Error)?.message || 'Failed to load follow-ups', type: 'error' });
    }
  }, [isError, error, showToast]);

  const pulses: PulseItem[] = data?.data?.pulses ?? [];
  const sessions            = historyData?.data?.sessions ?? [];

  if (isClient && clientId) {
    return (
      <>
        <div className={s.section}>
          <div className={s.sectionLabel}>Pulse Setup</div>
          <PulseConfigCard clientId={clientId} />
        </div>

        <div className={s.section}>
          <div className={s.sectionLabel}>Session History</div>
          <PulseHistoryTimeline sessions={sessions} isLoading={historyLoading} />
        </div>

        <div className={s.section}>
          <div className={s.sectionLabel}>Follow-up Tasks</div>
          <PulseListPanel
            pulses={pulses}
            isLoading={taskLoading}
            activeStatus={activeStatus}
            onStatusChange={setActiveStatus}
            showSubject={false}
            onAdd={() => setShowCreate(true)}
            emptyMessage={
              activeStatus === 'open'
                ? 'No open follow-ups.'
                : activeStatus === 'done'
                  ? 'No completed follow-ups yet.'
                  : 'No follow-ups yet.'
            }
          />
        </div>

        <CreatePulseModal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          clientId={clientId}
          clientName={contactName}
        />
      </>
    );
  }

  return (
    <>
      <PulseListPanel
        pulses={pulses}
        isLoading={taskLoading}
        activeStatus={activeStatus}
        onStatusChange={setActiveStatus}
        showSubject={false}
        onAdd={() => setShowCreate(true)}
        emptyMessage={
          activeStatus === 'open'
            ? 'No open follow-ups for this contact.'
            : activeStatus === 'done'
              ? 'No completed follow-ups yet.'
              : 'No follow-ups yet.'
        }
      />

      <CreatePulseModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        contactId={contactId}
        contactName={contactName}
      />
    </>
  );
}
