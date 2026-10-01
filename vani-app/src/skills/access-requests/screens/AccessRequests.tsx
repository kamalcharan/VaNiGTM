'use client';
/**
 * /access-requests — the closed beta's Request access form, as a list.
 *
 * Read-only and simple (Charan, 2026-09-30: "simple"). Each row is a lead
 * with its latest request: how to reach them, the site they read on
 * vani.vikuna.io before asking, how many times they asked, and the exact
 * words they agreed to. Following up — status, notes — is the lead's, later.
 */
import { useSkillQuery } from '@/lib/useSkill';
import { formatDateTime } from '@/lib/format';
import { DataBoundary, SkeletonTable } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';

interface AccessRequest {
  lead_id: string; lead_no: string | null; name: string; email: string; company: string; role_title: string;
  country_code: string | null; mobile: string | null; site: string | null; consent_text: string | null;
  requested_at: string; times_asked: number; status: string;
}

export default function AccessRequests() {
  const q = useSkillQuery<{ requests: AccessRequest[]; total: number }>('access-skill', 'list_requests', { limit: 200 });
  return (
    <div>
      <div className={u.eyebrow}>// ORGANIZATION · CLOSED BETA</div>
      <h1 className={u.h1}>Access requests</h1>
      <p className={u.lede}>
        People who asked to join from <a href="https://vani.vikuna.io" style={{ color: 'var(--ac)' }}>vani.vikuna.io</a> without an access phrase.
        Each shows the site they read first, if they did, and the words they agreed to. Reply from connect@vikuna.io.
      </p>
      <section className={u.card}>
        <div className={u.cardHead}>
          Requests
          <span className={u.cardMeta}>newest first · one row per person</span>
        </div>
        <DataBoundary
          query={q}
          label="access requests"
          skeleton={<SkeletonTable rows={5} cols={6} />}
          isEmpty={(d) => !d?.requests?.length}
          empty="No requests yet. They appear here when someone fills in Request access on vani.vikuna.io — share the page to get the first one."
        >
          {(d) => (
            <div className={u.tableWrap}>
              <table className={u.table}>
                <thead>
                  <tr><th>Asked</th><th>Person</th><th>Company</th><th>Reach</th><th>Site read</th><th>Agreed to</th></tr>
                </thead>
                <tbody>
                  {d.requests.map((r) => (
                    <tr key={r.lead_id}>
                      <td className={u.mono}>
                        {formatDateTime(r.requested_at)}
                        {r.times_asked > 1 && <div><span className={`${u.tag} ${u.tagWarn}`}>asked {r.times_asked}×</span></div>}
                      </td>
                      <td><strong>{r.name}</strong><div className={u.mono}>{r.lead_no ?? ''}</div><div>{r.role_title}</div></td>
                      <td>{r.company}</td>
                      <td>
                        <a href={`mailto:${r.email}`} style={{ color: 'var(--ac)' }}>{r.email}</a>
                        {r.mobile && <div className={u.mono}>{[r.country_code, r.mobile].filter(Boolean).join(' ')}</div>}
                      </td>
                      <td className={u.mono}>{r.site ?? <span className={`${u.tag} ${u.tagDim}`}>none</span>}</td>
                      <td style={{ maxWidth: 280 }}>{r.consent_text ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataBoundary>
      </section>
    </div>
  );
}
