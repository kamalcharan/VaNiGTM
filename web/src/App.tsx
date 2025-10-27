// src/App.tsx

import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/vikuna/Navbar';
import HeroSectionNew from './components/vikuna/HeroSectionNew';
import KeyAreas from './components/vikuna/KeyAreas';
import ChallengesSection from './components/vikuna/ChallengesSection';
import LeadershipServices from './components/vikuna/LeadershipServices';
import TrainingSection from './components/vikuna/TrainingSection';
import ProductsSection from './components/vikuna/ProductsSection'; // Commented out as requested
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
        <TrainingSection />

        <KeyAreas />
        <ChallengesSection />
        <LeadershipServices />
        { <ProductsSection /> }
        <Industries />
        <ProfessionalNetwork />
        <CaseStudies />
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