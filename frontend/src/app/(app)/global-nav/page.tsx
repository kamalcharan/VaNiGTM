'use client';

/**
 * Global NAV Explorer — ALL 16K+ schemes table view.
 * Coming soon — will be built after My NAV is complete.
 */

import { VdfEmptyState, VdfButton } from '@/components/vdf';
import { useRouter } from 'next/navigation';
import d from '@/styles/data.module.css';

export default function GlobalNavPage() {
  const router = useRouter();
  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 className={d.pageTitle}>Global NAV</h1>
        <p className={d.pageSubtitle}>All 16,000+ mutual fund schemes with NAV status</p>
      </div>
      <VdfEmptyState
        icon="🔭"
        title="Coming soon"
        description="Global NAV explorer is being built. Use My NAV to track and manage your bookmarked schemes."
        action={
          <VdfButton variant="primary" size="sm" onClick={() => router.push('/my-nav')}>
            Go to My NAV
          </VdfButton>
        }
      />
    </div>
  );
}
