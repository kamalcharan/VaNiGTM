'use client';

import { useState } from 'react';
import { usePulses, type PulseItem } from '@/hooks/usePulses';
import { PulseListPanel } from '@/components/pulses/PulseListPanel';
import { CreatePulseModal } from '@/components/pulses/CreatePulseModal';

interface Props {
  contactId:   number;
  contactName: string;
  isClient:    boolean;
  clientId?:   number | null;
}

export function PulsesTab({ contactId, contactName, isClient, clientId }: Props) {
  const [activeStatus, setActiveStatus] = useState<'open' | 'done' | 'all'>('open');
  const [showCreate,   setShowCreate]   = useState(false);

  const queryStatus = activeStatus === 'all' ? undefined : activeStatus;

  // Query by contact_id (prospects) OR client_id (clients) depending on is_client
  const contactQuery = usePulses({
    contact_id: !isClient ? contactId : undefined,
    status:     queryStatus,
    limit:      100,
  });

  const clientQuery = usePulses({
    client_id: isClient && clientId ? clientId : undefined,
    status:    queryStatus,
    limit:     100,
  });

  const activeQuery = isClient && clientId ? clientQuery : contactQuery;
  const pulses: PulseItem[] = activeQuery.data?.data?.pulses ?? [];

  return (
    <>
      <PulseListPanel
        pulses={pulses}
        isLoading={activeQuery.isLoading}
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
