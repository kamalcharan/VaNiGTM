'use client';

/**
 * Common Pool — the shared directory data, admin only.
 *
 * Identical to /prospects apart from scope. gt_universe_company_sources has no
 * tenant_id, so the nav entry is adminOnly and get_records refuses a non-admin
 * before the query runs.
 */

import { useAuth } from '@/context/auth-provider';
import { VdfPageHeader, VdfEmptyState } from '@/components/vdf';
import { RecordsPage } from '@/components/records/RecordsPage';
import s from '../prospects/records.module.css';

export default function CommonPoolPage() {
  const { isAdmin } = useAuth();

  // Said plainly, rather than shown as an empty table — which would read as
  // "there is no data" instead of "this is not yours to see".
  if (!isAdmin) {
    return (
      <div className={s.page}>
        <VdfPageHeader eyebrow="SHARED DATA" title="Common Pool" />
        <div className={s.body}>
          <VdfEmptyState
            title="Admin tenants only"
            description="The common pool holds directory data shared across every tenant. Your own records are under Prospects."
          />
        </div>
      </div>
    );
  }

  return (
    <RecordsPage
      scope="pool"
      eyebrow="SHARED DATA"
      title="Common Pool"
      intro={<>
        These are the <strong>source rows</strong> each delivery contributed —
        one per record per delivery, kept exactly as the file supplied them.
        The merged company record they resolve into is not built yet, so nothing
        here has been combined across deliveries: rows sharing an identifier are
        flagged for review, never silently merged.
      </>}
      emptyTitle="The pool is empty"
      emptyDescription="Import a directory from Import Data, choosing 'Common pool dataset', and its rows land here."
    />
  );
}
