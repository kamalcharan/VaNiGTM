// src/components/SEO/SEOHead.tsx
import React, { useEffect } from 'react';
import { SEOData } from '../../types/seo.types';
import { SEOUtils } from '../../utils/helpers/seo.utils';
import { SEO_CONSTANTS } from '../../utils/constants/seo.constants';

interface SEOHeadProps {
  seoData: SEOData;
  children?: React.ReactNode;
}

const SEOHead: React.FC<SEOHeadProps> = ({ seoData, children }) => {
  
  useEffect(() => {
    // Update document title
    document.title = seoData.title;

    // Update or create meta description
    updateMetaTag('name', 'description', seoData.description);

    // Update or create meta keywords
    if (seoData.keywords) {
      updateMetaTag('name', 'keywords', seoData.keywords);
    }

    // Update canonical URL
    if (seoData.canonical) {
      updateLinkTag('canonical', seoData.canonical);
    }

    // Update robots meta tag
    const robotsContent = [
      seoData.noindex ? 'noindex' : 'index',
      seoData.nofollow ? 'nofollow' : 'follow'
    ].join(', ');
    updateMetaTag('name', 'robots', robotsContent);

    // Update viewport meta tag
    updateMetaTag('name', 'viewport', 'width=device-width, initial-scale=1, maximum-scale=5');

    // Update theme color
    updateMetaTag('name', 'theme-color', '#e53e3e');

    // Update Open Graph tags
    updateMetaTag('property', 'og:title', seoData.title);
    updateMetaTag('property', 'og:description', seoData.description);
    updateMetaTag('property', 'og:type', seoData.ogType || 'website');
    updateMetaTag('property', 'og:url', seoData.canonical || window.location.href);
    updateMetaTag('property', 'og:site_name', SEO_CONSTANTS.SITE_NAME);
    updateMetaTag('property', 'og:locale', 'en_IN');

    if (seoData.ogImage) {
      updateMetaTag('property', 'og:image', seoData.ogImage);
      updateMetaTag('property', 'og:image:width', '1200');
      updateMetaTag('property', 'og:image:height', '630');
      updateMetaTag('property', 'og:image:alt', `${seoData.title} - ContractNest`);
    }

    // Update Twitter Card tags
    updateMetaTag('name', 'twitter:card', seoData.twitterCard || 'summary_large_image');
    updateMetaTag('name', 'twitter:title', seoData.title);
    updateMetaTag('name', 'twitter:description', seoData.description);
    updateMetaTag('name', 'twitter:site', SEO_CONSTANTS.TWITTER_HANDLE);
    updateMetaTag('name', 'twitter:creator', SEO_CONSTANTS.TWITTER_HANDLE);

    if (seoData.ogImage) {
      updateMetaTag('name', 'twitter:image', seoData.ogImage);
    }

    // Additional meta tags
    updateMetaTag('name', 'author', 'ContractNest');
    updateMetaTag('name', 'publisher', 'ContractNest');
    updateMetaTag('name', 'language', 'English');
    updateMetaTag('name', 'geo.region', 'IN');
    updateMetaTag('name', 'geo.country', 'India');
    updateMetaTag('name', 'geo.placename', 'Hyderabad, Telangana');

    // Mobile optimization tags
    updateMetaTag('name', 'format-detection', 'telephone=no');
    updateMetaTag('name', 'mobile-web-app-capable', 'yes');
    updateMetaTag('name', 'apple-mobile-web-app-capable', 'yes');
    updateMetaTag('name', 'apple-mobile-web-app-status-bar-style', 'default');
    updateMetaTag('name', 'apple-mobile-web-app-title', 'ContractNest');
    updateMetaTag('name', 'msapplication-TileColor', '#e53e3e');

    // Inject structured data
    if (seoData.structuredData) {
      injectStructuredData(seoData.structuredData);
    }

  }, [seoData]);

  // Helper function to update or create meta tags
  const updateMetaTag = (attributeName: string, attributeValue: string, content: string) => {
    let metaTag = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
    
    if (metaTag) {
      metaTag.setAttribute('content', content);
    } else {
      metaTag = document.createElement('meta');
      metaTag.setAttribute(attributeName, attributeValue);
      metaTag.setAttribute('content', content);
      document.head.appendChild(metaTag);
    }
  };

  // Helper function to update or create link tags
  const updateLinkTag = (rel: string, href: string) => {
    let linkTag = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
    
    if (linkTag) {
      linkTag.href = href;
    } else {
      linkTag = document.createElement('link');
      linkTag.rel = rel;
      linkTag.href = href;
      document.head.appendChild(linkTag);
    }
  };

  // Helper function to inject structured data
  const injectStructuredData = (structuredData: object[]) => {
    // Remove existing structured data scripts
    const existingScripts = document.querySelectorAll('script[type="application/ld+json"]');
    existingScripts.forEach(script => {
      if (script.hasAttribute('data-seo-managed')) {
        script.remove();
      }
    });

    // Add new structured data scripts
    structuredData.forEach((schema, index) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-managed', 'true');
      script.setAttribute('data-schema-id', `schema-${index}`);
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });
  };

  return (
    <>
      {/* Static meta tags that don't change */}
      <meta charSet="utf-8" />
      <meta httpEquiv="x-ua-compatible" content="ie=edge" />
      
      {/* DNS prefetch for performance */}
      <link rel="dns-prefetch" href="//www.google-analytics.com" />
      <link rel="dns-prefetch" href="//fonts.googleapis.com" />
      <link rel="dns-prefetch" href="//cdn.jsdelivr.net" />
      
      {/* Preconnect to critical origins */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://www.google-analytics.com" />
      
      {/* Favicon and app icons */}
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
      <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />
      
      {/* Web app manifest */}
      <link rel="manifest" href="/site.webmanifest" />
      
      {/* Preload critical resources */}
      <link
        rel="preload"
        href="/fonts/inter-var.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      
      {/* Prefetch likely next pages for faster navigation */}
      <link rel="prefetch" href="/features" />
      <link rel="prefetch" href="/pricing" />
      <link rel="prefetch" href="/industries" />
      <link rel="prefetch" href="/how-it-works" />
      <link rel="prefetch" href="/demo" />
      
      {/* Security headers */}
      <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://www.google-analytics.com;" />
      <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
      <meta httpEquiv="X-Frame-Options" content="DENY" />
      <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
      <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
      
      {/* Additional structured data that's always present */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "ContractNest",
            "url": "https://contractnest.com",
            "potentialAction": {
              "@type": "SearchAction",
              "target": {
                "@type": "EntryPoint",
                "urlTemplate": "https://contractnest.com/search?q={search_term_string}"
              },
              "query-input": "required name=search_term_string"
            }
          })
        }}
      />
      
      {/* Skip to main content link for accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 bg-red-500 text-white p-2 z-50">
        Skip to main content
      </a>
      
      {children}
    </>
  );
};

export default SEOHead;

// Helper component for critical CSS injection
export const CriticalCSS: React.FC = () => {
  return (
    <style>
      {`
        /* Critical above-the-fold styles */
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          margin: 0;
          padding: 0;
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        /* Skip link styles */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        
        .sr-only:focus {
          position: static;
          width: auto;
          height: auto;
          padding: 0.5rem;
          margin: 0;
          overflow: visible;
          clip: auto;
          white-space: normal;
        }
        
        /* Critical hero section styles */
        .hero-container {
          min-height: 80vh;
          display: flex;
          align-items: center;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        }
        
        .hero-title {
          font-size: clamp(2.5rem, 5vw, 4rem);
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 1.5rem;
          color: #1a202c;
        }
        
        /* Critical form styles */
        .form-input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.2s ease;
        }
        
        .form-input:focus {
          outline: none;
          border-color: #e53e3e;
          box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.1);
        }
        
        .btn-primary {
          background: #e53e3e;
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .btn-primary:hover {
          background: #c53030;
          transform: translateY(-1px);
        }
        
        /* Loading spinner */
        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid #ffffff;
          border-radius: 50%;
          border-top-color: transparent;
          animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        /* Mobile optimization */
        @media (max-width: 768px) {
          .hero-container {
            min-height: 60vh;
            padding: 1rem;
          }
          
          .hero-title {
            font-size: 2.5rem;
          }
        }
        
        /* Font display optimization */
        @font-face {
          font-family: 'Inter';
          font-style: normal;
          font-weight: 100 900;
          font-display: swap;
          src: url('/fonts/inter-var.woff2') format('woff2');
        }
      `}
    </style>
  );
};

// Component for preloading critical resources
export const PreloadCriticalResources: React.FC = () => {
  return (
    <>
      {/* Preload hero image with different sizes */}
      <link
        rel="preload"
        href="/images/hero-dashboard.webp"
        as="image"
        media="(min-width: 768px)"
      />
      <link
        rel="preload"
        href="/images/hero-dashboard-mobile.webp"
        as="image"
        media="(max-width: 767px)"
      />
      
      {/* Preload logo */}
      <link
        rel="preload"
        href="/images/logo.webp"
        as="image"
      />
      
      {/* Prefetch API endpoints likely to be called on landing */}
      <link rel="prefetch" href="/api/health" />
      <link rel="prefetch" href="/api/demo-request" />
    </>
  );
};