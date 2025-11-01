// src/components/vikuna/StickyCTABar.tsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Calendar, Phone } from 'lucide-react';
import useTheme from '../../hooks/useTheme';

const CTABarContainer = styled.div<{ $isVisible: boolean; $isMobile: boolean }>`
  position: fixed;
  ${props => props.$isMobile ? 'bottom: 0' : 'top: 0'};
  left: 0;
  right: 0;
  background: ${props => props.theme?.colors?.background?.paper || '#FFFFFF'};
  box-shadow: ${props => props.$isMobile
    ? '0 -2px 10px rgba(0, 0, 0, 0.1)'
    : '0 2px 10px rgba(0, 0, 0, 0.1)'};
  z-index: 999;
  transform: translateY(${props => props.$isVisible ? '0' : props.$isMobile ? '100%' : '-100%'});
  transition: transform 0.3s ease-in-out;
  padding: ${props => props.$isMobile ? '12px 16px' : '16px 24px'};
`;

const CTABarContent = styled.div<{ $isMobile: boolean }>`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: ${props => props.$isMobile ? 'space-between' : 'space-between'};
  gap: ${props => props.$isMobile ? '8px' : '24px'};
`;

const CTAMessage = styled.div<{ $isMobile: boolean }>`
  display: ${props => props.$isMobile ? 'none' : 'flex'};
  align-items: center;
  gap: 8px;

  h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    color: ${props => props.theme?.colors?.text?.primary || '#1a1f24'};
  }

  p {
    font-size: 0.875rem;
    margin: 0;
    color: ${props => props.theme?.colors?.text?.secondary || '#656a85'};
  }
`;

const CTAActions = styled.div<{ $isMobile: boolean }>`
  display: flex;
  align-items: center;
  gap: ${props => props.$isMobile ? '8px' : '16px'};
  flex: ${props => props.$isMobile ? '1' : 'initial'};
`;

const PrimaryButton = styled.a<{ $isMobile: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: ${props => props.theme?.colors?.secondary?.main || '#FF6F61'};
  color: ${props => props.theme?.colors?.secondary?.contrastText || '#FFFFFF'};
  padding: ${props => props.$isMobile ? '12px 16px' : '12px 24px'};
  border-radius: 8px;
  font-weight: 600;
  font-size: ${props => props.$isMobile ? '0.875rem' : '0.95rem'};
  text-decoration: none;
  transition: all 0.3s ease;
  white-space: nowrap;
  flex: ${props => props.$isMobile ? '1' : 'initial'};

  &:hover {
    background: ${props => props.theme?.colors?.secondary?.dark || '#e55a4a'};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px ${props => props.theme?.colors?.secondary?.main || '#FF6F61'}40;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const SecondaryButton = styled.a<{ $isMobile: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: transparent;
  color: ${props => props.theme?.colors?.primary?.main || '#39d2c0'};
  padding: ${props => props.$isMobile ? '12px 16px' : '12px 24px'};
  border: 2px solid ${props => props.theme?.colors?.primary?.main || '#39d2c0'};
  border-radius: 8px;
  font-weight: 600;
  font-size: ${props => props.$isMobile ? '0.875rem' : '0.95rem'};
  text-decoration: none;
  transition: all 0.3s ease;
  white-space: nowrap;
  flex: ${props => props.$isMobile ? '1' : 'initial'};

  &:hover {
    background: ${props => props.theme?.colors?.primary?.light || '#dfe3e7'};
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const TrustBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: ${props => props.theme?.colors?.text?.secondary || '#656a85'};

  @media (max-width: 768px) {
    display: none;
  }
`;

interface StickyCTABarProps {
  showAfterScroll?: number; // Percentage of page scroll before showing
}

const StickyCTABar: React.FC<StickyCTABarProps> = ({ showAfterScroll = 15 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { currentTheme } = useTheme();

  useEffect(() => {
    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Handle scroll
    const handleScroll = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      setIsVisible(scrollPercentage > showAfterScroll);
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkMobile);
    };
  }, [showAfterScroll]);

  return (
    <CTABarContainer
      $isVisible={isVisible}
      $isMobile={isMobile}
      theme={currentTheme}
    >
      <CTABarContent $isMobile={isMobile}>
        <CTAMessage $isMobile={isMobile} theme={currentTheme}>
          <div>
            <h3>Ready to Transform Your Business with AI?</h3>
            <TrustBadge theme={currentTheme}>
              ✓ Free Strategy Session • ✓ No Obligation • ✓ 200+ Years Experience
            </TrustBadge>
          </div>
        </CTAMessage>

        <CTAActions $isMobile={isMobile}>
          <PrimaryButton
            href="https://calendly.com/connect-vikuna/30min"
            target="_blank"
            rel="noopener noreferrer"
            $isMobile={isMobile}
            theme={currentTheme}
          >
            <Calendar />
            {isMobile ? 'Book Call' : 'Book Strategy Call'}
          </PrimaryButton>

          <SecondaryButton
            href="tel:+917702864233"
            $isMobile={isMobile}
            theme={currentTheme}
          >
            <Phone />
            {isMobile ? 'Call' : 'Call Now'}
          </SecondaryButton>
        </CTAActions>
      </CTABarContent>
    </CTABarContainer>
  );
};

export default StickyCTABar;
