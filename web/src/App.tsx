// src/App.tsx

import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { getActiveTheme } from './config/theme/themeRegistry';
import Navbar from './components/vikuna/Navbar';
import WhyAIFailsHero from './components/vikuna/WhyAIFailsHero';
import BentoOffers from './components/vikuna/BentoOffers';
import ProblemSection from './components/vikuna/ProblemSection';
import DifferentiatorSection from './components/vikuna/DifferentiatorSection';
import WhyWeExistSection from './components/vikuna/WhyWeExistSection';
import WhatChangesSection from './components/vikuna/WhatChangesSection';
import IndustriesBanner from './components/vikuna/IndustriesBanner';
import ConsultingServices from './components/vikuna/ConsultingServices';
import AutomationSprint from './components/vikuna/AutomationSprint';
import AlignmentCTA from './components/vikuna/AlignmentCTA';
import HowWeWorkSection from './components/vikuna/HowWeWorkSection';
import CaseStudies from './components/vikuna/CaseStudies';
import PlaybooksSection from './components/vikuna/PlaybooksSection';
import InlineLeadCapture from './components/vikuna/InlineLeadCapture';
import Footer from './components/vikuna/Footer';
import StickyCTABar from './components/vikuna/StickyCTABar';
import ExitIntentPopup from './components/vikuna/ExitIntentPopup';
import SEOHead from './components/vikuna/SEOHead';
import AssessmentPage from './components/vikuna/AssessmentPage';
import PreviewPage from './components/vikuna/PreviewPage';
import MVPPage from './components/vikuna/MVPPage';
import TrainingPage from './components/vikuna/TrainingPage';

function HomePage() {
  return (
    <>
      <WhyAIFailsHero />
      <BentoOffers />
      <ProblemSection />
      <ConsultingServices />
      <AlignmentCTA />
      <DifferentiatorSection />
      <WhyWeExistSection />
      <WhatChangesSection />
      <IndustriesBanner />
      <AutomationSprint />
      <HowWeWorkSection />
      {/* ProductDevelopmentServices hidden */}
      <CaseStudies />
      <PlaybooksSection />
      <InlineLeadCapture />
      <Footer />
      <StickyCTABar />
      <ExitIntentPopup />
    </>
  );
}

function App() {
  return (
    <ThemeProvider initialTheme={getActiveTheme()}>
      <SEOHead />
      <div className="app">
        <Navbar transparent={true} />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/assessment" element={<AssessmentPage />} />
          <Route path="/mvp" element={<MVPPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/preview/:name" element={<PreviewPage />} />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

export default App;
