'use client';

import { VdfCard, VdfIcon } from '@/components/vdf';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import s from '../page.module.css';

const painPoints = [
  {
    icon: '\uD83D\uDCCA',
    title: 'Scattered Data, Zero Visibility',
    desc: 'Client portfolios in CAMS, KFintech, InvestWell \u2014 none of them talk to each other. You spend hours just getting a consolidated view.',
  },
  {
    icon: '\u23F0',
    title: 'Manual Reporting Kills Weekends',
    desc: 'Every quarter, you\u2019re copy-pasting NAVs, computing XIRR in Excel, and formatting reports that clients barely read.',
  },
  {
    icon: '\uD83C\uDFAF',
    title: 'Goal Planning is Guesswork',
    desc: 'SIP calculators tell you nothing about goal gaps, tax harvesting opportunities, or when to rebalance. Clients deserve better.',
  },
  {
    icon: '\uD83D\uDD15',
    title: 'SIP Bounces Go Unnoticed',
    desc: 'A bounced SIP means lost AUM and a disappointed client. Without alerts, you find out weeks later \u2014 if at all.',
  },
];

function PainCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={s.animateOnScroll}>
      <VdfCard variant="glass" accentColor="var(--color-accent3)" hoverLift>
        <VdfIcon size="sm" glowColor="rgba(232, 139, 139, 0.1)">
          <span>{icon}</span>
        </VdfIcon>
        <h3 className={s.painTitle}>{title}</h3>
        <p className={s.painDesc}>{desc}</p>
      </VdfCard>
    </div>
  );
}

export default function PainSection() {
  const ref = useScrollReveal();
  return (
    <section className={s.painSection}>
      <div ref={ref} className={s.animateOnScroll}>
        <div className={s.sectionEyebrow}>The problem</div>
        <h2 className={s.sectionTitle}>
          You Became an MFD to Build Wealth.<br />Not to Drown in Spreadsheets.
        </h2>
      </div>
      <div className={s.painGrid}>
        {painPoints.map((p) => (
          <PainCard key={p.title} {...p} />
        ))}
      </div>
    </section>
  );
}
