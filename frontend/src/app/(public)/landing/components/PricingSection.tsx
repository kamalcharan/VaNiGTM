'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import PricingCard from './PricingCard';
import s from '../page.module.css';

const tiers = [
  {
    tier: 'Starter',
    description: 'For individual MFDs getting started',
    price: '0',
    features: ['Up to 50 clients', 'Portfolio & NAV tracking', 'CAS import (CAMS/KFintech)', 'Basic goal planning', '1 user seat'],
    ctaLabel: 'Get Started Free',
    ctaHref: '#start',
  },
  {
    tier: 'Professional',
    description: 'For growing MFD practices',
    price: '1,999',
    features: ['Up to 500 clients', 'All 8 skill modules', 'Auto-generated reports', 'SIP bounce alerts', 'Tax harvest optimizer', '5 user seats', 'Priority support'],
    ctaLabel: 'Start 14-Day Trial',
    ctaHref: '#start',
    featured: true,
    badge: 'Most Popular',
  },
  {
    tier: 'Enterprise',
    description: 'For large firms & RIAs',
    price: '4,999',
    features: ['Unlimited clients', 'White-label client portal', 'Custom branding & themes', 'API access', 'Unlimited seats', 'Dedicated account manager', 'SLA guarantee'],
    ctaLabel: 'Contact Sales',
    ctaHref: '#start',
  },
];

export default function PricingSection() {
  const ref = useScrollReveal();
  return (
    <section className={s.pricing} id="pricing">
      <div ref={ref} className={`${s.pricingHeader} ${s.animateOnScroll}`}>
        <div className={s.sectionEyebrow}>Simple pricing</div>
        <h2 className={s.sectionTitle}>Built for MFDs, Priced for Growth</h2>
        <p className={s.pricingSubtitle}>Start free. Scale when you&apos;re ready. No hidden fees.</p>
      </div>
      <div className={s.pricingGrid}>
        {tiers.map((t) => (
          <div key={t.tier} className={s.animateOnScroll}>
            <PricingCard {...t} />
          </div>
        ))}
      </div>
    </section>
  );
}
