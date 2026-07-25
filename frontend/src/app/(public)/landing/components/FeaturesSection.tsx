'use client';

import { VdfCard, VdfIcon } from '@/components/vdf';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import s from '../page.module.css';

interface Feature {
  icon: string;
  title: string;
  desc: string;
  tag: string;
  accent: string;  // CSS variable name
}

const features: Feature[] = [
  {
    icon: '\uD83E\uDDED',
    title: 'ICP & Persona Engine',
    desc: 'Define your ideal customer once \u2014 personas, buying signals, company size, and geography. VaNi turns your product into a targetable profile that every agent works from.',
    tag: 'the foundation',
    accent: 'var(--color-primary)',
  },
  {
    icon: '\uD83D\uDD0C',
    title: 'Channel Orchestration',
    desc: 'Connect email, WhatsApp, and LinkedIn, then set the rules. Agents sequence outreach across channels \u2014 the right message, on the right channel, at the right time.',
    tag: 'multi-channel',
    accent: 'var(--color-accent)',
  },
  {
    icon: '\uD83D\uDD0E',
    title: 'AEO & Content',
    desc: 'Track your visibility in AI answers, target the queries your buyers ask, and build content clusters that get you cited. Own the answer, not just the search result.',
    tag: 'AI visibility',
    accent: 'var(--color-accent2)',
  },
  {
    icon: '\uD83E\uDE9C',
    title: 'Sequence Builder',
    desc: 'Design multi-step outreach in a visual flow builder with an inline template editor. Agents draft, personalize, and run each step \u2014 grounded in your ICP, not generic spam.',
    tag: 'automated outreach',
    accent: 'var(--color-accent4)',
  },
  {
    icon: '\uD83C\uDFAF',
    title: 'Storyteller Decks',
    desc: 'Generate a tailored pitch deck from your profile in seconds, share it with a single link, and let VaNi field audience questions live \u2014 grounded in your own knowledge.',
    tag: 'live pitch',
    accent: 'var(--color-warning)',
  },
  {
    icon: '\uD83D\uDEF0\uFE0F',
    title: 'Agent War Room',
    desc: 'A live mission-control view of every agent run, pipeline stage, and signal \u2014 with full decision logs and performance analytics. See what the agents did, and why.',
    tag: 'observability',
    accent: 'var(--color-accent3)',
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={s.animateOnScroll}>
      <VdfCard variant="glass" accentColor={feature.accent} hoverLift>
        <VdfIcon size="md" glowColor={feature.accent}>
          <span>{feature.icon}</span>
        </VdfIcon>
        <h3 className={s.featureTitle}>{feature.title}</h3>
        <p className={s.featureDesc}>{feature.desc}</p>
        <span
          className={s.featureTag}
          style={{ '--tag-accent': feature.accent } as React.CSSProperties}
        >
          {feature.tag}
        </span>
      </VdfCard>
    </div>
  );
}

export default function FeaturesSection() {
  const ref = useScrollReveal();
  return (
    <section className={s.features} id="features">
      <div ref={ref} className={`${s.featuresHeader} ${s.animateOnScroll}`}>
        <div className={s.sectionEyebrow}>What&apos;s inside</div>
        <h2 className={s.sectionTitle}>
          Six Agents. One Engine.<br />Your Whole GTM.
        </h2>
        <p className={s.featuresSubtitle}>
          Every capability is purpose-built for how modern go-to-market actually works — agents that run the play, not another dashboard to babysit.
        </p>
      </div>
      <div className={s.featuresGrid}>
        {features.map((f) => (
          <FeatureCard key={f.title} feature={f} />
        ))}
      </div>
    </section>
  );
}
