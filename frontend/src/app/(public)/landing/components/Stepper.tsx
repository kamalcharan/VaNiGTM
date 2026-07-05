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
    title: 'Initialize Your Mission',
    description: 'Name your mission and describe your product in one line. It becomes your tenant \u2014 an isolated, intelligent growth operation that is yours alone.',
    meta: '~ 2 minutes',
  },
  {
    title: 'Define Your ICP & Channels',
    description: 'Set your personas, buying signals, company size, and geography. Connect email, WhatsApp, and LinkedIn with orchestration rules.',
    meta: '~ 5 minutes',
  },
  {
    title: 'Build Your Sequences',
    description: 'Design multi-step outreach in the visual flow builder. Agents draft and personalize every step, grounded in your ICP.',
    meta: 'instant',
  },
  {
    title: 'Launch & Watch the War Room',
    description: 'Import your contacts, launch the mission, and monitor every agent run, pipeline stage, and signal live.',
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
