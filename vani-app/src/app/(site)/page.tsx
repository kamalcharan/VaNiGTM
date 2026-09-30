/**
 * vani.vikuna.io — what you land on.
 *
 * The story is the knowledge graph: type your website, and VaNi shows what it
 * learned — a card, a digital audit of how the homepage is found, and the
 * graph itself, "this is your data". Then how GTM uses that graph, and a
 * Request access form: VaNi is in closed beta.
 *
 * Spec and rulings: VaNiGTM documents/design-notes-landing.md (Charan,
 * 2026-09-30). Not on this page, deliberately: Vara, Nova, pricing,
 * testimonials, customer logos.
 *
 * Public — no auth. The interactive parts are client components under
 * src/site/; this file is the server-rendered frame and the copy.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { TryBox, TryResult } from '@/site/TrySite';
import { SampleGraph } from '@/site/SampleGraph';
import { GtmIllustration } from '@/site/GtmIllustration';
import { RequestAccess } from '@/site/RequestAccess';
import s from '@/site/landing.module.css';

export const metadata: Metadata = {
  title: 'VaNi — your business, written down once and used everywhere',
  description:
    'Type your website. VaNi reads it and shows you what it learned — what you sell, who you sell to, the problems you solve — as a knowledge graph your sales and marketing run on. Closed beta.',
  robots: { index: true, follow: true },
};

const SITE = 'https://www.vikuna.io';

/** The kinds VaNi sorts what it reads into — the graph's columns, in the console's words. */
const KINDS: [string, string][] = [
  ['What you sell', 'products, capabilities, pricing'],
  ['Who you sell to', 'the buyer, the industry'],
  ['Problems you solve', 'the pain, the use case'],
  ['Why you', 'what sets you apart, who you compete with'],
  ['Proof', 'case studies, numbers'],
];

const PAINS: [string, string][] = [
  ['It lives in the founder’s head', 'What you sell, to whom, and why you win is explained afresh on every call and in every WhatsApp thread.'],
  ['Every new person starts from zero', 'A new salesperson, agency or freelancer asks the questions you answered last month.'],
  ['Three versions of your story', 'The website says one thing, the brochure another, the sales pitch a third.'],
  ['Follow-ups slip', 'Leads go quiet in a spreadsheet, because nobody sees them going quiet.'],
];

const TRUST: [string, string][] = [
  ['Your data is yours', 'Every workspace is isolated from every other at the database level. What VaNi learns about you is used for you.'],
  ['Nothing goes out without you', 'Every message VaNi writes is a draft until you approve it.'],
  ['Built for India’s DPDP Act', 'You accept the outreach notice before VaNi contacts anyone, you can switch outreach off in Settings, and opt-outs are honoured on every channel.'],
  ['Your own AI model, if you prefer', 'Use VaNi’s model, or connect your own provider and key.'],
];

export default function LandingPage() {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <a className={s.brand} href={SITE}>
          <span className={s.brandMark}>VaNi</span>
          <span className={s.brandSub}>by Vikuna</span>
        </a>
        <nav className={s.headNav}>
          <a className={s.headLink} href="#why">Why</a>
          <a className={s.headLink} href="#gtm">How it works</a>
          <a className={s.headLink} href="#request-access">Request access</a>
          <Link className={s.headCta} href="/login">Sign in</Link>
        </nav>
      </header>

      <section className={s.hero}>
        <div className={s.heroGlow} />
        <div className={s.heroGrid}>
          <div>
            <div className={s.badge}>Closed beta</div>
            <h1 className={s.h1}>VaNi learns your business from your website.</h1>
            <p className={s.heroBody}>
              Type your website. In about a minute VaNi reads it and shows you what it learned:
              what you sell, who you sell to, the problems you solve, and how your homepage is
              found online.
            </p>
            <TryBox />
          </div>
          <div className={s.kinds} aria-label="What VaNi sorts your business into">
            <div className={s.kindsHead}>Your knowledge graph</div>
            {KINDS.map(([k, what], i) => (
              <div className={s.kind} key={k}>
                <span className={s.kindNum}>{String(i + 1).padStart(2, '0')}</span>
                <span><span className={s.kindName}>{k}</span><span className={s.kindWhat}>{what}</span></span>
              </div>
            ))}
            <div className={s.kindsFoot}>…and every relationship between them, each traced to where it was read.</div>
          </div>
        </div>
      </section>

      <div className={s.inner}><TryResult /></div>

      <SampleGraph />

      <div className={s.rule}><span>// WHY A KNOWLEDGE GRAPH</span></div>
      <section className={s.section} id="why">
        <div className={s.inner}>
          <h2 className={s.h2}>Your business, written down once,<br /><em>and used everywhere.</em></h2>
          <p className={s.lede}>
            Most growing businesses already know everything they need to sell well. It is just
            not written down anywhere a person, or an agent, can use it.
          </p>
          <div className={s.pains}>
            {PAINS.map(([t, d]) => (
              <div className={s.pain} key={t}>
                <h3 className={s.painTitle}>{t}</h3>
                <p className={s.painBody}>{d}</p>
              </div>
            ))}
          </div>
          <p className={s.lede}>
            VaNi reads your website, your documents and your conversations, and keeps what it
            learns as one graph. <strong>You correct it; everything VaNi does reads from it.</strong>
          </p>
        </div>
      </section>

      <div className={s.rule}><span>// HOW GTM USES IT</span></div>
      <section className={s.section} id="gtm">
        <div className={s.inner}>
          <h2 className={s.h2}>From the graph<br /><em>to the people who should hear about you.</em></h2>
          <p className={s.lede}>
            VaNi’s go-to-market agent takes who you sell to and what hurts them, finds the
            companies that fit, drafts the journey, and keeps the follow-ups from slipping.
            <strong> You approve everything that goes out.</strong>
          </p>
          <GtmIllustration />
        </div>
      </section>

      <div className={s.rule}><span>// TRUST</span></div>
      <section className={s.section}>
        <div className={s.inner}>
          <div className={s.trust}>
            {TRUST.map(([t, d]) => (
              <div className={s.trustItem} key={t}>
                <h3 className={s.painTitle}>{t}</h3>
                <p className={s.painBody}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.final} id="request-access">
        <div className={s.finalGlow} />
        <div className={s.finalInner}>
          <h2 className={s.finalH2}>Request <em>access.</em></h2>
          <p className={s.finalP}>
            VaNi is in closed beta, starting with Indian businesses. Tell us who you are and we
            will be in touch.
          </p>
          <RequestAccess />
          <p className={s.finalSmall}>Already have access? <Link href="/login">Sign in</Link></p>
        </div>
      </section>

      <footer className={s.foot}>
        <span>VaNi · Vikuna Technologies</span>
        <span><a href={SITE}>vikuna.io ↗</a></span>
      </footer>
    </div>
  );
}
