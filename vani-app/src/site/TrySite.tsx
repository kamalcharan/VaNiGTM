'use client';
/**
 * The try-it box, and what appears under it: the card, the digital audit and
 * the visitor's own knowledge graph.
 *
 * Every state says what is true. A failed read shows the server's reason; a
 * reused read says when it was made; a block the server did not send is not
 * drawn, and nothing stands in for it.
 */
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { InlineLoader } from '@/platform/feedback';
import { useSkillMutation } from '@/lib/useSkillMutation';
import { formatDate } from '@/lib/format';
import { loadToken, saveToken, useSiteStatus, type Audit, type AuditCheck, type SiteStatus, type SubmitResult } from './funnel';
import { GraphPreview } from './GraphPreview';
import { NO_READ, useSiteRead } from './SiteState';
import s from './landing.module.css';

/** Plain words for each check: [what it means when present, when missing, the one-line fix]. */
const AUDIT_WORDS: Record<AuditCheck, [string, string, string]> = {
  title: ['Your page has a title', 'Your page has no title, so search results show a guess', 'Add a <title> that names what you sell and for whom.'],
  meta_description: ['Search engines have a summary of you', 'Search engines have no summary of you', 'Add a meta description — two sentences a buyer would recognise.'],
  og_tags: ['Links to your site show a preview on WhatsApp and LinkedIn', 'Links to your site show no preview on WhatsApp or LinkedIn', 'Add Open Graph tags: og:title, og:description and og:image.'],
  json_ld: ['AI assistants can read who you are', 'AI assistants have to guess who you are', 'Add Organization structured data (JSON-LD) with your name, logo and contact.'],
  body_text: ['Your homepage has readable text', 'Your homepage is mostly images or scripts — crawlers see almost nothing', 'Put what you do in real text on the page, not only in images or animations.'],
};
const AUDIT_ORDER: AuditCheck[] = ['title', 'meta_description', 'og_tags', 'json_ld', 'body_text'];

export function TryBox() {
  const { read, setRead } = useSiteRead();
  const [website, setWebsite] = useState('');

  // A return visit picks up this browser's earlier read instead of paying for a new one.
  useEffect(() => {
    const t = loadToken();
    if (t) setRead({ ...NO_READ, token: t });
  }, [setRead]);

  const submit = useSkillMutation<SubmitResult>('funnel', 'submit_site', {
    errorMessage: 'Could not read that website',
    onSuccess: (r) => { saveToken(r.token); setRead({ ...NO_READ, token: r.token, site: r.site }); },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!website.trim()) return;
    void submit.mutate({ website: website.trim(), ...(read.token ? { token: read.token } : {}) });
  };

  return (
    <form className={s.tryBox} onSubmit={onSubmit}>
      <label className={s.tryLabel} htmlFor="try-site">Your website</label>
      <div className={s.tryRow}>
        <input id="try-site" className={s.tryInput} type="text" inputMode="url" autoComplete="url" placeholder="yourcompany.in"
          value={website} onChange={(e) => setWebsite(e.target.value)} disabled={submit.isPending} />
        <button className={s.btnPrimary} type="submit" disabled={submit.isPending || !website.trim()}>
          {submit.isPending ? <InlineLoader size="sm" message="Starting…" /> : 'Read my website'}
        </button>
      </div>
      {submit.error && <p className={s.tryError} role="alert">{submit.error.message}</p>}
      <p className={s.tryNote}>We read only your public homepage. Nothing is saved to an account until you sign up.</p>
    </form>
  );
}

/** The result, full width under the hero. */
export function TryResult() {
  const { read, setRead } = useSiteRead();
  const q = useSiteStatus(read.token);
  const data: SiteStatus | null = q.data?.success ? q.data.data : null;
  const lost = !!read.token && (q.isError || (q.data && !q.data.success));

  // Keep the shared state in step, so Request access can prefill and the
  // sample graph can step back once the visitor has one of their own.
  useEffect(() => {
    if (!data || !read.token) return;
    const company = data.card?.product_name ?? null;
    const hasGraph = !!data.graph?.nodes?.length;
    if (company !== read.company || hasGraph !== read.hasGraph || data.site !== read.site) setRead({ ...read, site: data.site, company, hasGraph });
  }, [data, read, setRead]);

  const reset = () => { saveToken(null); setRead(NO_READ); };

  if (!read.token) return null;
  if (lost) {
    // An earlier preview this browser remembered is gone (expired, or the
    // server refused it). Say so, with the server's words, and offer the box.
    const why = q.error?.message ?? (q.data && !q.data.success ? q.data.error : null);
    return (
      <section className={s.result} aria-live="polite">
        <p className={s.failure}>Your earlier preview could not be opened{why ? `: ${why}` : '.'}</p>
        <div className={s.resultActions}><button type="button" className={s.btnGhost} onClick={reset}>Start again</button></div>
      </section>
    );
  }
  if (!data) return <section className={s.result}><InlineLoader size="md" message="Opening your preview…" /></section>;

  if (data.status === 'reading') {
    return (
      <section className={s.result} aria-live="polite">
        <div className={s.resultHead}><span className={s.resultSite}>{data.site}</span></div>
        <InlineLoader size="md" message="Reading your homepage and working out what you do. This takes about a minute." />
      </section>
    );
  }

  if (data.status === 'failed') {
    return (
      <section className={s.result} aria-live="polite">
        <div className={s.resultHead}><span className={s.resultSite}>{data.site}</span><span className={s.tagWarn}>could not read</span></div>
        <p className={s.failure}>{data.failure ?? 'The read did not finish.'}</p>
        <div className={s.resultActions}>
          <button type="button" className={s.btnGhost} onClick={reset}>Try another address</button>
          <a className={s.btnGhost} href="#request-access">Request access anyway</a>
        </div>
      </section>
    );
  }

  const c = data.card;
  return (
    <section className={s.result} aria-live="polite">
      <div className={s.resultHead}>
        <span className={s.resultSite}>{data.site}</span>
        {data.read_at && <span className={s.tagDim}>read {formatDate(data.read_at)}</span>}
        <button type="button" className={s.linkBtn} onClick={reset}>Try another website</button>
      </div>

      <div className={s.resultGrid}>
        <div className={s.block}>
          <div className={s.blockEyebrow}>What VaNi read</div>
          <h3 className={s.cardName}>{c?.product_name ?? data.site}</h3>
          {c?.product_tagline && <p className={s.cardTagline}>{c.product_tagline}</p>}
          {c?.product_category && <p className={s.cardMeta}>{c.product_category}</p>}
          {c?.product_description && <p className={s.cardBody}>{c.product_description}</p>}
          {!c?.product_tagline && !c?.product_description && <p className={s.cardBody}>Your homepage did not say clearly what you sell. That is worth knowing too.</p>}
        </div>
        {data.audit && <AuditBlock audit={data.audit} />}
      </div>

      {data.graph && data.graph.nodes.length > 0 && (
        <div className={s.block}>
          <div className={s.blockEyebrow}>This is your data</div>
          <h3 className={s.blockTitle}>Your knowledge graph, from one page</h3>
          <p className={s.blockBody}>It becomes yours when you sign up. Once you are in, VaNi reads your whole site, your documents and your conversations.</p>
          {data.graph.partial && <p className={s.tryNote}>Built from the first part of your homepage — the full read after signup covers all of it.</p>}
          <GraphPreview graph={data.graph} />
        </div>
      )}
      {data.graph_failure && (
        <div className={s.block}>
          <div className={s.blockEyebrow}>Your knowledge graph</div>
          <p className={s.failure}>We could not build it from this page: {data.graph_failure}</p>
        </div>
      )}

      <div className={s.signupPush}>
        <div>
          <h3 className={s.blockTitle}>Make this {c?.product_name ? `${c.product_name}’s` : 'your'} Smart Profile</h3>
          <p className={s.blockBody}>VaNi is in closed beta. With an access phrase, sign up now: this preview becomes your workspace’s first Smart Profile, and VaNi goes on to read the rest of your site.</p>
        </div>
        <div className={s.resultActions}>
          <Link className={s.btnPrimary} href="/gate">Sign up with your access phrase →</Link>
          <a className={s.btnGhost} href="#request-access">No access phrase? Request access</a>
        </div>
      </div>
    </section>
  );
}

function AuditBlock({ audit }: { audit: Audit }) {
  const present = new Set(audit.present);
  const checks = AUDIT_ORDER.filter((k) => present.has(k) || audit.missing.includes(k));
  return (
    <div className={s.block}>
      <div className={s.blockEyebrow}>Digital audit</div>
      <h3 className={s.blockTitle}>How your homepage is found</h3>
      <ul className={s.audit}>
        {checks.map((k) => {
          const ok = present.has(k);
          const [yes, no, fix] = AUDIT_WORDS[k];
          return (
            <li key={k} className={ok ? s.auditOk : s.auditMissing}>
              <span className={s.auditMark} aria-hidden>{ok ? '✓' : '!'}</span>
              <span>
                <span className={s.auditLine}>{ok ? yes : no}</span>
                {!ok && <span className={s.auditFix}>{fix}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
