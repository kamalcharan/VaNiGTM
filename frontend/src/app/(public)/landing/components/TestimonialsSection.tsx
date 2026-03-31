'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import TestimonialCard from './TestimonialCard';
import s from '../page.module.css';

const testimonials = [
  {
    quote: 'I was spending 3 hours every Saturday building client reports in Excel. Now it\u2019s one click. My weekends are mine again.',
    authorName: 'Rajesh Kumar',
    authorRole: 'Independent MFD, Pune \u00B7 180 clients',
    authorInitials: 'RK',
  },
  {
    quote: 'The goal-gap visualization changed how I have conversations with clients. They see the math, they trust the plan. My SIP book grew 40% in 6 months.',
    authorName: 'Priya Sharma',
    authorRole: 'Wealth Planner, Bangalore \u00B7 320 clients',
    authorInitials: 'PS',
  },
  {
    quote: 'We onboarded our entire firm in one afternoon. CAS import parsed 12,000 transactions without a single mismatch. That\u2019s never happened before.',
    authorName: 'Anil Mehta',
    authorRole: 'Director, Finwise Distributors \u00B7 1,200 clients',
    authorInitials: 'AM',
  },
];

export default function TestimonialsSection() {
  const ref = useScrollReveal();
  return (
    <section className={s.testimonials}>
      <div ref={ref} className={`${s.testimonialsHeader} ${s.animateOnScroll}`}>
        <div className={s.sectionEyebrow}>What MFDs are saying</div>
        <h2 className={s.sectionTitle}>Built With Distributors, For Distributors</h2>
      </div>
      <div className={s.testimonialsGrid}>
        {testimonials.map((t) => (
          <div key={t.authorInitials} className={s.animateOnScroll}>
            <TestimonialCard {...t} />
          </div>
        ))}
      </div>
    </section>
  );
}
