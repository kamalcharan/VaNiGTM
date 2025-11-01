// src/App.tsx

import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/vikuna/Navbar';
import HeroSectionNew from './components/vikuna/HeroSectionNew';
import IndustriesBanner from './components/vikuna/IndustriesBanner';
import ConsultingServices from './components/vikuna/ConsultingServices';
import ProductDevelopmentServices from './components/vikuna/ProductDevelopmentServices';
import CaseStudies from './components/vikuna/CaseStudies';
import InlineLeadCapture from './components/vikuna/InlineLeadCapture';
import Footer from './components/vikuna/Footer';
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

        {/* Industries Banner - Quick Credibility */}
        <IndustriesBanner />

        {/* Service #1: Consulting Services (CDO/CAiO + Training) */}
        <ConsultingServices />

        {/* Service #2: Product Development (MVP + Products We've Developed) */}
        <ProductDevelopmentServices />

        {/* Transformation Success Stories - Proves Both Services */}
        <CaseStudies />

        {/* Lead Capture - After Value is Clear */}
        <InlineLeadCapture
          headline="Ready to Start Your Transformation Journey?"
          subheadline="Get a free 30-minute consultation to discuss your specific needs."
          buttonText="Schedule Consultation"
        />

        {/* Footer */}
        <Footer />

        {/* Fixed Elements */}
        <StickyCTABar />
        <ExitIntentPopup />
      </div>
    </ThemeProvider>
  );
}

export default App;