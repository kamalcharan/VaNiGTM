// src/components/vikuna/Navbar.tsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

// Styled components for Navbar - using $ prefix for transient props
const NavbarContainer = styled.nav<{$isScrolled: boolean}>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background-color: ${props => props.$isScrolled ? props.theme.colors.background.paper : 'transparent'};
  transition: background-color 0.3s ease;
  z-index: 50;
  padding: 0.5rem 0;
  box-shadow: ${props => props.$isScrolled ? props.theme.shadows.small : 'none'};
`;

const NavbarContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 4rem;
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
`;

const LogoText = styled.h1`
  font-size: 1.75rem;
  font-weight: ${props => props.theme.typography.fontWeightBold};
  color: ${props => props.theme.colors.primary.main};
  margin: 0;
`;

const LogoSubText = styled.span`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
  margin-left: 0.5rem;
`;

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 2rem;
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const NavLink = styled.a`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
  text-decoration: none;
  transition: color 0.2s ease;
  position: relative;
  
  &:hover {
    color: ${props => props.theme.colors.primary.main};
  }
`;

const DropdownContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const DropdownButton = styled.button`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  
  &:hover {
    color: ${props => props.theme.colors.primary.main};
  }
`;

const DropdownMenu = styled.div<{$isOpen: boolean}>`
  position: absolute;
  top: 100%;
  left: 0;
  background-color: ${props => props.theme.colors.background.paper};
  border-radius: ${props => props.theme.borderRadius.medium};
  box-shadow: ${props => props.theme.shadows.large};
  padding: 0.5rem 0;
  min-width: 200px;
  z-index: 100;
  display: ${props => props.$isOpen ? 'block' : 'none'};
  margin-top: 0.5rem;
`;

const DropdownItem = styled.a`
  display: block;
  padding: 0.75rem 1rem;
  color: ${props => props.theme.colors.text.secondary};
  text-decoration: none;
  font-size: 0.875rem;
  transition: background-color 0.2s ease;
  
  &:hover {
    background-color: ${props => props.theme.colors.primary.light};
    color: ${props => props.theme.colors.primary.main};
  }
`;

const ConsultButton = styled.a`
  background-color: ${props => props.theme.colors.secondary.main};
  color: ${props => props.theme.colors.secondary.contrastText};
  padding: 0.5rem 1rem;
  border-radius: ${props => props.theme.borderRadius.medium};
  font-size: 0.875rem;
  text-decoration: none;
  transition: background-color 0.2s ease;
  font-weight: ${props => props.theme.typography.fontWeightMedium};

  &:hover {
    background-color: ${props => props.theme.colors.secondary.dark};
  }
`;

const MobileMenuButton = styled.button`
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  color: ${props => props.theme.colors.text.primary};
  
  @media (max-width: 768px) {
    display: block;
  }
`;

const MobileMenu = styled.div<{$isOpen: boolean}>`
  display: ${props => props.$isOpen ? 'block' : 'none'};
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: ${props => props.theme.colors.background.paper};
  padding: 1rem;
  box-shadow: ${props => props.theme.shadows.medium};
  
  @media (min-width: 769px) {
    display: none;
  }
`;

const MobileNavLink = styled.a`
  display: block;
  padding: 0.75rem 0;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
  text-decoration: none;
  border-bottom: 1px solid ${props => props.theme.colors.background.default};
  
  &:last-child {
    border-bottom: none;
  }
  
  &:hover {
    color: ${props => props.theme.colors.primary.main};
  }
`;

const MobileConsultButton = styled.a`
  display: block;
  background-color: ${props => props.theme.colors.secondary.main};
  color: ${props => props.theme.colors.secondary.contrastText};
  text-align: center;
  padding: 0.75rem 1rem;
  border-radius: ${props => props.theme.borderRadius.medium};
  margin-top: 0.75rem;
  font-size: 0.875rem;
  text-decoration: none;

  &:hover {
    background-color: ${props => props.theme.colors.secondary.dark};
  }
`;

interface NavbarProps {
  transparent?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ transparent = true }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(!transparent);
  const { currentTheme } = useTheme();

  // Add scroll event listener
  useEffect(() => {
    if (!transparent) return;
    
    const handleScroll = () => {
      if (window.scrollY > 60) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [transparent]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleServices = () => {
    setIsServicesOpen(!isServicesOpen);
  };

  return (
    <NavbarContainer theme={currentTheme} $isScrolled={isScrolled}>
      <NavbarContent>
        <LogoContainer>
          <LogoText theme={currentTheme}>VIKUNA</LogoText>
          <LogoSubText theme={currentTheme}>Technologies</LogoSubText>
        </LogoContainer>
        
        <NavLinks>
          <DropdownContainer>
            <DropdownButton
              theme={currentTheme}
              onClick={toggleServices}
              onBlur={() => setTimeout(() => setIsServicesOpen(false), 200)}
            >
              Services
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 8L2 4h8l-4 4z"/>
              </svg>
            </DropdownButton>
            <DropdownMenu $isOpen={isServicesOpen} theme={currentTheme}>
              <DropdownItem href="#consulting-services" theme={currentTheme}>
                Consulting Services
              </DropdownItem>
              <DropdownItem href="#product-development" theme={currentTheme}>
                Product Development
              </DropdownItem>
            </DropdownMenu>
          </DropdownContainer>

          <NavLink href="#case-studies" theme={currentTheme}>Success Stories</NavLink>
          <NavLink href="#contact" theme={currentTheme}>Contact</NavLink>

          <ConsultButton
            href="https://calendly.com/connect-vikuna/30min"
            theme={currentTheme}
          >
            Book Consultation
          </ConsultButton>
        </NavLinks>
        
        <MobileMenuButton theme={currentTheme} onClick={toggleMenu}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </MobileMenuButton>
      </NavbarContent>
      
      <MobileMenu $isOpen={isMenuOpen} theme={currentTheme}>
        <MobileNavLink href="#consulting-services" theme={currentTheme}>Consulting Services</MobileNavLink>
        <MobileNavLink href="#product-development" theme={currentTheme}>Product Development</MobileNavLink>
        <MobileNavLink href="#case-studies" theme={currentTheme}>Success Stories</MobileNavLink>
        <MobileNavLink href="#contact" theme={currentTheme}>Contact</MobileNavLink>
        <MobileConsultButton
          href="https://calendly.com/connect-vikuna/30min"
          theme={currentTheme}
        >
          Book Consultation
        </MobileConsultButton>
      </MobileMenu>
    </NavbarContainer>
  );
};

export default Navbar;