// src/App.tsx

import { ThemeProvider } from './context/ThemeContext';
import { getActiveTheme } from './config/theme/themeRegistry';
import Navbar from './components/vikuna/Navbar';
import HeroSectionNew from './components/vikuna/HeroSectionNew';
import ProblemSection from './components/vikuna/ProblemSection';
import DifferentiatorSection from './components/vikuna/DifferentiatorSection';
import WhyWeExistSection from './components/vikuna/WhyWeExistSection';
import WhatChangesSection from './components/vikuna/WhatChangesSection';
import IndustriesBanner from './components/vikuna/IndustriesBanner';
import ConsultingServices from './components/vikuna/ConsultingServices';
import TrainingSkillBuilding from './components/vikuna/TrainingSkillBuilding';
import HowWeWorkSection from './components/vikuna/HowWeWorkSection';
import ProductDevelopmentServices from './components/vikuna/ProductDevelopmentServices';
import CaseStudies from './components/vikuna/CaseStudies';
import InlineLeadCapture from './components/vikuna/InlineLeadCapture';
import Footer from './components/vikuna/Footer';
import StickyCTABar from './components/vikuna/StickyCTABar';
import ExitIntentPopup from './components/vikuna/ExitIntentPopup';
import SEOHead from './components/vikuna/SEOHead';

function App() {
  return (
    <ThemeProvider initialTheme={getActiveTheme()}>
      <SEOHead />
      <div className="app">
        <Navbar transparent={true} />
        <HeroSectionNew />

        {/* The Problem - Why existing options fail */}
        <ProblemSection />

        {/* Our Approach - Iceberg differentiator */}
        <DifferentiatorSection />

        {/* Founder Story - Why We Exist */}
        <WhyWeExistSection />

        {/* What Changes - Transformation case studies */}
        <WhatChangesSection />

        {/* Industries Banner - Quick Credibility */}
        <IndustriesBanner />

        {/* Service 01: Fractional Leadership */}
        <ConsultingServices />

        {/* Service 02: Training & Skill Building */}
        <TrainingSkillBuilding />

        {/* How We Work - Journey steps */}
        <HowWeWorkSection />

        {/* Service #3: Product Development (MVP + Products We've Developed) */}
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