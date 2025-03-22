// src/components/vikuna/ContactSection.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Mail, Phone, MapPin, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// Helper function to safely access theme colors
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
const SectionContainer = styled.section`
  padding: 5rem 0;
  background-color: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
`;

const SectionHeader = styled.div`
  text-align: center;
  max-width: 48rem;
  margin: 0 auto 4rem auto;
`;

const SectionTitle = styled.h2`
  font-size: 2.25rem;
  @media (min-width: 768px) {
    font-size: 2.5rem;
  }
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
`;

const SectionDescription = styled.p`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  line-height: 1.6;
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 3rem;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const ContactInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const ContactItem = styled.div`
  display: flex;
  align-items: flex-start;
`;

const IconContainer = styled.div`
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background-color: ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 1rem;
  
  svg {
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  }
`;

const ContactItemContent = styled.div`
  display: flex;
  flex-direction: column;
`;

const ContactItemTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  margin-bottom: 0.25rem;
`;

const ContactItemText = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  margin-bottom: 0.25rem;
`;

const ContactItemSubtext = styled.p`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.hint', '#9CA3AF')};
`;

const MapPlaceholder = styled.div`
  height: 10rem;
  background-color: ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')};
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  margin-top: 2.5rem;
`;

const ContactLink = styled.a`
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  text-decoration: underline;
  font-size: 0.875rem;
  
  &:hover {
    color: ${props => safeColor(props.theme, 'colors.primary.dark', '#1D4ED8')};
  }
`;

const ContactForm = styled.div`
  background-color: ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')};
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  padding: 2rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: ${props => props.theme?.shadows?.small || '0 1px 3px rgba(0,0,0,0.1)'};
`;

const FormTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  margin-bottom: 1.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const FormLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  margin-bottom: 0.5rem;
`;

const ErrorMessage = styled.div`
  color: ${props => safeColor(props.theme, 'colors.error.main', '#EF4444')};
  font-size: 0.75rem;
  margin-top: 0.25rem;
`;

const FooterContainer = styled.footer`
  margin-top: 5rem;
  padding-top: 2.5rem;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
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

const ContactSection: React.FC = () => {
  const { currentTheme } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Simple form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: ''
  });
  
  // Simple form errors
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    message: ''
  });
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Clear error when typing
    if (errors[name as keyof typeof errors]) {
      setErrors({
        ...errors,
        [name]: ''
      });
    }
  };
  
  const validateForm = () => {
    let valid = true;
    const newErrors = { ...errors };
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
      valid = false;
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
      valid = false;
    }
    
    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
      valid = false;
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message should be at least 10 characters';
      valid = false;
    }
    
    setErrors(newErrors);
    return valid;
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      setIsSubmitting(true);
      
      // Simulate form submission
      setTimeout(() => {
        console.log('Form submitted:', formData);
        setIsSubmitting(false);
        setFormData({
          name: '',
          email: '',
          company: '',
          message: ''
        });
        alert('Thank you for your message! We will get back to you soon.');
      }, 1500);
    }
  };

  return (
    <SectionContainer theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <SectionTitle theme={currentTheme}>Let's Talk</SectionTitle>
            <SectionDescription theme={currentTheme}>
              Are you ready to start your digital transformation journey? 
              Get in touch with our team to discuss how we can help you achieve your goals.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        <ContentGrid>
          {/* Contact Information */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <ContactInfo>
              <ContactItem>
                <IconContainer theme={currentTheme}>
                  <Mail size={24} />
                </IconContainer>
                <ContactItemContent>
                  <ContactItemTitle theme={currentTheme}>Email</ContactItemTitle>
                  <ContactItemText theme={currentTheme}>connect@vikuna.io</ContactItemText>
                  <ContactItemSubtext theme={currentTheme}>We'll respond within 24 hours</ContactItemSubtext>
                </ContactItemContent>
              </ContactItem>
              
              <ContactItem>
                <IconContainer theme={currentTheme}>
                  <Phone size={24} />
                </IconContainer>
                <ContactItemContent>
                  <ContactItemTitle theme={currentTheme}>Phone</ContactItemTitle>
                  <ContactItemText theme={currentTheme}>+91 98851 64233</ContactItemText>
                  <ContactItemSubtext theme={currentTheme}>Monday-Friday, 9AM-6PM</ContactItemSubtext>
                </ContactItemContent>
              </ContactItem>
              
              <ContactItem>
                <IconContainer theme={currentTheme}>
                  <MapPin size={24} />
                </IconContainer>
                <ContactItemContent>
                  <ContactItemTitle theme={currentTheme}>Location</ContactItemTitle>
                  <ContactItemText theme={currentTheme}>Hyderabad, India</ContactItemText>
                  <ContactItemSubtext theme={currentTheme}>Serving clients globally</ContactItemSubtext>
                </ContactItemContent>
              </ContactItem>
              
              <ContactItem>
                <IconContainer theme={currentTheme}>
                  <MessageSquare size={24} />
                </IconContainer>
                <ContactItemContent>
                  <ContactItemTitle theme={currentTheme}>Schedule a Call</ContactItemTitle>
                  <ContactItemText theme={currentTheme}>Book a free 30-minute consultation</ContactItemText>
                  <ContactLink 
                    href="https://calendly.com/connect-vikuna/30min"
                    theme={currentTheme}
                  >
                    View Calendar
                  </ContactLink>
                </ContactItemContent>
              </ContactItem>
            </ContactInfo>
            
            {/* Map Placeholder */}
            <MapPlaceholder theme={currentTheme} />
          </motion.div>
          
          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <ContactForm theme={currentTheme}>
              <FormTitle theme={currentTheme}>Send Us a Message</FormTitle>
              
              <form onSubmit={handleSubmit}>
                <FormGroup>
                  <FormLabel theme={currentTheme} htmlFor="name">Full Name</FormLabel>
                  <Input 
                    id="name"
                    name="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={handleChange}
                  />
                  {errors.name && <ErrorMessage theme={currentTheme}>{errors.name}</ErrorMessage>}
                </FormGroup>
                
                <FormGroup>
                  <FormLabel theme={currentTheme} htmlFor="email">Email Address</FormLabel>
                  <Input 
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                  {errors.email && <ErrorMessage theme={currentTheme}>{errors.email}</ErrorMessage>}
                </FormGroup>
                
                <FormGroup>
                  <FormLabel theme={currentTheme} htmlFor="company">Company (Optional)</FormLabel>
                  <Input 
                    id="company"
                    name="company"
                    placeholder="Your company name"
                    value={formData.company}
                    onChange={handleChange}
                  />
                </FormGroup>
                
                <FormGroup>
                  <FormLabel theme={currentTheme} htmlFor="message">Message</FormLabel>
                  <Textarea 
                    id="message"
                    name="message"
                    placeholder="How can we help you?"
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                  />
                  {errors.message && <ErrorMessage theme={currentTheme}>{errors.message}</ErrorMessage>}
                </FormGroup>
                
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  style={{ width: '100%' }}
                >
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </ContactForm>
          </motion.div>
        </ContentGrid>
      </Container>
      
      {/* Footer */}
      <FooterContainer theme={currentTheme}>
        <Container>
          <FooterContent>
            <Logo>
              <LogoText theme={currentTheme}>VIKUNA</LogoText>
              <LogoSubtext theme={currentTheme}>Technologies</LogoSubtext>
            </Logo>
            
            <FooterNav>
              <FooterLink href="#leadership-services" theme={currentTheme}>Services</FooterLink>
              <FooterLink href="#approach" theme={currentTheme}>About</FooterLink>
              <FooterLink href="#case-studies" theme={currentTheme}>Case Studies</FooterLink>
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
    </SectionContainer>
  );
};

export default ContactSection;