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
import { BRAND } from '@/constants/brand';
import s from './page.module.css';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Sign In', href: '/login' },
  { label: 'Get Started', href: '/register', isCta: true },
];

export default function LandingPage() {
  return (
    <>
      <Navbar brandName={BRAND.name} links={navLinks} />
      <main>
        <HeroSection />

        {/* Social Proof */}
        <section className={s.socialProof}>
          <div className={s.socialProofLabel}>Built for modern B2B go-to-market teams</div>
          <div className={s.proofLogos}>
            {['Northwind', 'Vertex Labs', 'Harbor', 'Loop', 'Cobalt'].map((name) => (
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
