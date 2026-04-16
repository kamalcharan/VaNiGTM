'use client';

import { useState, useEffect } from 'react';
import { usePulses, type PulseItem } from '@/hooks/usePulses';
import { PulseListPanel } from '@/components/pulses/PulseListPanel';
import { CreatePulseModal } from '@/components/pulses/CreatePulseModal';
import { useToast } from '@/components/toast';

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

  const { data, isLoading, isError, error } = usePulses(
    isClient && clientId
      ? { client_id: clientId,   status: queryStatus, limit: 100 }
      : { contact_id: contactId, status: queryStatus, limit: 100 },
  );

  useEffect(() => {
    if (isError) {
      showToast({ message: (error as Error)?.message || 'Failed to load follow-ups', type: 'error' });
    }
  }, [isError, error, showToast]);

  const pulses: PulseItem[] = data?.data?.pulses ?? [];

  return (
    <>
      <PulseListPanel
        pulses={pulses}
        isLoading={isLoading}
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
        contactId={!isClient ? contactId : undefined}
        contactName={!isClient ? contactName : undefined}
        clientId={isClient && clientId ? clientId : undefined}
        clientName={isClient ? contactName : undefined}
      />
    </>
  );
}
