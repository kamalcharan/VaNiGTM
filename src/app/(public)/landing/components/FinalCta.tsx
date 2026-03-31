'use client';

import { VdfButton } from '@/components/vdf';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import s from '../page.module.css';

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

export default function FinalCta() {
  const ref = useScrollReveal();
  return (
    <section className={s.finalCta} id="start">
      <div ref={ref} className={`${s.finalCtaContent} ${s.animateOnScroll}`}>
        <h2 className={s.sectionTitle}>
          Your Clients Deserve<br />
          <span className={s.goldText}>Smarter Advice</span>
        </h2>
        <p className={s.finalCtaDesc}>
          Join the early access program and transform your MFD practice with AI-powered intelligence.
          Limited spots for founding members.
        </p>
        <div className={s.finalCtaActions}>
          <VdfButton variant="primary" href="mailto:charan@vikuna.tech?subject=ProessionalKey Early Access" icon={<ArrowIcon />}>
            Request Early Access
          </VdfButton>
          <VdfButton variant="ghost" href="#features">
            Explore Features
          </VdfButton>
        </div>
        <div className={s.finalCtaNote}>No credit card required · Free tier available · Cancel anytime</div>
      </div>
    </section>
  );
}
