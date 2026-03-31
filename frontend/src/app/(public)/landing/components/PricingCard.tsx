import { VdfCard, VdfBadge, VdfButton } from '@/components/vdf';
import s from '../page.module.css';

interface PricingCardProps {
  tier: string;
  description: string;
  currency?: string;
  price: string;
  period?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
  badge?: string;
}

export default function PricingCard({
  tier,
  description,
  currency = '\u20B9',
  price,
  period = '/ month',
  features,
  ctaLabel,
  ctaHref,
  featured,
  badge,
}: PricingCardProps) {
  return (
    <VdfCard variant={featured ? 'featured' : 'glass'} hoverLift className={s.pricingCard}>
      {badge && <VdfBadge variant="gold" className={s.pricingBadge}>{badge}</VdfBadge>}
      <div className={s.pricingTier}>{tier}</div>
      <div className={s.pricingDesc}>{description}</div>
      <div className={s.pricingAmount}>
        <span className={s.pricingCurrency}>{currency}</span>
        <span className={s.pricingValue}>{price}</span>
        <span className={s.pricingPeriod}>{period}</span>
      </div>
      <ul className={s.pricingFeatures}>
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <VdfButton
        variant={featured ? 'primary' : 'ghost'}
        href={ctaHref}
        fullWidth
        size="md"
      >
        {ctaLabel}
      </VdfButton>
    </VdfCard>
  );
}
