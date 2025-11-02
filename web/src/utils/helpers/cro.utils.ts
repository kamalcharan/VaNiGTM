import { ConversionEvent, ConversionFormData, UserSession, ExperimentVariant } from '../../types/cro.types';

export class CROUtils {
  private static readonly SESSION_STORAGE_KEY = 'cro_session';
  private static readonly VISITOR_STORAGE_KEY = 'cro_visitor';

  /**
   * Generate unique session identifier
   */
  static generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store session data in localStorage
   */
  static storeSessionData(session: UserSession): void {
    try {
      localStorage.setItem(this.SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.warn('Failed to store session data:', error);
    }
  }

  /**
   * Get session data from localStorage
   */
  static getSessionData(): UserSession | null {
    try {
      const data = localStorage.getItem(this.SESSION_STORAGE_KEY);
      if (!data) return null;

      const session = JSON.parse(data);
      // Convert date strings back to Date objects
      if (session.startTime) session.startTime = new Date(session.startTime);
      if (session.lastActivity) session.lastActivity = new Date(session.lastActivity);

      return session;
    } catch (error) {
      console.warn('Failed to get session data:', error);
      return null;
    }
  }

  /**
   * Check if visitor is returning
   */
  static isReturningVisitor(): boolean {
    try {
      return localStorage.getItem(this.VISITOR_STORAGE_KEY) !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get device information
   */
  static getDeviceInfo(): { type: 'desktop' | 'mobile' | 'tablet'; os: string; browser: string } {
    const userAgent = navigator.userAgent.toLowerCase();

    // Detect device type
    const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
    const isTablet = /ipad|android(?!.*mobile)|tablet/.test(userAgent);
    const type: 'desktop' | 'mobile' | 'tablet' = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

    // Detect OS
    let os = 'unknown';
    if (userAgent.includes('windows')) os = 'windows';
    else if (userAgent.includes('mac')) os = 'macos';
    else if (userAgent.includes('linux')) os = 'linux';
    else if (userAgent.includes('android')) os = 'android';
    else if (userAgent.includes('ios') || userAgent.includes('iphone') || userAgent.includes('ipad')) os = 'ios';

    // Detect browser
    let browser = 'unknown';
    if (userAgent.includes('chrome')) browser = 'chrome';
    else if (userAgent.includes('safari')) browser = 'safari';
    else if (userAgent.includes('firefox')) browser = 'firefox';
    else if (userAgent.includes('edge')) browser = 'edge';

    return { type, os, browser };
  }

  /**
   * Get user timezone
   */
  static getTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      return 'UTC';
    }
  }

  /**
   * Track conversion event
   */
  static trackConversion(event: ConversionEvent): void {
    try {
      if (typeof gtag !== 'undefined') {
        gtag('event', event.eventName, {
          event_category: event.eventCategory,
          event_label: event.eventLabel,
          value: event.value,
          currency: event.currency || 'INR',
          ...event.customParameters
        });
      }

      if (typeof dataLayer !== 'undefined') {
        dataLayer.push({
          event: 'conversion',
          conversionData: event
        });
      }
    } catch (error) {
      console.warn('Conversion tracking failed:', error);
    }
  }

  /**
   * Select variant for A/B test based on weighted distribution
   */
  static selectVariant(variants: ExperimentVariant[], sessionId?: string): ExperimentVariant {
    if (variants.length === 0) {
      throw new Error('No variants provided');
    }

    if (variants.length === 1) {
      return variants[0];
    }

    // Use session ID for consistent variant selection
    const seed = sessionId ? this.hashCode(sessionId) : Math.random();
    const random = Math.abs(seed % 1);

    // Calculate cumulative weights
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    let cumulative = 0;

    for (const variant of variants) {
      cumulative += variant.weight / totalWeight;
      if (random < cumulative) {
        return variant;
      }
    }

    return variants[variants.length - 1];
  }

  /**
   * Calculate lead score (wrapper for consulting lead score)
   */
  static calculateLeadScore(formData: ConversionFormData): number {
    return this.calculateConsultingLeadScore(formData);
  }

  /**
   * Calculate conversion rate
   */
  static calculateConversionRate(conversions: number, views: number): number {
    if (views === 0) return 0;
    return (conversions / views) * 100;
  }

  /**
   * Hash function for consistent randomization
   */
  private static hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash / 2147483647; // Normalize to 0-1
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