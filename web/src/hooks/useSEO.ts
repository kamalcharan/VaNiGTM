// src/hooks/useSEO.ts
import { useEffect, useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SEOData } from '../types/seo.types';
import { SEOUtils } from '../utils/helpers/seo.utils';
import { SEO_CONFIG } from '../config/seo.config';
import { STRUCTURED_DATA_CONSTANTS } from '../utils/data/structured-data.constants';

interface UseSEOOptions {
  enableAnalytics?: boolean;
  enablePerformanceTracking?: boolean;
  enableStructuredData?: boolean;
}

interface SEOState {
  isLoading: boolean;
  error: string | null;
  currentSEO: SEOData | null;
}

export const useSEO = (
  seoData: SEOData,
  options: UseSEOOptions = {
    enableAnalytics: true,
    enablePerformanceTracking: true,
    enableStructuredData: true
  }
) => {
  const location = useLocation();
  const [state, setState] = useState<SEOState>({
    isLoading: true,
    error: null,
    currentSEO: null
  });

  // Update SEO when data changes
  const updateSEO = useCallback((newSEOData: SEOData) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Validate SEO data
      const validation = SEOUtils.validateSEOContent({
        title: newSEOData.title,
        description: newSEOData.description,
        keywords: newSEOData.keywords || ''
      });

      if (!validation.isValid && process.env.NODE_ENV === 'development') {
        console.warn('SEO Validation Warnings:', validation.warnings);
        console.info('SEO Suggestions:', validation.suggestions);
      }

      // Update document title
      document.title = newSEOData.title;

      // Update meta description
      updateOrCreateMetaTag('name', 'description', newSEOData.description);

      // Update meta keywords
      if (newSEOData.keywords) {
        updateOrCreateMetaTag('name', 'keywords', newSEOData.keywords);
      }

      // Update canonical URL
      if (newSEOData.canonical) {
        updateOrCreateLinkTag('canonical', newSEOData.canonical);
      } else {
        // Auto-generate canonical URL from current location
        const canonicalUrl = SEOUtils.generateCanonicalUrl(location.pathname);
        updateOrCreateLinkTag('canonical', canonicalUrl);
      }

      // Update robots meta tag
      const robotsContent = [
        newSEOData.noindex ? 'noindex' : 'index',
        newSEOData.nofollow ? 'nofollow' : 'follow'
      ].join(', ');
      updateOrCreateMetaTag('name', 'robots', robotsContent);

      // Update Open Graph tags
      updateOpenGraphTags(newSEOData);

      // Update Twitter Card tags
      updateTwitterCardTags(newSEOData);

      // Update structured data
      if (options.enableStructuredData && newSEOData.structuredData) {
        updateStructuredData(newSEOData.structuredData);
      }

      // Track page view for analytics
      if (options.enableAnalytics) {
        trackPageView(newSEOData);
      }

      setState({
        isLoading: false,
        error: null,
        currentSEO: newSEOData
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown SEO error';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      console.error('SEO Update Error:', error);
    }
  }, [location.pathname, options]);

  // Helper function to update or create meta tags
  const updateOrCreateMetaTag = useCallback((attributeName: string, attributeValue: string, content: string) => {
    let metaTag = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
    
    if (metaTag) {
      metaTag.setAttribute('content', content);
    } else {
      metaTag = document.createElement('meta');
      metaTag.setAttribute(attributeName, attributeValue);
      metaTag.setAttribute('content', content);
      metaTag.setAttribute('data-seo-managed', 'true');
      document.head.appendChild(metaTag);
    }
  }, []);

  // Helper function to update or create link tags
  const updateOrCreateLinkTag = useCallback((rel: string, href: string) => {
    let linkTag = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
    
    if (linkTag) {
      linkTag.href = href;
    } else {
      linkTag = document.createElement('link');
      linkTag.rel = rel;
      linkTag.href = href;
      linkTag.setAttribute('data-seo-managed', 'true');
      document.head.appendChild(linkTag);
    }
  }, []);

  // Update Open Graph tags
  const updateOpenGraphTags = useCallback((seoData: SEOData) => {
    const ogTags = {
      'og:title': seoData.title,
      'og:description': seoData.description,
      'og:type': seoData.ogType || 'website',
      'og:url': seoData.canonical || window.location.href,
      'og:site_name': 'ContractNest',
      'og:locale': 'en_IN'
    };

    if (seoData.ogImage) {
      ogTags['og:image'] = seoData.ogImage;
      ogTags['og:image:width'] = '1200';
      ogTags['og:image:height'] = '630';
      ogTags['og:image:alt'] = `${seoData.title} - ContractNest`;
    }

    Object.entries(ogTags).forEach(([property, content]) => {
      updateOrCreateMetaTag('property', property, content);
    });
  }, [updateOrCreateMetaTag]);

  // Update Twitter Card tags
  const updateTwitterCardTags = useCallback((seoData: SEOData) => {
    const twitterTags = SEOUtils.generateTwitterCard({
      title: seoData.title,
      description: seoData.description,
      image: seoData.ogImage,
      type: seoData.twitterCard || 'summary_large_image'
    });

    Object.entries(twitterTags).forEach(([name, content]) => {
      updateOrCreateMetaTag('name', name, content);
    });
  }, [updateOrCreateMetaTag]);

  // Update structured data
  const updateStructuredData = useCallback((structuredData: object[]) => {
    // Remove existing SEO-managed structured data scripts
    const existingScripts = document.querySelectorAll('script[type="application/ld+json"][data-seo-managed]');
    existingScripts.forEach(script => script.remove());

    // Add new structured data scripts
    structuredData.forEach((schema, index) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-managed', 'true');
      script.setAttribute('data-schema-id', `schema-${index}`);
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });
  }, []);

  // Track page view for analytics
  const trackPageView = useCallback((seoData: SEOData) => {
    try {
      // Google Analytics 4
      if (typeof gtag !== 'undefined') {
        gtag('config', process.env.REACT_APP_GA_TRACKING_ID || '', {
          page_title: seoData.title,
          page_location: window.location.href,
          page_path: location.pathname
        });

        // Custom event for SEO tracking
        gtag('event', 'seo_page_view', {
          page_title: seoData.title,
          page_path: location.pathname,
          seo_score: calculateSEOScore(seoData)
        });
      }

      // Google Tag Manager
      if (typeof dataLayer !== 'undefined') {
        dataLayer.push({
          event: 'seo_page_view',
          pageTitle: seoData.title,
          pagePath: location.pathname,
          seoData: {
            hasStructuredData: !!seoData.structuredData,
            hasOgImage: !!seoData.ogImage,
            titleLength: seoData.title.length,
            descriptionLength: seoData.description.length
          }
        });
      }
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
    }
  }, [location.pathname]);

  // Calculate basic SEO score
  const calculateSEOScore = useCallback((seoData: SEOData): number => {
    let score = 0;
    
    // Title optimization (0-25 points)
    if (seoData.title.length >= 30 && seoData.title.length <= 60) score += 25;
    else if (seoData.title.length >= 20) score += 15;
    
    // Description optimization (0-25 points)
    if (seoData.description.length >= 120 && seoData.description.length <= 160) score += 25;
    else if (seoData.description.length >= 100) score += 15;
    
    // Keywords (0-15 points)
    if (seoData.keywords && seoData.keywords.length > 0) score += 15;
    
    // Canonical URL (0-10 points)
    if (seoData.canonical) score += 10;
    
    // Open Graph image (0-15 points)
    if (seoData.ogImage) score += 15;
    
    // Structured data (0-10 points)
    if (seoData.structuredData && seoData.structuredData.length > 0) score += 10;
    
    return score;
  }, []);

  // Performance tracking
  const trackPerformance = useCallback(() => {
    if (!options.enablePerformanceTracking) return;

    try {
      // Track Core Web Vitals
      if ('web-vital' in window) {
        const { getCLS, getFID, getFCP, getLCP, getTTFB } = window['web-vital'];
        
        getCLS((metric) => {
          if (typeof gtag !== 'undefined') {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_label: 'CLS',
              value: Math.round(metric.value * 1000)
            });
          }
        });

        getFID((metric) => {
          if (typeof gtag !== 'undefined') {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_label: 'FID',
              value: Math.round(metric.value)
            });
          }
        });

        getLCP((metric) => {
          if (typeof gtag !== 'undefined') {
            gtag('event', 'web_vitals', {
              event_category: 'Web Vitals',
              event_label: 'LCP',
              value: Math.round(metric.value)
            });
          }
        });
      }
    } catch (error) {
      console.warn('Performance tracking failed:', error);
    }
  }, [options.enablePerformanceTracking]);

  // Main effect to update SEO
  useEffect(() => {
    updateSEO(seoData);
  }, [seoData, updateSEO]);

  // Track performance on mount
  useEffect(() => {
    trackPerformance();
  }, [trackPerformance]);

  // Cleanup function
  useEffect(() => {
    return () => {
      // Cleanup SEO-managed elements on unmount
      const managedElements = document.querySelectorAll('[data-seo-managed]');
      managedElements.forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
    };
  }, []);

  // Public methods
  const refreshSEO = useCallback(() => {
    updateSEO(seoData);
  }, [seoData, updateSEO]);

  const updateSEOData = useCallback((newData: Partial<SEOData>) => {
    const updatedSEO = { ...seoData, ...newData };
    updateSEO(updatedSEO);
  }, [seoData, updateSEO]);

  const getSEOScore = useCallback(() => {
    return calculateSEOScore(seoData);
  }, [seoData, calculateSEOScore]);

  return {
    // State
    isLoading: state.isLoading,
    error: state.error,
    currentSEO: state.currentSEO,
    seoScore: getSEOScore(),
    
    // Methods
    refreshSEO,
    updateSEOData,
    getSEOScore,
    
    // Utilities
    generateCanonicalUrl: (path: string) => SEOUtils.generateCanonicalUrl(path),
    generateTitle: (title: string) => SEOUtils.generateTitle(title),
    generateDescription: (content: string) => SEOUtils.generateDescription(content),
    generateKeywords: (primary: string[], secondary?: string[]) => 
      SEOUtils.generateKeywords(primary, secondary),
    validateSEO: () => SEOUtils.validateSEOContent({
      title: seoData.title,
      description: seoData.description,
      keywords: seoData.keywords || ''
    })
  };
};

// Hook for getting page-specific SEO data
export const usePageSEO = (pageName: string, customData?: Partial<SEOData>) => {
  const location = useLocation();
  
  const seoData = useMemo(() => {
    // Get base SEO data from config
    const baseSEO = SEO_CONFIG.getPageSEOConfig?.(pageName, customData) || {
      title: customData?.title || 'ContractNest - Service Contract Exchange',
      description: customData?.description || 'Transform your service commitments into living assets',
      canonical: SEOUtils.generateCanonicalUrl(location.pathname),
      ...customData
    };

    // Add default structured data
    const structuredData = [
      STRUCTURED_DATA_CONSTANTS.ORGANIZATION,
      ...(customData?.structuredData || [])
    ];

    return {
      ...baseSEO,
      structuredData
    };
  }, [pageName, customData, location.pathname]);

  return useSEO(seoData);
};

export default useSEO;