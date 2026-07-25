'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VdfBadge, VdfButton } from '@/components/vdf';
import StatsRibbon from './StatsRibbon';
import s from '../page.module.css';

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

export default function HeroSection() {
  const router = useRouter();
  const [domain, setDomain] = useState('');

  // PLG hook: the domain is the CTA. Stash it so the mission wizard
  // prefills step 1 right after registration.
  const startWithDomain = () => {
    const d = domain.trim();
    if (d) {
      try { sessionStorage.setItem('gtm-domain-hint', d); } catch {}
    }
    router.push('/register');
  };

  return (
    <section className={s.hero}>
      <div className={s.heroStagger0}>
        <VdfBadge variant="success" dot>Now in Early Access</VdfBadge>
      </div>
      <h1 className={s.heroStagger1}>
        Your Go-To-Market,<br />
        <span className={s.goldText}>Run by Agents</span>
      </h1>
      <p className={s.heroSub}>
        Vikuna GTM turns your product into an intelligent growth operation — define your ICP,
        connect your channels, and deploy AI agents that find, engage, and convert your ideal
        customers. From positioning to pipeline, on autopilot.
      </p>
      {/* PLG hook — the product starts working before the signup form */}
      <div className={s.heroDomainRow}>
        <input
          className={s.heroDomainInput}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') startWithDomain(); }}
          placeholder="yourcompany.com"
          aria-label="Your website domain"
        />
        <VdfButton variant="primary" onClick={startWithDomain} icon={<ArrowIcon />}>
          Watch VaNi learn your business
        </VdfButton>
      </div>
      <div className={s.heroActions}>
        <VdfButton variant="ghost" href="/register">
          Or start without a domain
        </VdfButton>
        <VdfButton variant="ghost" href="#features">
          See What&apos;s Inside
        </VdfButton>
      </div>
      {/* 10s muted loop of the agent-led wizard — synthetic data (POA 1.4) */}
      <div className={s.heroVideoWrap}>
        <video
          className={s.heroVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Ten-second loop of the agent-led onboarding: type a domain, the agent researches your company, drafts campaigns, finds prospects and writes a personalized email"
        >
          <source src="/media/wizard-loop.webm" type="video/webm" />
          <source src="/media/wizard-loop.mp4" type="video/mp4" />
        </video>
      </div>
      <StatsRibbon />
    </section>
  );
}
