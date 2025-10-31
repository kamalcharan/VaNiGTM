import { SEOData } from '../types/seo.types';
import { SEO_CONSTANTS } from '../utils/constants/seo.constants';

export const SEO_CONFIG = {
  // Global SEO settings
  GLOBAL: {
    titleTemplate: '%s | Vikuna Technologies - Digital Transformation Consulting',
    defaultTitle: 'Vikuna Technologies - Where 70% of Transformations Fail, We Deliver Success',
    description: SEO_CONSTANTS.SITE_DESCRIPTION,
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      url: SEO_CONSTANTS.SITE_URL,
      siteName: SEO_CONSTANTS.SITE_NAME,
      images: [
        {
          url: `${SEO_CONSTANTS.SITE_URL}/images/og-transformation.jpg`,
          width: 1200,
          height: 630,
          alt: 'Vikuna Technologies - Digital Transformation Consulting'
        }
      ]
    },
    twitter: {
      handle: SEO_CONSTANTS.TWITTER_HANDLE,
      site: SEO_CONSTANTS.TWITTER_HANDLE,
      cardType: 'summary_large_image'
    }
  },

  // Problem-first page configurations
  PAGES: {
    transformation_help: {
      title: 'Get Transformation Help - Expert Digital Strategy Consulting',
      description: 'Struggling with digital transformation? Get expert help from seasoned executives who have delivered successful transformations at Fortune 500 scale.',
      keywords: [
        'transformation help',
        'digital transformation problems', 
        'transformation strategy help',
        'business transformation consulting'
      ]
    },
    ai_strategy_help: {
      title: 'AI Strategy Help - Implementation & Execution Consulting',
      description: 'Need AI strategy help? Our CAiO-level experts help you move from AI confusion to confident implementation with measurable business results.',
      keywords: [
        'AI strategy help',
        'AI implementation consulting',
        'artificial intelligence strategy',
        'AI business transformation'
      ]
    }
  },

  // Technical SEO settings
  TECHNICAL: {
    xmlSitemap: {
      enabled: true,
      changefreq: {
        homepage: 'weekly',
        services: 'monthly',
        case_studies: 'monthly',
        blog: 'weekly'
      },
      priority: {
        homepage: 1.0,
        transformation_help: 0.9,
        ai_strategy_help: 0.9,
        case_studies: 0.8,
        about: 0.7
      }
    }
  }
};

// Utility function to get page-specific SEO config
export const getPageSEOConfig = (pageName: string, customData?: Partial<SEOData>): SEOData => {
  const baseConfig = SEO_CONFIG.GLOBAL;
  const pageConfig = SEO_CONFIG.PAGES[pageName as keyof typeof SEO_CONFIG.PAGES];
  
  return {
    title: customData?.title || pageConfig?.title || baseConfig.defaultTitle,
    description: customData?.description || pageConfig?.description || baseConfig.description,
    keywords: customData?.keywords || pageConfig?.keywords?.join(', ') || SEO_CONSTANTS.PRIMARY_KEYWORDS.join(', '),
    canonical: customData?.canonical || `${SEO_CONSTANTS.SITE_URL}${customData?.canonical || '/'}`,
    ogImage: customData?.ogImage || baseConfig.openGraph.images[0].url,
    ogType: customData?.ogType || 'website',
    twitterCard: 'summary_large_image',
    ...customData
  };
};

export default SEO_CONFIG;