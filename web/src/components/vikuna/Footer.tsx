// src/components/vikuna/Footer.tsx
import React from 'react';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

// Helper function to safely access theme properties
const safeColor = (theme: any, path: string, fallback: string = '#000000'): string => {
  const parts = path.split('.');
  let current = theme;
  
  for (const part of parts) {
    if (current === undefined || current === null) return fallback;
    current = current[part];
  }
  
  return current || fallback;
};

// Styled components
const FooterContainer = styled.footer`
  padding: 2.5rem 0;
  background-color: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-top: 1px solid rgba(0, 0, 0, 0.1);
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
`;

const FooterContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  
  @media (min-width: 768px) {
    flex-direction: row;
  }
`;

const Logo = styled.div`
  margin-bottom: 1.5rem;
  
  @media (min-width: 768px) {
    margin-bottom: 0;
  }
`;

const LogoText = styled.span`
  font-size: 1.5rem;
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
`;

const LogoSubtext = styled.span`
  margin-left: 0.5rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
`;

const FooterNav = styled.div`
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  justify-content: center;
  
  @media (min-width: 768px) {
    justify-content: flex-end;
  }
`;

const FooterLink = styled.a`
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  text-decoration: none;
  
  &:hover {
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  }
`;

const FooterBottom = styled.div`
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  margin-top: 2rem;
  padding-top: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  
  @media (min-width: 768px) {
    flex-direction: row;
  }
`;

const Copyright = styled.p`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  margin-bottom: 1rem;
  
  @media (min-width: 768px) {
    margin-bottom: 0;
  }
`;

const LegalLinks = styled.div`
  display: flex;
  gap: 1.5rem;
`;

const LegalLink = styled.a`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  text-decoration: none;
  
  &:hover {
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  }
`;

const Footer: React.FC = () => {
  const { currentTheme } = useTheme();

  return (
    <FooterContainer theme={currentTheme}>
      <Container>
        <FooterContent>
          <Logo>
            <LogoText theme={currentTheme}>VIKUNA</LogoText>
            <LogoSubtext theme={currentTheme}>Technologies</LogoSubtext>
          </Logo>
          
          <FooterNav>
            <FooterLink href="#key-areas" theme={currentTheme}>Services</FooterLink>
            <FooterLink href="#leadership-services" theme={currentTheme}>Our Approach</FooterLink>
            <FooterLink href="#industries" theme={currentTheme}>Industries</FooterLink>
            <FooterLink href="#case-studies" theme={currentTheme}>Success Stories</FooterLink>
            <FooterLink href="#expert-network" theme={currentTheme}>Join Us</FooterLink>
            <FooterLink href="#contact" theme={currentTheme}>Contact</FooterLink>
          </FooterNav>
        </FooterContent>
        
        <FooterBottom>
          <Copyright theme={currentTheme}>
            © {new Date().getFullYear()} Vikuna Technologies. All rights reserved.
          </Copyright>
          <LegalLinks>
            <LegalLink href="/privacy" theme={currentTheme}>Privacy Policy</LegalLink>
            <LegalLink href="/terms" theme={currentTheme}>Terms of Service</LegalLink>
          </LegalLinks>
        </FooterBottom>
      </Container>
    </FooterContainer>
  );
};

export default Footer;