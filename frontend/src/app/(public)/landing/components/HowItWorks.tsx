'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import Stepper from './Stepper';
import s from '../page.module.css';

export default function HowItWorks() {
  const ref = useScrollReveal();
  return (
    <section className={s.howItWorks} id="how-it-works">
      <div ref={ref} className={`${s.howItWorksHeader} ${s.animateOnScroll}`}>
        <div className={s.sectionEyebrow}>Getting started</div>
        <h2 className={s.sectionTitle}>
          From Signup to Intelligence<br />in Under 10 Minutes
        </h2>
      </div>
      <Stepper />
    </section>
  );
}
