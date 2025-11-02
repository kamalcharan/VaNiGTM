import { ConversionEvent, ConversionFormData } from '../../types/cro.types';

export class CROUtils {
  /**
   * Generate unique session identifier
   */
  static generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate lead score for consulting business
   */
  static calculateConsultingLeadScore(formData: ConversionFormData & {
    companySize?: string;
    transformationUrgency?: string;
    currentChallenges?: string[];
    industry?: string;
  }): number {
    let score = 0;
    
    // Email quality (business vs personal)
    if (this.isBusinessEmail(formData.email)) {
      score += 25;
    } else if (this.isValidEmail(formData.email)) {
      score += 10;
    }
    
    // Company information provided
    if (formData.companyName && formData.companyName.length > 2) {
      score += 20;
    }
    
    // Phone number (executive accessibility)
    if (formData.phone && formData.phone.length >= 10) {
      score += 15;
    }
    
    // Company size (enterprise clients score higher)
    if (formData.companySize) {
      const sizeScores = {
        'startup': 5,
        'small': 10,
        'medium': 15,
        'large': 20,
        'enterprise': 25
      };
      score += sizeScores[formData.companySize as keyof typeof sizeScores] || 0;
    }
    
    // Transformation urgency
    if (formData.transformationUrgency) {
      const urgencyScores = {
        'immediate': 20,
        'quarter': 15,
        'year': 10,
        'exploring': 5
      };
      score += urgencyScores[formData.transformationUrgency as keyof typeof urgencyScores] || 0;
    }
    
    // Industry focus areas
    if (formData.industry) {
      const industryScores = {
        'healthcare': 15,
        'pharma': 15,
        'manufacturing': 12,
        'financial': 12,
        'technology': 10,
        'other': 5
      };
      score += industryScores[formData.industry as keyof typeof industryScores] || 0;
    }
    
    // Current challenges (multiple challenges = higher score)
    if (formData.currentChallenges && formData.currentChallenges.length > 0) {
      score += Math.min(formData.currentChallenges.length * 5, 15);
    }
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Validate business email for consulting leads
   */
  static isBusinessEmail(email: string): boolean {
    const consumerDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
      'rediffmail.com', 'yahoo.co.in', 'live.com'
    ];
    
    const domain = email.split('@')[1]?.toLowerCase();
    return domain ? !consumerDomains.includes(domain) : false;
  }

  /**
   * Track consulting-specific conversion events
   */
  static trackConsultingConversion(event: ConversionEvent & {
    consultationType?: 'transformation' | 'ai' | 'general';
    leadScore?: number;
    companySize?: string;
  }): void {
    try {
      // Google Analytics 4 for consulting
      if (typeof gtag !== 'undefined') {
        gtag('event', event.eventName, {
          event_category: event.eventCategory || 'consulting_conversion',
          event_label: event.eventLabel,
          value: event.value || event.leadScore || 0,
          currency: 'INR',
          consultation_type: event.consultationType,
          lead_score: event.leadScore,
          ...event.customParameters
        });
      }

      // Consulting-specific GTM events
      if (typeof dataLayer !== 'undefined') {
        dataLayer.push({
          event: 'consulting_conversion',
          conversionData: {
            eventName: event.eventName,
            consultationType: event.consultationType,
            leadScore: event.leadScore,
            companySize: event.companySize,
            value: event.value,
            ...event.customParameters
          }
        });
      }

    } catch (error) {
      console.warn('Consulting conversion tracking failed:', error);
    }
  }

  /**
   * Generate consultation-focused urgency messages
   */
  static generateConsultationUrgency(consultationType: 'transformation' | 'ai' | 'general'): string {
    const messages = {
      transformation: [
        "70% of transformations fail - Join the 30% that succeed",
        "Free strategy session - Limited calendar availability",
        "Executive consultation - Book your transformation roadmap call",
        "Risk-free strategy session - Start your transformation journey"
      ],
      ai: [
        "AI strategy confusion? Get executive clarity in 30 minutes",
        "Free AI readiness assessment - Limited availability this month",
        "From AI hesitation to confident implementation",
        "Expert AI strategy session - Book your breakthrough call"
      ],
      general: [
        "Executive consultation - Transform your digital future",
        "Free strategy session with Fortune 500 expertise",
        "Book your breakthrough - Digital transformation clarity",
        "Risk-free consultation - Expert guidance available now"
      ]
    };
    
    const typeMessages = messages[consultationType];
    return typeMessages[Math.floor(Math.random() * typeMessages.length)];
  }

  /**
   * Get consultation-optimized CTA text
   */
  static getConsultationCTA(context: 'hero' | 'form' | 'urgency', consultationType?: 'transformation' | 'ai'): string {
    const ctas = {
      hero: {
        transformation: "Get Transformation Help - Free Strategy Session",
        ai: "Get AI Strategy Help - Expert Consultation",
        default: "Book Executive Consultation"
      },
      form: {
        transformation: "Request Transformation Help",
        ai: "Get AI Strategy Help", 
        default: "Book Strategy Call"
      },
      urgency: {
        transformation: "Claim Your Transformation Session",
        ai: "Get AI Strategy Clarity Now",
        default: "Book Your Breakthrough Call"
      }
    };
    
    const contextCtas = ctas[context];
    return consultationType ? contextCtas[consultationType] : contextCtas.default;
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Extract UTM parameters for consulting attribution
   */
  static extractUTMParameters(url?: string): Record<string, string> {
    const targetUrl = url || window.location.href;
    const urlParams = new URLSearchParams(targetUrl.split('?')[1] || '');
    
    const utmParams: Record<string, string> = {};
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    
    utmKeys.forEach(key => {
      const value = urlParams.get(key);
      if (value) {
        utmParams[key] = value;
      }
    });
    
    return utmParams;
  }
}