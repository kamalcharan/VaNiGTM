'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import PricingCard from './PricingCard';
import s from '../page.module.css';

const tiers = [
  {
    tier: 'Starter',
    currency: '$',
    description: 'For founders running their first motion',
    price: '0',
    features: ['1 active mission', 'Core GTM agents', 'ICP & persona builder', 'Email outreach', '1 seat'],
    ctaLabel: 'Get Started Free',
    ctaHref: '/register',
  },
  {
    tier: 'Professional',
    currency: '$',
    description: 'For teams scaling outbound',
    price: '49',
    features: ['Up to 5 missions', 'All agents & channels', 'Sequence builder + Storyteller decks', 'Agent War Room', '5 seats', 'Priority support'],
    ctaLabel: 'Start 14-Day Trial',
    ctaHref: '/register',
    featured: true,
    badge: 'Most Popular',
  },
  {
    tier: 'Enterprise',
    currency: '$',
    description: 'For companies running GTM at scale',
    price: '199',
    features: ['Unlimited missions & contacts', 'All channels + AEO', 'API access', 'SSO & audit logs', 'Unlimited seats', 'Dedicated success manager'],
    ctaLabel: 'Contact Sales',
    ctaHref: '/register',
  },
];

export default function PricingSection() {
  const ref = useScrollReveal();
  return (
    <section className={s.pricing} id="pricing">
      <div ref={ref} className={`${s.pricingHeader} ${s.animateOnScroll}`}>
        <div className={s.sectionEyebrow}>Simple pricing</div>
        <h2 className={s.sectionTitle}>Built for Operators, Priced for Growth</h2>
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
