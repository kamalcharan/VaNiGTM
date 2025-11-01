// src/App.tsx

import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/vikuna/Navbar';
import HeroSectionNew from './components/vikuna/HeroSectionNew';
import ConsultingServices from './components/vikuna/ConsultingServices';
import ProductDevelopmentServices from './components/vikuna/ProductDevelopmentServices';
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
import trustworthyTheme from './config/theme/themes/TrustworthyTheme';

function App() {
  return (
    <ThemeProvider initialTheme={trustworthyTheme}>
      <SEOHead />
      <div className="app">
        <Navbar transparent={true} />
        <HeroSectionNew />

        {/* Lead Capture After Hero */}
        <InlineLeadCapture />

        {/* Service #1: Consulting Services (CDO/CAiO + Training) */}
        <ConsultingServices />

        {/* Service #2: Product Development (MVP + Products We've Developed) */}
        <ProductDevelopmentServices />

        {/* Social Proof & Case Studies */}
        <CaseStudies />
        <Industries />

        {/* Mid-Page Lead Capture */}
        <InlineLeadCapture
          headline="Want to See Results Like These in Your Organization?"
          subheadline="Download our free 90-Day AI Transformation Playbook."
          buttonText="Get Free Playbook"
        />

        {/* Professional Network */}
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