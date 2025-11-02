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

// Global type declarations for analytics
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
    contractNestAnalytics?: {
      track: (eventName: string, data: any) => void;
    };
  }

  function gtag(...args: any[]): void;
  const dataLayer: any[];
}

export {};
