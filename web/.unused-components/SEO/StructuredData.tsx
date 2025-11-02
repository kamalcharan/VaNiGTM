// src/components/SEO/StructuredData.tsx
import React from 'react';
import { FAQItem, BreadcrumbItem, LocalBusinessData } from '../../types/seo.types';

interface StructuredDataProps {
  type: 'organization' | 'website' | 'product' | 'faq' | 'breadcrumb' | 'localbusiness' | 'howto';
  data?: any;
  faqs?: FAQItem[];
  breadcrumbs?: BreadcrumbItem[];
  localBusiness?: LocalBusinessData;
}

const StructuredData: React.FC<StructuredDataProps> = ({ 
  type, 
  data, 
  faqs, 
  breadcrumbs, 
  localBusiness 
}) => {
  const generateSchema = () => {
    const baseContext = "https://schema.org";
    
    switch (type) {
      case 'organization':
        return {
          "@context": baseContext,
          "@type": "Organization",
          "name": "ContractNest",
          "description": "Digital service contract management platform for automating service agreements, compliance tracking, and partner collaboration",
          "url": "https://contractnest.com",
          "logo": "https://contractnest.com/logo.png",
          "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+91-9949701175",
            "contactType": "customer service",
            "email": "charan@contractnest.com",
            "availableLanguage": ["English", "Hindi"]
          },
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Hyderabad",
            "addressRegion": "Telangana",
            "addressCountry": "IN"
          },
          "sameAs": [
            "https://linkedin.com/company/contractnest",
            "https://twitter.com/contractnest"
          ]
        };

      case 'website':
        return {
          "@context": baseContext,
          "@type": "WebSite",
          "name": "ContractNest",
          "description": "Service Contract Exchange Platform",
          "url": "https://contractnest.com",
          "potentialAction": {
            "@type": "SearchAction",
            "target": {
              "@type": "EntryPoint",
              "urlTemplate": "https://contractnest.com/search?q={search_term_string}"
            },
            "query-input": "required name=search_term_string"
          }
        };

      case 'product':
        return {
          "@context": baseContext,
          "@type": "SoftwareApplication",
          "name": "ContractNest",
          "description": "Digital service contract management platform",
          "url": "https://contractnest.com",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "offers": {
            "@type": "Offer",
            "price": "250",
            "priceCurrency": "INR",
            "priceSpecification": {
              "@type": "UnitPriceSpecification",
              "billingIncrement": "contract"
            }
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "ratingCount": "150",
            "bestRating": "5",
            "worstRating": "1"
          },
          "featureList": [
            "Service Contract Automation",
            "SLA Compliance Tracking",
            "Invoice Automation",
            "Partner Collaboration",
            "Performance Analytics"
          ]
        };

      case 'faq':
        return {
          "@context": baseContext,
          "@type": "FAQPage",
          "mainEntity": faqs?.map(faq => ({
            "@type": "Question",
            "name": faq.question,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": faq.answer
            }
          }))
        };

      case 'breadcrumb':
        return {
          "@context": baseContext,
          "@type": "BreadcrumbList",
          "itemListElement": breadcrumbs?.map((crumb, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "name": crumb.name,
            "item": crumb.url
          }))
        };

      case 'localbusiness':
        return {
          "@context": baseContext,
          "@type": "LocalBusiness",
          "name": localBusiness?.name,
          "address": {
            "@type": "PostalAddress",
            "streetAddress": localBusiness?.address.streetAddress,
            "addressLocality": localBusiness?.address.addressLocality,
            "addressRegion": localBusiness?.address.addressRegion,
            "postalCode": localBusiness?.address.postalCode,
            "addressCountry": localBusiness?.address.addressCountry
          },
          "telephone": localBusiness?.telephone,
          "email": localBusiness?.email,
          "url": localBusiness?.url,
          "priceRange": localBusiness?.priceRange,
          "openingHours": localBusiness?.openingHours
        };

      case 'howto':
        return {
          "@context": baseContext,
          "@type": "HowTo",
          "name": "How to Set Up Service Contract Management with ContractNest",
          "description": "Step-by-step guide to digitize your service contracts and automate compliance tracking",
          "totalTime": "PT10M",
          "estimatedCost": {
            "@type": "MonetaryAmount",
            "currency": "INR",
            "value": "250"
          },
          "step": [
            {
              "@type": "HowToStep",
              "name": "Create Service Contract",
              "text": "Log into ContractNest and create your first service contract with automated templates",
              "image": "https://contractnest.com/images/step1.jpg"
            },
            {
              "@type": "HowToStep", 
              "name": "Invite Partners",
              "text": "Share contract with clients, vendors, or team members who join automatically",
              "image": "https://contractnest.com/images/step2.jpg"
            },
            {
              "@type": "HowToStep",
              "name": "Automate Everything",
              "text": "Set up automated reminders, invoicing, and compliance tracking",
              "image": "https://contractnest.com/images/step3.jpg"
            },
            {
              "@type": "HowToStep",
              "name": "Scale & Optimize", 
              "text": "Use analytics to optimize performance and expand service relationships",
              "image": "https://contractnest.com/images/step4.jpg"
            }
          ]
        };

      default:
        return null;
    }
  };

  const schema = generateSchema();
  
  if (!schema) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema)
      }}
    />
  );
};

export default StructuredData;