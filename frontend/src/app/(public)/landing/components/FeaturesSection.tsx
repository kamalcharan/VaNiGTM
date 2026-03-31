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
    icon: '\uD83D\uDCC8',
    title: 'Portfolio Intelligence',
    desc: 'Consolidated holdings across AMCs with real-time NAV tracking, XIRR computation, and asset allocation breakdowns. See what matters \u2014 instantly.',
    tag: '4 handlers',
    accent: 'var(--color-primary)',
  },
  {
    icon: '\uD83D\uDC65',
    title: 'Client 360\u00B0',
    desc: 'Complete client profiles with family mapping, goal tracking, KYC status, and communication history. Every relationship, fully visible.',
    tag: '3 handlers',
    accent: 'var(--color-accent)',
  },
  {
    icon: '\uD83D\uDCE1',
    title: 'Market Pulse',
    desc: 'NAV feeds, category performance, fund comparisons, and trending schemes \u2014 updated daily from MFAPI. Know the market before your clients ask.',
    tag: '5 handlers',
    accent: 'var(--color-accent2)',
  },
  {
    icon: '\uD83C\uDFAF',
    title: 'Goal-Based Planning',
    desc: 'SIP calculators, retirement planning, tax-harvest optimizer, and portfolio rebalancing \u2014 all backed by real numbers, not assumptions.',
    tag: '5 handlers',
    accent: 'var(--color-accent4)',
  },
  {
    icon: '\uD83D\uDCE5',
    title: 'Smart Import',
    desc: 'Upload CAS statements from CAMS/KFintech, InvestWell exports, or MFAPI feeds. Auto-parsed, auto-matched, auto-reconciled.',
    tag: '4 handlers',
    accent: 'var(--color-warning)',
  },
  {
    icon: '\uD83D\uDD14',
    title: 'Alerts & Reports',
    desc: 'SIP bounce detection, maturity reminders, portfolio review triggers, and auto-generated quarterly reports. Your practice runs on autopilot.',
    tag: 'coming soon',
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
          Six Skills. One Platform.<br />Complete Control.
        </h2>
        <p className={s.featuresSubtitle}>
          Every skill is purpose-built for how Indian MFDs actually work — not retrofitted from generic CRM tools.
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
