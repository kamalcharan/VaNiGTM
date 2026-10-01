'use client';
/**
 * /agents/gtm — GTM's landing, from the reviewed journey prototype
 * (2026-10-01, VaNiGTM documents/prototypes/gtm-journey.html), wired to the workspace's own data.
 *
 * Every number and state on this page is read, never sampled:
 *   - company context and score: the Smart Profile (`/profile`)
 *   - offers: research-skill.get_offers
 *   - companies / people / in motion: gtm.journey's counts
 *   - discovery findings: the site_health step of the newest website read
 *     (ingestion-skill.list_sources → get_source), the same evidence the
 *     Mission Wizard shows
 *   - knowledge: the sources VaNi has read
 *
 * What the prototype shows that does not exist yet is said plainly rather than
 * simulated: outreach channels (sending stays off until consent and opt-out
 * exist), and activation with the DPDP acknowledgement (its table exists,
 * migration 260; the notice wording awaits legal review, and "activated" is
 * decision D17). Website fixes belong to Nova (decision D15): the findings are
 * shown here, the fixing is not.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { callSkill, useSkillQuery } from '@/lib/useSkill';
import { SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import { useProfileRead } from '@/skills/smart-profile/useSmartProfile';
import { useOffers } from '@/skills/smart-profile/useOffers';
import { FINDING_TAGS, SITE_HEALTH_ADVICE, parseSiteHealth } from '@/skills/onboarding/site-health';
import { formatDate } from '@/lib/format';
import s from './landing.module.css';

interface Journey {
  done: string[];
  current: string | null;
  note: string;
  counts?: { score: number | null; companies: number; people: number; in_motion: number; touches: number };
}

/** Offer fields as the catalogue names them (research-skill offer-catalogue.ts) → plain words. */
const OFFER_FIELD: Record<string, string> = {
  one_line: 'one-line summary', who_for: 'who it is for', problem: 'the problem it solves',
  what_we_do: 'what you do', signals: 'buying signals', disqualifiers: 'disqualifiers',
  price_band: 'price band', proof: 'proof', name: 'name',
};

/** "AI Automation Sprint: signals is empty — …" → { offer, field } in plain words. */
function missingByOffer(problems: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of problems) {
    const m = p.match(/^(.*?): (\w+) (?:is|contains)/);
    if (!m) continue;
    const list = out.get(m[1]) ?? [];
    const word = OFFER_FIELD[m[2]] ?? m[2].replace(/_/g, ' ');
    if (!list.includes(word)) list.push(word);
    out.set(m[1], list);
  }
  return out;
}

interface SiteRead { sources: number; site: string | null; missing: string[] | null; read: boolean; readAt: string | null }

/** The newest website read and what its site_health step found missing. */
function useSiteRead() {
  return useQuery<SiteRead, Error>({
    queryKey: ['gtm', 'landing', 'site-read'],
    queryFn: async () => {
      const list = await callSkill<{ sources: { id: string; source_type: string; url?: string | null; updated_at?: string | null }[] }>(
        'ingestion-skill', 'list_sources', { limit: 20 },
      );
      const sources = list.sources ?? [];
      const web = sources.find((x) => x.source_type === 'url');
      if (!web) return { sources: sources.length, site: null, missing: null, read: false, readAt: null };
      const one = await callSkill<{ source: { url?: string | null; run_steps?: { step_name: string; output_summary?: string }[] | null } }>(
        'ingestion-skill', 'get_source', { source_id: web.id },
      );
      // The same parse the Mission Wizard's audit rail uses: null when the
      // read recorded no health check, [] when it found nothing missing.
      const steps = one.source.run_steps ?? [];
      const checked = steps.some((st) => st.step_name === 'site_health');
      return {
        sources: sources.length, site: one.source.url ?? web.url ?? null,
        missing: checked ? (parseSiteHealth(steps) ?? []) : null, read: true, readAt: web.updated_at ?? null,
      };
    },
  });
}

export default function GtmLanding() {
  const profile = useProfileRead();
  const offers = useOffers();
  const journey = useSkillQuery<Journey>('gtm', 'journey');
  const site = useSiteRead();

  const p = profile.data?.success ? profile.data.data : undefined;
  const o = offers.data?.success ? offers.data.data : undefined;
  const j = journey.data?.success ? journey.data.data : undefined;
  const c = j?.counts;
  const loading = profile.isLoading || offers.isLoading || journey.isLoading;

  const hasProfile = !!p?.product_name;
  const missing = missingByOffer(o?.problems ?? []);
  const unfinished = o?.offers.find((x) => !x.is_ready) ?? null;
  const unfinishedMissing = unfinished ? missing.get(unfinished.name) ?? [] : [];
  const offerCount = o?.offers.length ?? 0;
  const offersReady = !!o?.ready;
  const companies = c?.companies ?? 0;
  const people = c?.people ?? 0;

  // One recommended action, in the order the work depends on.
  const next =
    !hasProfile ? { h: 'Finish your Smart Profile', p: 'GTM starts from what VaNi knows about your company. Point it at your website first.', cta: 'Open the Smart Profile →', href: '/onboarding' }
    : !offersReady ? (unfinished
      ? { h: `Finish “${unfinished.name}”`, p: `${unfinishedMissing.length ? `Still missing: ${unfinishedMissing.join(', ')}. ` : ''}Research scores companies against your offers, so it waits for this.`, cta: 'Finish the offer →', href: '/agents/gtm/offers' }
      : { h: 'Confirm what you want to sell', p: 'GTM uses your offer to judge which companies fit and what conversation could be relevant.', cta: 'Add your first offer →', href: '/agents/gtm/offers' })
    : companies === 0 ? { h: 'Bring your first audience', p: 'Import the companies and people you already know, then choose who to research.', cta: 'Import a list →', href: '/agents/gtm/import' }
    : people === 0 ? { h: 'Research and qualify your companies', p: `${companies} ${companies === 1 ? 'company' : 'companies'} in your audience. Research them, decide fit, then pick the people.`, cta: 'Open Build the audience →', href: '/agents/gtm/audience' }
    : { h: 'Review your people', p: `${people} ${people === 1 ? 'person' : 'people'} found. Sending stays off until consent and opt-out are in place.`, cta: 'Open People →', href: '/agents/gtm/people' };

  const milestones = [offersReady, companies > 0, people > 0];
  const doneCount = milestones.filter(Boolean).length;

  return (
    <div>
      <div className={s.status}>
        <span className={s.dot} aria-hidden />
        {hasProfile ? `Company context inherited from your Smart Profile · ${p?.product_name}` : 'No Smart Profile yet — GTM starts from it'}
      </div>

      <section className={s.hero}>
        <div>
          <div className={u.eyebrow}>Your next chapter</div>
          <h1 className={s.title}>Be found.<br /><em>Start better conversations.</em></h1>
          <p className={s.lede}>
            Turn what VaNi knows about your business into discovery improvements, a focused offer and an
            audience worth approaching.
          </p>
        </div>
        <aside className={s.side} aria-label="Recommended next action">
          <div className={u.eyebrow}>Recommended next action</div>
          {loading ? <SkeletonRows rows={2} /> : (
            <>
              <h3>{next.h}</h3>
              <p>{next.p}</p>
              <div className={s.actions}><Link href={next.href} className={s.primary}>{next.cta}</Link></div>
            </>
          )}
        </aside>
      </section>

      <div className={s.grid}>
        <section className={`${s.card} ${s.wide}`}>
          <div className={s.cardHead}>
            <div><div className={u.eyebrow}>01 · Get discovered</div><h2>How easily can customers find you?</h2></div>
            {site.data?.read && (
              <span className={`${u.tag} ${u.tagDim}`}>{site.data.readAt ? `Found during onboarding · ${formatDate(site.data.readAt)}` : 'Found during onboarding'}</span>
            )}
          </div>
          {site.isLoading ? <SkeletonRows rows={1} /> : site.isError ? (
            <p>The website findings could not be loaded: {site.error.message}</p>
          ) : !site.data?.read ? (
            <p>VaNi has not read your website yet. <Link className={s.link} href="/onboarding">Point it at your site →</Link></p>
          ) : site.data.missing === null ? (
            <p>The last read of {site.data.site ?? 'your site'} did not record a health check. Read it again from Knowledge to get one.</p>
          ) : site.data.missing.length === 0 ? (
            <p>The last read of {site.data.site ?? 'your site'} found title, description, link previews, structured data and readable text all present.</p>
          ) : (
            <>
              <p>VaNi&rsquo;s audit of {site.data.site ?? 'your site'}, from your onboarding read: {site.data.missing.length} {site.data.missing.length === 1 ? 'thing makes' : 'things make'} you harder to find.</p>
              <div className={s.findings}>
                {site.data.missing.map((k) => (
                  <div key={k} className={s.finding}>
                    <span className={`${u.tag} ${u.tagWarn}`}>{FINDING_TAGS[k]?.tag ?? k}</span>
                    <b>{FINDING_TAGS[k]?.hook ?? 'missing signal'}</b>
                    <span>{SITE_HEALTH_ADVICE[k] ? `${SITE_HEALTH_ADVICE[k].label}: ${SITE_HEALTH_ADVICE[k].why}.` : ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className={s.micro}>Evidence from your page, not a ranking or visibility score. Guided fixes come with Nova.</p>
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={u.eyebrow}>02 · Reach customers</div>
            <span className={`${u.tag} ${u.tagDim}`}>Not available yet</span>
          </div>
          <h2>Your outreach channels</h2>
          <p>Email and WhatsApp will send under your own business identity. Nothing can be sent until consent and opt-out are in place.</p>
          <div className={s.row}><span>Email</span><span>Not connected</span></div>
          <div className={s.row}><span>WhatsApp Business</span><span>Not connected</span></div>
          <div className={s.row}><span>LinkedIn</span><span>Assisted — you send it yourself</span></div>
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={u.eyebrow}>03 · Your offers</div>
            {o && <span className={`${u.tag} ${offersReady ? u.tagOk : u.tagWarn}`}>{offersReady ? 'Ready' : offerCount ? 'Needs detail' : 'None yet'}</span>}
          </div>
          <h2>What should GTM lead with?</h2>
          {offers.isLoading ? <SkeletonRows rows={1} /> : offerCount ? (
            <div style={{ marginBottom: 12 }}>
              {o!.offers.map((x) => (
                <div key={x.id} className={s.row}>
                  <span>{x.name}</span>
                  <span>{x.is_ready ? 'Ready to research against' : `Needs ${missing.get(x.name)?.length ?? 'more'} detail${(missing.get(x.name)?.length ?? 2) === 1 ? '' : 's'}`}</span>
                </div>
              ))}
            </div>
          ) : <p>No offer yet. VaNi can draft one from your Smart Profile for you to confirm.</p>}
          <Link href="/agents/gtm/offers" className={s.link}>{offerCount ? 'Open offers →' : 'Create an offer →'}</Link>
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={u.eyebrow}>04 · Bring your audience</div>
            {c && <span className={`${u.tag} ${companies ? u.tagOk : u.tagDim}`}>{companies} {companies === 1 ? 'company' : 'companies'} · {people} {people === 1 ? 'person' : 'people'}</span>}
          </div>
          <h2>Start with the people you know</h2>
          <p>Import a contact or company list. Importing a record does not make it qualified, or eligible to contact.</p>
          <div className={s.actions}>
            <Link href="/agents/gtm/import" className={s.link}>Import a list →</Link>
            <Link href="/agents/gtm/audience" className={s.link}>Build the audience →</Link>
          </div>
          <p className={s.micro}>Bringing your own Apollo account is planned.</p>
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={u.eyebrow}>05 · Strengthen your knowledge</div>
            {site.data && <span className={`${u.tag} ${u.tagDim}`}>{site.data.sources >= 20 ? '20+' : site.data.sources} {site.data.sources === 1 ? 'source' : 'sources'} read</span>}
          </div>
          <h2>Give GTM proof to work with</h2>
          <p>Case studies, product documents and customer outcomes help GTM explain relevance with evidence. Upload a PDF, Word or PowerPoint file, or point VaNi at a page.</p>
          <Link href="/smart-profile/knowledge" className={s.link}>Add supporting material →</Link>
        </section>

        <section className={`${s.card} ${s.wide}`}>
          <div className={s.cardHead}>
            <div className={u.eyebrow}>06 · Activate GTM</div>
            <span className={`${u.tag} ${u.tagDim}`}>Not yet</span>
          </div>
          <h2>A clear starting point, with your data use acknowledged</h2>
          <p>
            Activation will confirm your offer and record your acknowledgement of how contact data is used
            (DPDP). The notice is in legal review; until it is published, GTM works without activation and
            nothing can be sent.
          </p>
        </section>
      </div>

      <div className={s.secHead} style={{ marginTop: 22 }}><div className={u.eyebrow}>Your setup at a glance</div></div>
      <div className={s.progress}><span style={{ width: `${(doneCount / 3) * 100}%` }} /></div>
      <p className={s.micro}>
        {doneCount} of 3 milestones · Offer ready {milestones[0] ? '✓' : '—'} · Audience added {milestones[1] ? '✓' : '—'} · People found {milestones[2] ? '✓' : '—'}
        {j?.note ? ` · ${j.note}` : ''}
      </p>
    </div>
  );
}
