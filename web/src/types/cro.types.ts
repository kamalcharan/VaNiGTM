// src/types/cro.types.ts
export interface ConversionEvent {
  eventName: string;
  value?: number;
  currency?: string;
  eventCategory?: string;
  eventLabel?: string;
  customParameters?: Record<string, any>;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number; // 0-100 percentage
  component: React.ComponentType<any>;
  metadata?: Record<string, any>;
}

export interface ABTestConfig {
  experimentId: string;
  name: string;
  description?: string;
  variants: ExperimentVariant[];
  targetingRules?: TargetingRule[];
  conversionGoals: string[];
  startDate?: Date;
  endDate?: Date;
  status: 'draft' | 'running' | 'paused' | 'completed';
}

export interface TargetingRule {
  type: 'url' | 'utm_source' | 'device' | 'location' | 'user_agent' | 'custom';
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex';
  value: string;
}

export interface ConversionFormData {
  email: string;
  companyName?: string;
  phone?: string;
  industry?: string;
  contractsCount?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
}

export interface TrustSignal {
  type: 'testimonial' | 'logo' | 'certification' | 'statistic' | 'award';
  content: string;
  author?: string;
  company?: string;
  image?: string;
  verified?: boolean;
  date?: Date;
}

export interface UrgencyConfig {
  type: 'scarcity' | 'time_limited' | 'social_proof' | 'exclusive';
  message: string;
  trigger?: {
    type: 'timer' | 'visitor_count' | 'signup_count';
    value: number | Date;
  };
  style?: 'banner' | 'popup' | 'inline' | 'floating';
}

export interface ConversionMetrics {
  pageViews: number;
  uniqueVisitors: number;  
  formSubmissions: number;
  demoRequests: number;
  conversionRate: number;
  averageTimeOnPage: number;
  bounceRate: number;
  topExitPoints: string[];
}

export interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: Date;
  lastActivity: Date;
  pageViews: number;
  experiments: Record<string, string>; // experimentId -> variantId
  conversions: ConversionEvent[];
  utm_data?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  device: {
    type: 'desktop' | 'mobile' | 'tablet';
    browser: string;
    os: string;
  };
  location?: {
    country: string;
    city?: string;
    timezone: string;
  };
}

// src/utils/helpers/cro.utils.ts
import { ConversionEvent, ABTestConfig, ExperimentVariant, UserSession, ConversionFormData } from '../../types/cro.types';

export class CROUtils {
  /**
   * Generate unique session identifier
   */
  static generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract UTM parameters from URL
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

  /**
   * Get device information
   */
  static getDeviceInfo(): UserSession['device'] {
    const userAgent = navigator.userAgent;
    
    // Detect device type
    let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
      deviceType = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
      deviceType = 'mobile';
    }
    
    // Detect browser
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    else if (userAgent.includes('Opera')) browser = 'Opera';
    
    // Detect OS
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';
    
    return { type: deviceType, browser, os };
  }

  /**
   * Calculate conversion rate
   */
  static calculateConversionRate(conversions: number, totalVisitors: number): number {
    if (totalVisitors === 0) return 0;
    return Math.round((conversions / totalVisitors) * 10000) / 100; // 2 decimal places
  }

  /**
   * A/B Test variant selection using weighted distribution
   */
  static selectVariant(variants: ExperimentVariant[], userId?: string): ExperimentVariant {
    // Use consistent hashing for same user to get same variant
    let hash = 0;
    const seedString = userId || Date.now().toString();
    
    for (let i = 0; i < seedString.length; i++) {
      const char = seedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Normalize to 0-100 range
    const normalizedHash = Math.abs(hash) % 100;
    
    // Select variant based on weights
    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (normalizedHash < cumulativeWeight) {
        return variant;
      }
    }
    
    // Fallback to first variant
    return variants[0];
  }

  /**
   * Track conversion event
   */
  static trackConversion(event: ConversionEvent): void {
    try {
      const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
      
      // Google Analytics 4 event tracking
      if (typeof gtag !== 'undefined' && measurementId) {
        gtag('event', event.eventName, {
          event_category: event.eventCategory || 'conversion',
          event_label: event.eventLabel,
          value: event.value,
          currency: event.currency || 'INR',
          ...event.customParameters
        });
      }

      // Google Tag Manager
      if (typeof dataLayer !== 'undefined') {
        dataLayer.push({
          event: 'conversion',
          conversionData: {
            eventName: event.eventName,
            value: event.value,
            currency: event.currency || 'INR',
            category: event.eventCategory,
            label: event.eventLabel,
            ...event.customParameters
          }
        });
      }

      // Custom analytics (if needed)
      if (window.contractNestAnalytics) {
        window.contractNestAnalytics.track(event.eventName, {
          value: event.value,
          currency: event.currency,
          ...event.customParameters
        });
      }

    } catch (error) {
      console.warn('Conversion tracking failed:', error);
    }
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate business email (exclude common consumer domains)
   */
  static isBusinessEmail(email: string): boolean {
    const consumerDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
      'rediffmail.com', 'yahoo.co.in'
    ];
    
    const domain = email.split('@')[1]?.toLowerCase();
    return domain ? !consumerDomains.includes(domain) : false;
  }

  /**
   * Format phone number for India
   */
  static formatIndianPhone(phone: string): string {
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '');
    
    // Handle Indian phone numbers
    if (cleaned.length === 10) {
      return `+91-${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+91-${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    
    return phone; // Return original if format doesn't match
  }

  /**
   * Generate lead score based on form data
   */
  static calculateLeadScore(formData: ConversionFormData): number {
    let score = 0;
    
    // Email quality
    if (this.isBusinessEmail(formData.email)) {
      score += 30;
    } else if (this.isValidEmail(formData.email)) {
      score += 15;
    }
    
    // Company name provided
    if (formData.companyName && formData.companyName.length > 2) {
      score += 20;
    }
    
    // Phone number provided
    if (formData.phone && formData.phone.length >= 10) {
      score += 15;
    }
    
    // Industry selection
    if (formData.industry && formData.industry !== 'Other') {
      score += 10;
    }
    
    // Contract volume indication
    if (formData.contractsCount) {
      const count = parseInt(formData.contractsCount);
      if (count >= 50) score += 20;
      else if (count >= 20) score += 15;
      else if (count >= 10) score += 10;
      else if (count >= 1) score += 5;
    }
    
    // UTM source quality (direct/organic traffic often higher quality)
    if (formData.utm_source) {
      if (formData.utm_source === 'google' || formData.utm_source === 'organic') {
        score += 10;
      } else if (formData.utm_source === 'linkedin') {
        score += 15;
      }
    }
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Store session data in localStorage
   */
  static storeSessionData(session: Partial<UserSession>): void {
    try {
      const existingData = localStorage.getItem('contractnest_session');
      const currentSession = existingData ? JSON.parse(existingData) : {};
      
      const updatedSession = {
        ...currentSession,
        ...session,
        lastActivity: new Date().toISOString()
      };
      
      localStorage.setItem('contractnest_session', JSON.stringify(updatedSession));
    } catch (error) {
      console.warn('Failed to store session data:', error);
    }
  }

  /**
   * Retrieve session data from localStorage
   */
  static getSessionData(): UserSession | null {
    try {
      const data = localStorage.getItem('contractnest_session');
      if (data) {
        const session = JSON.parse(data);
        // Convert date strings back to Date objects
        session.startTime = new Date(session.startTime);
        session.lastActivity = new Date(session.lastActivity);
        return session;
      }
    } catch (error) {
      console.warn('Failed to retrieve session data:', error);
    }
    return null;
  }

  /**
   * Check if user is returning visitor
   */
  static isReturningVisitor(): boolean {
    const session = this.getSessionData();
    if (!session) return false;
    
    const daysSinceFirstVisit = (Date.now() - session.startTime.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceFirstVisit > 1; // Returning after more than 1 day
  }

  /**
   * Get visitor's estimated timezone
   */
  static getTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      return 'UTC';
    }
  }

  /**
   * Check if user is from target geographic location
   */
  static isTargetLocation(targetCountries: string[] = ['IN', 'US', 'SG']): Promise<boolean> {
    return new Promise((resolve) => {
      // Try to get location from timezone
      const timezone = this.getTimezone();
      const indianTimezones = ['Asia/Kolkata', 'Asia/Calcutta'];
      
      if (indianTimezones.includes(timezone)) {
        resolve(true);
        return;
      }
      
      // Fallback: Use a geolocation service if needed
      // For now, assume all visitors are target audience
      resolve(true);
    });
  }

  /**
   * Debounce function for form inputs
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
  }

  /**
   * Generate personalized urgency message
   */
  static generateUrgencyMessage(visitorData: Partial<UserSession>): string {
    const messages = [
      "Join 500+ businesses already using ContractNest",
      "Limited early access - Reserve your spot today",
      "Setup takes less than 5 minutes - Start now",
      "Free demo slots filling up - Book yours today"
    ];
    
    // Personalize based on visitor data
    if (visitorData.device?.type === 'mobile') {
      return "Quick mobile setup in under 5 minutes";
    }
    
    if (this.isReturningVisitor()) {
      return "Welcome back! Complete your demo request";
    }
    
    // Random selection for new visitors
    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Get conversion-optimized button text
   */
  static getOptimizedCTAText(context: 'hero' | 'pricing' | 'demo' | 'form', industry?: string): string {
    const ctaTexts = {
      hero: [
        "Start Free Trial",
        "Get Early Access", 
        "Transform My Contracts",
        "See ContractNest in Action"
      ],
      pricing: [
        "Start at ₹250/Contract",
        "Get Custom Quote",
        "Calculate My Savings",
        "Start Free Demo"
      ],
      demo: [
        "Book Free Demo",
        "See Live Demo",
        "Schedule Walkthrough",
        "Get Personalized Demo"
      ],
      form: [
        "Get Started Now",
        "Request Demo",
        "Join Early Access",
        "Transform My Business"
      ]
    };
    
    // Industry-specific optimization
    if (industry === 'healthcare') {
      return context === 'demo' ? "See HIPAA-Compliant Demo" : ctaTexts[context][0];
    }
    
    return ctaTexts[context][0];
  }
}