'use client';

/**
 * Prospects — the tenant's own imported records.
 *
 * Same shape, design and approach as the Common Pool, because they ARE the
 * same thing at different scope. Everything lives in RecordsPage; this file
 * only says which scope and what to call it.
 */

import { RecordsPage } from '@/components/records/RecordsPage';

export default function ProspectsPage() {
  return (
    <RecordsPage
      scope="mine"
      eyebrow="GTM RECORDS"
      title="Prospects"
      emptyTitle="No prospects yet"
      emptyDescription="Import a file from Import Data and the companies in it land here."
    />
  );
}
