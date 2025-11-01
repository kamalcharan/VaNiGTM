// src/App.tsx

import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/vikuna/Navbar';
import HeroSectionNew from './components/vikuna/HeroSectionNew';
import KeyAreas from './components/vikuna/KeyAreas';
import ChallengesSection from './components/vikuna/ChallengesSection';
import LeadershipServices from './components/vikuna/LeadershipServices';
import TrainingSection from './components/vikuna/TrainingSection';
import ProductsShowcase from './components/vikuna/ProductsShowcase';
import InlineLeadCapture from './components/vikuna/InlineLeadCapture';
import Industries from './components/vikuna/Industries';
import ProfessionalNetwork from './components/vikuna/ProfessionalNetwork';
import CaseStudies from './components/vikuna/CaseStudies';
import ClientTypesWithCTA from './components/vikuna/ClientTypeswithCTA';
import Footer from './components/vikuna/Footer';
import WhatsAppButton from './components/vikuna/WhatsAppButton';
import ChatWidget from './components/vikuna/ChatWidget';
import StickyCTABar from './components/vikuna/StickyCTABar';
import ExitIntentPopup from './components/vikuna/ExitIntentPopup';
import SEOHead from './components/vikuna/SEOHead';
import modernBusinessTheme from './config/theme/themes/ModernBusinessTheme';

function App() {
  return (
    <ThemeProvider initialTheme={modernBusinessTheme}>
      <SEOHead />
      <div className="app">
        <Navbar transparent={true} />
        <HeroSectionNew />

        {/* Lead Capture After Hero */}
        <InlineLeadCapture />

        {/* Consulting Services */}
        <KeyAreas />
        <LeadershipServices />

        {/* Products as Proof */}
        <ProductsShowcase />

        {/* Social Proof & Case Studies */}
        <CaseStudies />
        <Industries />

        {/* Mid-Page Lead Capture */}
        <InlineLeadCapture
          headline="Want to See Results Like These in Your Organization?"
          subheadline="Download our free 90-Day AI Transformation Playbook."
          buttonText="Get Free Playbook"
        />

        {/* Additional Sections */}
        <ChallengesSection />
        <TrainingSection />
        <ProfessionalNetwork />

        {/* Final CTA */}
        <ClientTypesWithCTA />
        <Footer />

        {/* Fixed Elements */}
        <StickyCTABar />
        <WhatsAppButton />
        <ChatWidget />
        <ExitIntentPopup />
      </div>
    </ThemeProvider>
  );
}

export default App;