'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import s from './landing-page.module.css';

/**
 * KI-Prime Landing Page — Atlas Design
 *
 * Full-screen landing page shown at localhost:3000.
 * Links to /login for authentication.
 */
export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // If already authenticated, go to dashboard
  if (isAuthenticated) {
    router.replace('/client-list');
    return null;
  }

  return (
    <div className={s.landing}>
      {/* Atmospheric background */}
      <div className={s.atmosphere} />
      <div className={s.noise} />

      {/* Floating particles */}
      <div className={s.particles}>
        {[10, 25, 45, 65, 80, 15, 55, 90, 35, 72].map((left, i) => (
          <div
            key={i}
            className={s.particle}
            style={{
              left: `${left}%`,
              animationDelay: `${[0, 1.5, 3, 0.5, 2, 4, 5, 1, 2.5, 3.5][i]}s`,
              animationDuration: `${[7, 9, 6, 8, 10, 7.5, 6.5, 9.5, 8.5, 11][i]}s`,
            }}
          />
        ))}
      </div>

      {/* Navigation bar */}
      <nav className={s.nav}>
        <div className={s.navBrand}>
          <div className={s.navIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className={s.navName}>KI-PRIME</span>
        </div>
        <button className={s.navSignIn} onClick={() => router.push('/login')}>
          Sign In
        </button>
      </nav>

      {/* Hero section */}
      <div className={s.hero}>
        <div className={s.heroContent}>
          <div className={s.heroTag}>by Vikuna Technologies</div>
          <h1 className={s.heroHeadline}>
            The <span className={s.goldWord}>Intelligence</span><br />
            Behind Every<br />
            Great Advisor.
          </h1>
          <p className={s.heroText}>
            KI-Prime empowers mutual fund distributors with AI-driven insights,
            automated portfolio analysis, and goal-based planning tools.
            See what others miss. Act before the moment passes.
          </p>
          <div className={s.heroCtas}>
            <button className={s.ctaPrimary} onClick={() => router.push('/login')}>
              ENTER THE ATLAS &#8594;
            </button>
            <button className={s.ctaSecondary}>
              <span>Watch Demo</span>
            </button>
          </div>
        </div>

        {/* Feature cards */}
        <div className={s.features}>
          <div className={s.featureCard}>
            <div className={s.featureIcon}>&#x25C8;</div>
            <h3 className={s.featureTitle}>Portfolio Intelligence</h3>
            <p className={s.featureText}>
              Real-time portfolio analysis, allocation tracking, and XIRR calculations across all client holdings.
            </p>
          </div>
          <div className={s.featureCard}>
            <div className={s.featureIcon}>&#x2B21;</div>
            <h3 className={s.featureTitle}>Goal-Based Planning</h3>
            <p className={s.featureText}>
              Monte Carlo simulations, SIP gap analysis, and probability-based goal achievement tracking.
            </p>
          </div>
          <div className={s.featureCard}>
            <div className={s.featureIcon}>&#x25CB;</div>
            <h3 className={s.featureTitle}>VaNi AI Assistant</h3>
            <p className={s.featureText}>
              Natural language queries across your entire book. Ask anything — VaNi finds the answer.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom ticker */}
      <div className={s.ticker}>
        <div className={s.tickerItem}>
          <span className={s.tickerValue}>&#8377;500Cr+</span>
          <span className={s.tickerLabel}>AUM Managed</span>
        </div>
        <div className={s.tickerItem}>
          <span className={s.tickerValue}>2,000+</span>
          <span className={s.tickerLabel}>Families Served</span>
        </div>
        <div className={s.tickerItem}>
          <span className={`${s.tickerValue} ${s.textUp}`}>18.4%</span>
          <span className={s.tickerLabel}>Avg XIRR</span>
        </div>
        <div className={s.tickerItem}>
          <span className={s.tickerValue}>24/7</span>
          <span className={s.tickerLabel}>AI Analysis</span>
        </div>
      </div>
    </div>
  );
}
