import { useParams, Link } from 'react-router-dom';
import ChallengesSection from './ChallengesSection';
import ChatWidget from './ChatWidget';
import ClientTypeswithCTA from './ClientTypeswithCTA';
import ContactSection from './ContactSection';
import HeroSection from './HeroSection';
import HeroSectionCopy from './HeroSection copy';
import Industries from './Industries';
import KeyAreas from './KeyAreas';
import LeadershipServices from './LeadershipServices';
import MVPBuildingSection from './MVPBuildingSection';
import ProductDevelopmentServices from './ProductDevelopmentServices';
import ProductSectionBak from './ProductSection_bak';
import ProductsSection from './ProductsSection';
import ProductsShowcase from './ProductsShowcase';
import ProfessionalNetwork from './ProfessionalNetwork';
import TrainingSection from './TrainingSection';
import TrainingSectionBack from './TrainingSection_back';
import WhatsAppButton from './WhatsAppButton';

const previews: Record<string, { label: string; Component: React.ComponentType }> = {
  ChallengesSection: { label: 'Challenges Section', Component: ChallengesSection },
  ChatWidget: { label: 'Chat Widget', Component: ChatWidget },
  ClientTypeswithCTA: { label: 'Client Types with CTA', Component: ClientTypeswithCTA },
  ContactSection: { label: 'Contact Section', Component: ContactSection },
  HeroSection: { label: 'Hero Section (old)', Component: HeroSection },
  'HeroSection-copy': { label: 'Hero Section (copy backup)', Component: HeroSectionCopy },
  Industries: { label: 'Industries (old, superseded by IndustriesBanner)', Component: Industries },
  KeyAreas: { label: 'Key Areas', Component: KeyAreas },
  LeadershipServices: { label: 'Leadership Services (superseded by ConsultingServices)', Component: LeadershipServices },
  MVPBuildingSection: { label: 'MVP Building Section', Component: MVPBuildingSection },
  ProductDevelopmentServices: { label: 'Product Development Services (hidden)', Component: ProductDevelopmentServices },
  ProductSection_bak: { label: 'Product Section (backup)', Component: ProductSectionBak },
  ProductsSection: { label: 'Products Section', Component: ProductsSection },
  ProductsShowcase: { label: 'Products Showcase', Component: ProductsShowcase },
  ProfessionalNetwork: { label: 'Professional Network', Component: ProfessionalNetwork },
  TrainingSection: { label: 'Training Section (superseded by TrainingSkillBuilding)', Component: TrainingSection },
  TrainingSection_back: { label: 'Training Section (backup)', Component: TrainingSectionBack },
  WhatsAppButton: { label: 'WhatsApp Button', Component: WhatsAppButton },
};

const listStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '120px 24px 80px',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  color: '#111',
};

function PreviewIndex() {
  return (
    <div style={listStyle}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Orphaned section previews</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Components that exist in <code>src/components/vikuna/</code> but are not
        mounted in <code>App.tsx</code>. Click to preview standalone.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {Object.entries(previews).map(([key, { label }]) => (
          <li key={key} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
            <Link to={`/preview/${key}`} style={{ color: '#E8420A', textDecoration: 'none' }}>
              {label} <span style={{ color: '#888' }}>— /preview/{key}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PreviewPage() {
  const { name } = useParams<{ name: string }>();

  if (!name) return <PreviewIndex />;

  const entry = previews[name];
  if (!entry) {
    return (
      <div style={listStyle}>
        <h1 style={{ fontSize: 24 }}>Unknown preview: {name}</h1>
        <p><Link to="/preview" style={{ color: '#E8420A' }}>Back to index</Link></p>
      </div>
    );
  }

  const { Component } = entry;
  return (
    <div>
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Preview: {name} · <Link to="/preview" style={{ color: '#FFB199' }}>index</Link>
      </div>
      <Component />
    </div>
  );
}
