/**
 * vani.vikuna.io — what you land on.
 *
 * This is the VaNi story, moved here from the marketing site. It lives in the
 * console app on purpose: typing the URL and arriving from vikuna.io must reach
 * the same place, and one copy cannot drift from another. The marketing site
 * now redirects /vani here rather than keeping its own version.
 *
 * Public — no auth. The console behind /login is the same app wearing the same
 * palette and type, so signing in changes what you can do, not what you are
 * looking at.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import s from './story.module.css';

export const metadata: Metadata = {
  title: 'VaNi — Vikuna’s AI framework',
  description:
    'VaNi is the framework every Vikuna product is built on — event-driven, ROI-first, human-in-the-loop. Internal by design.',
  robots: { index: true, follow: true },
};

const SITE = 'https://www.vikuna.io';
const CALENDLY = 'https://calendly.com/connect-vikuna/30min';

const pillars = [
  {
    num: '01',
    tag: 'Discovery',
    title: 'Use case discovery & ROI mapping',
    detail: (
      <>
        No use case moves forward without a business case. Every opportunity is mapped to a
        measurable outcome — cost saved, time freed, errors eliminated.{' '}
        <strong>If the ROI isn’t clear, we don’t build it.</strong>
      </>
    ),
  },
  {
    num: '02',
    tag: 'Architecture',
    title: 'UNS + event-driven architecture',
    detail: (
      <>
        Built on a Unified Namespace — a single data layer connecting systems, devices and
        services. <strong>Agents don’t poll; they respond to events</strong> as they happen,
        which is what makes automation real-time and contextual.
      </>
    ),
  },
  {
    num: '03',
    tag: 'Design',
    title: 'Human-in-the-loop by design',
    detail: (
      <>
        Agents handle the routine, humans handle the judgement. Every deployment has clear
        escalation paths, so when an agent reaches a decision boundary{' '}
        <strong>the right person gets the right context</strong>. No black boxes.
      </>
    ),
  },
  {
    num: '04',
    tag: 'Delivery',
    title: 'Custom-built. No off-the-shelf.',
    detail: (
      <>
        <strong>VaNi is not a product you licence.</strong> Every agent, workflow and
        integration is built for a specific environment — its data structures, its business
        rules, its edge cases.
      </>
    ),
  },
  {
    num: '05',
    tag: 'Outcomes',
    title: 'Measurable outcomes before scale',
    detail: (
      <>
        Nothing scales before it is proven. Deployments start with a controlled rollout — one
        process, one team, one workflow. <strong>Measure, prove, then expand.</strong>
      </>
    ),
  },
];

const deployments = [
  {
    name: 'ContractNest',
    kind: 'Our product',
    accent: 'var(--ac-light)',
    role: 'Virtual ops agent',
    body: 'Runs service contracts end to end — scheduling, invoicing and notifications — escalating to a human the moment a decision needs judgement rather than a rule.',
  },
  {
    name: 'DristiQ',
    kind: 'Our product',
    accent: 'var(--gold-light)',
    role: 'Quant data analytics',
    body: 'Reads market and time-cycle data across many independent lenses and surfaces where they converge, as research rather than recommendation.',
  },
  {
    name: 'VaNi App',
    kind: 'Our product',
    accent: 'var(--teal-light)',
    role: 'Assessments',
    body: 'Generates and scores NEET assessments for students preparing across three languages, adapting to where each student actually loses marks.',
  },
  {
    name: 'ProKey',
    kind: 'Built for a customer',
    accent: '#8b93ff',
    role: 'Intake · Lead management · FP&A',
    body: 'Captures intake, manages leads through the pipeline, and runs financial planning analysis — a customer platform on the same framework as our own.',
  },
];

const skills = [
  { name: 'Virtual Ops Agent', where: 'Service contracts, invoicing, notifications, human handover — live in ContractNest.' },
  { name: 'Quant Data Analytics', where: 'Multi-lens market and time-cycle analysis — live in DristiQ.' },
  { name: 'Assessments', where: 'NEET assessment generation and scoring — live in the VaNi App.' },
  { name: 'Intake & Lead Management', where: 'Capture through pipeline — live in ProKey.' },
  { name: 'Financial Planning Analysis', where: 'FP&A workflows — live in ProKey.' },
  { name: 'GTM', where: 'Go-to-market prospecting and account intelligence.', upcoming: true },
];

const orbitNodes = [
  { label: 'ContractNest', angle: -90 },
  { label: 'DristiQ', angle: -18 },
  { label: 'ProKey', angle: 54 },
  { label: 'VaNi App', angle: 126 },
  { label: '…more', angle: 198 },
];

function Orbit() {
  const cx = 220, cy = 220, r = 148;
  return (
    <div className={s.orbitWrap}>
      <svg viewBox="0 0 440 440" role="img" aria-label="VaNi at the core, with the products built on it around it">
        <circle cx={cx} cy={cy} r={r + 40} fill="none" stroke="rgba(201,151,58,0.08)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(201,151,58,0.22)" strokeWidth="1" strokeDasharray="3 5" />
        <circle cx={cx} cy={cy} r={r - 46} fill="none" stroke="rgba(201,151,58,0.1)" strokeWidth="1" />
        {orbitNodes.map((n) => {
          const rad = (n.angle * Math.PI) / 180;
          const x = cx + r * Math.cos(rad);
          const y = cy + r * Math.sin(rad);
          const more = n.label === '…more';
          const col = more ? 'rgba(255,255,255,0.32)' : '#E0B65C';
          return (
            <g key={n.label}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(201,151,58,0.2)" strokeWidth="1" />
              <circle cx={x} cy={y} r="7" fill="#070B16" stroke={col} strokeWidth="1.5" />
              <circle cx={x} cy={y} r="2.6" fill={col} />
              <text
                x={x}
                y={y + (Math.sin(rad) < -0.3 ? -18 : 24)}
                textAnchor="middle"
                fill={more ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.72)'}
                fontFamily="var(--mono)"
                fontSize="11.5"
              >
                {n.label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="46" fill="rgba(201,151,58,0.1)" stroke="rgba(201,151,58,0.5)" strokeWidth="1.5" />
        <text x={cx} y={cy + 9} textAnchor="middle" fill="#C9973A" fontFamily="var(--display)" fontSize="27" fontWeight="800">
          VaNi
        </text>
      </svg>
    </div>
  );
}

export default function StoryPage() {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <a className={s.brand} href={SITE}>
          <span className={s.brandMark}>VaNi</span>
          <span className={s.brandSub}>by Vikuna</span>
        </a>
        <nav className={s.headNav}>
          <a className={s.headLink} href="#pillars">How it works</a>
          <a className={s.headLink} href="#where">Where it runs</a>
          <a className={s.headLink} href={SITE}>Vikuna ↗</a>
          <Link className={s.headCta} href="/login">Sign in</Link>
        </nav>
      </header>

      <section className={s.hero}>
        <div className={s.heroGlow} />
        <div className={s.heroMesh} />
        <div className={s.heroGrid}>
          <div>
            <div className={s.badge}>Vikuna’s AI Framework</div>
            <h1 className={s.h1}>VaNi</h1>
            <div className={s.heroSub}>Not a product. A way of working.</div>
            <p className={s.heroBody}>
              VaNi is the framework every Vikuna product is built on — event-driven, ROI-first,
              human-in-the-loop. <strong>It is internal by design.</strong> You don’t licence
              VaNi; you see it working in the products it runs.
            </p>
            <div className={s.ctas}>
              <Link className={s.btnPrimary} href="/login">Sign in to VaNi →</Link>
              <a className={s.btnGhost} href="#where">See where it runs ↓</a>
            </div>
            <div className={s.meta}>
              <span>Internal framework</span>
              <span>Invitation only</span>
              <span>No public registration</span>
            </div>
          </div>
          <Orbit />
        </div>
      </section>

      <div className={s.rule}><span>// WHAT VANI IS</span></div>
      <section className={s.section}>
        <div className={s.inner}>
          <div className={s.eyebrow}>The short version</div>
          <h2 className={s.h2}>Most AI fails in production.<br />VaNi is <em>what we did about it.</em></h2>
          <p className={s.lede}>
            VaNi began as a name and became a way of working — hard rules about what gets
            built, how it is architected, and when a human has to be in the loop. It is not a
            platform we sell and not a model we trained.{' '}
            <strong>It is the discipline that decides whether an AI system survives contact
            with a real business</strong>, and the reason our products behave the same way in
            unrelated industries.
          </p>
        </div>
      </section>

      <div className={s.rule}><span>// CORE PILLARS</span></div>
      <section className={s.section} id="pillars">
        <div className={s.inner}>
          <div className={s.eyebrow}>Five principles</div>
          <h2 className={s.h2}>How VaNi is different.</h2>
          <p className={s.lede}>
            Five principles that hold on every engagement, regardless of industry, company
            size or use case.
          </p>
          <div className={s.pillars}>
            {pillars.map((p) => (
              <div className={s.pillar} key={p.num}>
                <div className={s.pillarNum}>{p.num}</div>
                <div>
                  <div className={s.pillarTag}>{p.tag}</div>
                  <h3 className={s.pillarTitle}>{p.title}</h3>
                </div>
                <p className={s.pillarDetail}>{p.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={s.rule}><span>// WHERE VANI RUNS</span></div>
      <section className={s.section} id="where">
        <div className={s.inner}>
          <div className={s.eyebrow}>In production today</div>
          <h2 className={s.h2}>One framework,<br /><em>four very different jobs.</em></h2>
          <p className={s.lede}>
            The clearest way to understand VaNi is to look at what it is already doing. These
            businesses have nothing in common — contracts, markets, exams, financial planning
            — and <strong>the same framework sits under all of them.</strong>
          </p>
          <div className={s.deployGrid}>
            {deployments.map((d) => (
              <div className={s.deploy} key={d.name} style={{ borderLeftColor: d.accent }}>
                <div className={s.deployTop}>
                  <span className={s.deployName}>{d.name}</span>
                  <span
                    className={s.deployKind}
                    style={{ color: d.accent, border: `1px solid ${d.accent}55`, background: `${d.accent}18` }}
                  >
                    {d.kind}
                  </span>
                </div>
                <div className={s.deployRole} style={{ color: d.accent }}>{d.role}</div>
                <p>{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={s.rule}><span>// SKILLS</span></div>
      <section className={s.section}>
        <div className={s.inner}>
          <div className={s.eyebrow}>The capability library</div>
          <h2 className={s.h2}>VaNi grows by <em>skills.</em></h2>
          <p className={s.lede}>
            A skill is a capability the framework carries into any deployment. Each was built
            for a real product first and then generalised — <strong>never the other way
            round.</strong>
          </p>
          <div className={s.skillGrid}>
            {skills.map((k) => (
              <div key={k.name} className={`${s.skill} ${k.upcoming ? s.skillUpcoming : ''}`}>
                <div className={s.skillState}>{k.upcoming ? 'Releasing later' : 'Live'}</div>
                <div className={s.skillName}>{k.name}</div>
                <div className={s.skillWhere}>{k.where}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.final}>
        <div className={s.finalGlow} />
        <div className={s.finalInner}>
          <h2 className={s.finalH2}>Already have <em>access?</em></h2>
          <p className={s.finalP}>
            VaNi is an internal platform. Accounts are issued to the Vikuna team and to
            partners on active engagements — there is no public sign-up.
          </p>
          <div className={s.finalCtas}>
            <Link className={s.btnPrimary} href="/login">Sign in to VaNi →</Link>
            <a className={s.btnGhost} href={CALENDLY} target="_blank" rel="noopener noreferrer">
              Talk to us about an engagement
            </a>
          </div>
        </div>
      </section>

      <footer className={s.foot}>
        <span>VaNi · Vikuna Technologies</span>
        <span><a href={SITE}>vikuna.io ↗</a></span>
      </footer>
    </div>
  );
}
