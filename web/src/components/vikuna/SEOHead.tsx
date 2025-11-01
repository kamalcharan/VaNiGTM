// src/components/vikuna/SEOHead.tsx
import { useEffect } from 'react';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogUrl?: string;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title = "Fractional CDO & CAiO Services | AI Transformation | Vikuna Technologies",
  description = "Get Fortune 500 AI leadership without the 7-figure salary. 200+ years experience. 70% success rate. Start with a free strategy session today.",
  keywords = "fractional CDO, fractional CAiO, AI consulting, digital transformation, AI leadership, CDO as a service, AI strategy",
  ogImage = "https://vikuna.com/og-image.jpg",
  ogUrl = "https://vikuna.com"
}) => {
  useEffect(() => {
    // Set page title
    document.title = title;

    // Helper function to update or create meta tags
    const setMetaTag = (property: string, content: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let element = document.querySelector(`meta[${attribute}="${property}"]`) as HTMLMetaElement;

      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, property);
        document.head.appendChild(element);
      }

      element.setAttribute('content', content);
    };

    // Basic meta tags
    setMetaTag('description', description);
    setMetaTag('keywords', keywords);

    // Open Graph tags
    setMetaTag('og:type', 'website', true);
    setMetaTag('og:title', title, true);
    setMetaTag('og:description', description, true);
    setMetaTag('og:image', ogImage, true);
    setMetaTag('og:url', ogUrl, true);
    setMetaTag('og:site_name', 'Vikuna Technologies', true);

    // Twitter Card tags
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', title);
    setMetaTag('twitter:description', description);
    setMetaTag('twitter:image', ogImage);

    // SEO tags
    setMetaTag('robots', 'index, follow');
    setMetaTag('googlebot', 'index, follow');

    // Canonical link
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', ogUrl);

    // Structured data (JSON-LD)
    let script = document.querySelector('script[type="application/ld+json"]');
    if (!script) {
      script = document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      document.head.appendChild(script);
    }

    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      "name": "Vikuna Technologies",
      "description": description,
      "url": ogUrl,
      "logo": "https://vikuna.com/logo.png",
      "telephone": "+91-7702864233",
      "email": "contact@vikuna.com",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "IN"
      },
      "priceRange": "$$$$",
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "50"
      },
      "sameAs": [
        "https://www.linkedin.com/company/vikuna",
        "https://twitter.com/vikuna"
      ]
    });
  }, [title, description, keywords, ogImage, ogUrl]);

  return null; // This component doesn't render anything
};

export default SEOHead;
