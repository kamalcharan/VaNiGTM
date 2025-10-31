import { SEO_CONSTANTS } from '../constants/seo.constants';

export class SEOUtils {
  /**
   * Generate optimized page title for consulting business
   */
  static generateTitle(pageTitle: string, includeCompany = true): string {
    if (includeCompany) {
      return `${pageTitle} | ${SEO_CONSTANTS.SITE_NAME}`;
    }
    return pageTitle;
  }

  /**
   * Generate problem-focused meta descriptions
   */
  static generateDescription(content: string, maxLength = 160): string {
    if (content.length <= maxLength) {
      return content;
    }
    
    // Find the last complete sentence within the limit
    const trimmed = content.substring(0, maxLength - 3);
    const lastSentence = trimmed.lastIndexOf('.');
    const lastSpace = trimmed.lastIndexOf(' ');
    
    // Use sentence boundary if available and reasonable, otherwise use word boundary
    const cutPoint = lastSentence > maxLength - 50 ? lastSentence + 1 : lastSpace;
    
    return content.substring(0, cutPoint).trim() + '...';
  }

  /**
   * Generate consulting-focused keywords
   */
  static generateKeywords(primary: string[], secondary: string[] = []): string {
    const allKeywords = [...primary, ...secondary, ...SEO_CONSTANTS.PRIMARY_KEYWORDS];
    
    // Remove duplicates and normalize
    const uniqueKeywords = [...new Set(allKeywords.map(k => k.toLowerCase()))]
      .slice(0, 15) // Limit to 15 keywords max
      .map(k => k.charAt(0).toUpperCase() + k.slice(1)); // Capitalize first letter
    
    return uniqueKeywords.join(', ');
  }

  /**
   * Generate canonical URL for consulting pages
   */
  static generateCanonicalUrl(path: string): string {
    // Remove trailing slash and ensure leading slash
    const cleanPath = path.replace(/\/$/, '').replace(/^(?!\/)/, '/');
    return `${SEO_CONSTANTS.SITE_URL}${cleanPath}`;
  }

  /**
   * Generate problem-focused page titles
   */
  static generateProblemFocusedTitle(problem: string, solution: string): string {
    return `${problem} - ${solution} | ${SEO_CONSTANTS.SITE_NAME}`;
  }

  /**
   * Generate consultation-focused CTAs based on context
   */
  static getConsultationCTA(context: 'transformation' | 'ai' | 'general'): string {
    const ctas = {
      transformation: "Get Transformation Help - Free Strategy Session",
      ai: "Get AI Strategy Help - Expert Consultation",
      general: "Book Executive Consultation - Risk-Free Strategy Call"
    };
    
    return ctas[context];
  }

  /**
   * Validate consulting business content
   */
  static validateConsultingContent(content: {
    title: string;
    description: string;
    keywords: string;
    hasProofElements?: boolean;
  }): {
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Title validation for consulting
    if (content.title.length < 40) {
      warnings.push('Title should be longer for consulting queries (minimum 40 characters)');
    }
    if (content.title.length > 65) {
      warnings.push('Title too long for search results (maximum 65 characters)');
    }
    if (!content.title.toLowerCase().includes('help') && !content.title.toLowerCase().includes('consulting')) {
      suggestions.push('Consider including "help" or "consulting" in title for problem-focused SEO');
    }

    // Description validation for consulting
    if (content.description.length < 140) {
      warnings.push('Meta description should be longer for consulting (minimum 140 characters)');
    }
    if (content.description.length > 160) {
      warnings.push('Meta description too long (maximum 160 characters)');
    }

    // Consulting-specific content checks
    if (!content.description.toLowerCase().includes('expert') && !content.description.toLowerCase().includes('experience')) {
      suggestions.push('Consider adding authority signals like "expert" or "experience"');
    }

    if (!content.hasProofElements) {
      suggestions.push('Add social proof elements (case studies, testimonials, metrics)');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions
    };
  }

  /**
   * Generate industry-specific keywords for consulting
   */
  static getIndustryConsultingKeywords(industry: keyof typeof SEO_CONSTANTS.INDUSTRY_KEYWORDS): string[] {
    return SEO_CONSTANTS.INDUSTRY_KEYWORDS[industry] || [];
  }

  /**
   * Generate executive-level structured data
   */
  static generateExecutiveSchema(executiveData: {
    name: string;
    title: string;
    experience: string;
    specialization: string[];
  }): object {
    return {
      "@context": "https://schema.org",
      "@type": "Person",
      "name": executiveData.name,
      "jobTitle": executiveData.title,
      "description": `${executiveData.experience} of experience in ${executiveData.specialization.join(', ')}`,
      "knowsAbout": executiveData.specialization,
      "worksFor": {
        "@type": "Organization",
        "name": SEO_CONSTANTS.SITE_NAME,
        "url": SEO_CONSTANTS.SITE_URL
      }
    };
  }

  /**
   * Generate consultation-focused Open Graph data
   */
  static generateConsultationOG(data: {
    title: string;
    description: string;
    consultationType: 'transformation' | 'ai' | 'general';
  }) {
    const ogImages = {
      transformation: `${SEO_CONSTANTS.SITE_URL}/images/og-transformation-help.jpg`,
      ai: `${SEO_CONSTANTS.SITE_URL}/images/og-ai-strategy-help.jpg`,
      general: `${SEO_CONSTANTS.SITE_URL}/images/og-consulting.jpg`
    };

    return {
      'og:title': data.title,
      'og:description': data.description,
      'og:type': 'website',
      'og:url': SEO_CONSTANTS.SITE_URL,
      'og:site_name': SEO_CONSTANTS.SITE_NAME,
      'og:image': ogImages[data.consultationType],
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:locale': 'en_IN'
    };
  }
}