'use client';

import { Suspense } from 'react';
import ResetPasswordPage from '@/components/auth/reset-password-page';
import { VdfLoader } from '@/components/vdf';

export default function ResetPasswordRoute() {
  return (
    <Suspense fallback={<VdfLoader message="Loading" hint="Preparing password reset" />}>
      <ResetPasswordPage />
    </Suspense>
  );
}
