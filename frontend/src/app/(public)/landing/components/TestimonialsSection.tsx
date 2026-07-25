'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import TestimonialCard from './TestimonialCard';
import s from '../page.module.css';

// NOTE: placeholder testimonials \u2014 replace with real, attributed quotes before public launch.
const testimonials = [
  {
    quote: 'We went from a messy prospect spreadsheet to a live outbound motion in an afternoon. VaNi built our ICP and drafted the first sequence before I finished my coffee.',
    authorName: 'Early access member',
    authorRole: 'Founder \u00B7 Seed-stage SaaS',
    authorInitials: 'EA',
  },
  {
    quote: 'The agents run outreach across email and LinkedIn while we sleep. The War Room shows exactly what is landing \u2014 no more guessing which message works.',
    authorName: 'Design partner',
    authorRole: 'Head of Growth \u00B7 Series A',
    authorInitials: 'DP',
  },
  {
    quote: 'One share link and VaNi fielded the prospect questions live during the pitch. It felt like having a GTM team of ten.',
    authorName: 'Founding user',
    authorRole: 'Solo founder \u00B7 B2B',
    authorInitials: 'FU',
  },
];

export default function TestimonialsSection() {
  const ref = useScrollReveal();
  return (
    <section className={s.testimonials}>
      <div ref={ref} className={`${s.testimonialsHeader} ${s.animateOnScroll}`}>
        <div className={s.sectionEyebrow}>Early access</div>
        <h2 className={s.sectionTitle}>Built for Modern GTM Teams</h2>
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
