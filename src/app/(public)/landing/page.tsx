import { VdfGoldThread } from '@/components/vdf';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import PainSection from './components/PainSection';
import FeaturesSection from './components/FeaturesSection';
import HowItWorks from './components/HowItWorks';
import PricingSection from './components/PricingSection';
import TestimonialsSection from './components/TestimonialsSection';
import FinalCta from './components/FinalCta';
import Footer from './components/Footer';
import s from './page.module.css';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Get Early Access', href: '#start', isCta: true },
];

export default function LandingPage() {
  return (
    <>
      <Navbar brandName="ProessionalKey" links={navLinks} />
      <main>
        <HeroSection />

        {/* Social Proof */}
        <section className={s.socialProof}>
          <div className={s.socialProofLabel}>Trusted by forward-thinking MFDs across India</div>
          <div className={s.proofLogos}>
            {['Meridian Wealth', 'PrimeVest Advisors', 'FinBridge Partners', 'TrustArc Capital', 'NorthStar MFD'].map((name) => (
              <span key={name} className={s.proofLogo}>{name}</span>
            ))}
          </div>
        </section>

        <VdfGoldThread />
        <PainSection />
        <VdfGoldThread />
        <FeaturesSection />
        <VdfGoldThread />
        <HowItWorks />
        <VdfGoldThread />
        <PricingSection />
        <VdfGoldThread />
        <TestimonialsSection />
        <VdfGoldThread />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
