'use client';

import { Suspense } from 'react';
import ResetPasswordPage from '@/components/auth/reset-password-page';
import { FullPageLoader } from '@/components/loader';

export default function ResetPasswordRoute() {
  return (
    <Suspense fallback={<FullPageLoader message="Loading..." />}>
      <ResetPasswordPage />
    </Suspense>
  );
}
