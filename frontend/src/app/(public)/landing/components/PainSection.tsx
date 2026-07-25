'use client';

import { VdfCard, VdfIcon } from '@/components/vdf';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import s from '../page.module.css';

const painPoints = [
  {
    icon: '\uD83D\uDCCA',
    title: 'Your GTM Lives in Ten Tabs',
    desc: 'ICP in a doc, leads in a spreadsheet, sequences in one tool, analytics in another \u2014 nothing talks to each other, and no one has the whole picture.',
  },
  {
    icon: '\u23F0',
    title: 'Outreach Is a Copy-Paste Grind',
    desc: 'Personalizing every email and message by hand, then chasing replies across email, WhatsApp, and LinkedIn. It doesn\u2019t scale, and it burns the team out.',
  },
  {
    icon: '\uD83C\uDFAF',
    title: 'Targeting Is a Guess',
    desc: 'You spray a generic list and hope. No real ICP, no buying signals, no idea who is actually in-market right now.',
  },
  {
    icon: '\uD83D\uDD15',
    title: 'You Can\u2019t See What\u2019s Working',
    desc: 'Which message, which channel, which segment is converting? Without live observability, every decision is a shot in the dark.',
  },
];

function PainCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={s.animateOnScroll}>
      <VdfCard variant="glass" accentColor="var(--color-accent3)" hoverLift>
        <VdfIcon size="sm" glowColor="var(--color-accent3)">
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
          You Built a Product to Win Customers.<br />Not to Wrestle a GTM Stack.
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
