'use client';

import { Suspense } from 'react';
import InviteAcceptPage from '@/components/auth/invite-accept-page';
import { VdfLoader } from '@/components/vdf';

export default function InviteRoute() {
  return (
    <Suspense fallback={<VdfLoader message="Loading invitation" hint="Verifying invite token" />}>
      <InviteAcceptPage />
    </Suspense>
  );
}
