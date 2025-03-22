// src/App.tsx
import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/vikuna/Navbar';
import HeroSection from './components/vikuna/HeroSection';
import KeyAreas from './components/vikuna/KeyAreas';
import ChallengesSection from './components/vikuna/ChallengesSection';
import LeadershipServices from './components/vikuna/LeadershipServices';
import TrainingSection from './components/vikuna/TrainingSection';
// import ProductsSection from './components/vikuna/ProductsSection'; // Commented out as requested
import Industries from './components/vikuna/Industries';
import ProfessionalNetwork from './components/vikuna/ProfessionalNetwork';
import CaseStudies from './components/vikuna/CaseStudies';
import ClientTypesWithCTA from './components/vikuna/ClientTypeswithCTA';
import Footer from './components/vikuna/Footer';
import vikunaTheme from './config/theme/themes/vikunaTheme';

function App() {
  return (
    <ThemeProvider initialTheme={vikunaTheme}>
      <div className="app">
        <Navbar transparent={true} />
        <HeroSection />
        <KeyAreas />
        <ChallengesSection />
        <LeadershipServices />
        <TrainingSection />
        {/* <ProductsSection /> */}
        <Industries />
        <ProfessionalNetwork />
        <CaseStudies />
        <ClientTypesWithCTA />
        <Footer />
      </div>
    </ThemeProvider>
  );
}

export default App;