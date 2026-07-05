import { VdfBadge, VdfButton } from '@/components/vdf';
import StatsRibbon from './StatsRibbon';
import s from '../page.module.css';

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

export default function HeroSection() {
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
      <div className={s.heroActions}>
        <VdfButton variant="primary" href="/register" icon={<ArrowIcon />}>
          Get Started Free
        </VdfButton>
        <VdfButton variant="ghost" href="#features">
          See What&apos;s Inside
        </VdfButton>
      </div>
      <StatsRibbon />
    </section>
  );
}
