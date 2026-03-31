'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import s from '../page.module.css';

interface StepItem {
  title: string;
  description: string;
  meta?: string;
}

const steps: StepItem[] = [
  {
    title: 'Create Your Firm Account',
    description: 'Register your MFD practice. Set up your brand identity, team roles, and client segments. Multi-tenant from day one \u2014 your data is yours alone.',
    meta: '~ 2 minutes',
  },
  {
    title: 'Import Your Client Data',
    description: 'Upload CAS statements, InvestWell exports, or connect via MFAPI. Our parser auto-detects formats, matches schemes, and reconciles holdings.',
    meta: '~ 5 minutes',
  },
  {
    title: 'See the Full Picture',
    description: 'Your dashboard lights up \u2014 consolidated portfolios, goal gaps, market movements, and actionable insights across every client, every scheme.',
    meta: 'instant',
  },
  {
    title: 'Advise with Confidence',
    description: 'Run goal plans, compare funds, spot rebalancing opportunities, and generate client-ready reports \u2014 all backed by real-time data.',
    meta: 'ongoing',
  },
];

function Step({ step, index }: { step: StepItem; index: number }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={`${s.step} ${s.animateOnScroll}`}>
      <div className={s.stepNumber}>{index + 1}</div>
      <div className={s.stepContent}>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        {step.meta && <span className={s.stepTime}>{step.meta}</span>}
      </div>
    </div>
  );
}

export default function Stepper() {
  return (
    <div className={s.steps}>
      {steps.map((step, i) => (
        <Step key={step.title} step={step} index={i} />
      ))}
    </div>
  );
}
