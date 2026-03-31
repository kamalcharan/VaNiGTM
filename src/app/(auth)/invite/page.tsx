'use client';

import { Suspense } from 'react';
import InviteAcceptPage from '@/../frontend/src/components/auth/invite-accept-page';
import { FullPageLoader } from '@/../components/loader';

export default function InviteRoute() {
  return (
    <Suspense fallback={<FullPageLoader message="Loading invitation..." />}>
      <InviteAcceptPage />
    </Suspense>
  );
}
