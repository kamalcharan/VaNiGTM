// src/hooks/useCRO.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  ConversionEvent, 
  ABTestConfig, 
  ExperimentVariant, 
  UserSession, 
  ConversionFormData,
  ConversionMetrics 
} from '../types/cro.types';
import { CROUtils } from '../utils/helpers/cro.utils';

interface CROState {
  session: UserSession | null;
  activeExperiments: Record<string, string>; // experimentId -> variantId
  conversions: ConversionEvent[];
  isLoading: boolean;
}

interface CROOptions {
  trackPageViews?: boolean;
  enableABTesting?: boolean;
  enableHeatmaps?: boolean;
  sessionTimeout?: number; // minutes
}

export const useCRO = (options: CROOptions = {}) => {
  const location = useLocation();
  const [state, setState] = useState<CROState>({
    session: null,
    activeExperiments: {},
    conversions: [],
    isLoading: true
  });
  
  const sessionRef = useRef<UserSession | null>(null);
  const pageViewStartTime = useRef<number>(Date.now());

  // Initialize CRO session
  const initializeSession = useCallback(() => {
    try {
      let session = CROUtils.getSessionData();
      
      if (!session) {
        // Create new session
        session = {
          sessionId: CROUtils.generateSessionId(),
          startTime: new Date(),
          lastActivity: new Date(),
          pageViews: 1,
          experiments: {},
          conversions: [],
          utm_data: CROUtils.extractUTMParameters(),
          device: CROUtils.getDeviceInfo(),
          location: {
            country: 'IN', // Default, can be enhanced with IP geolocation
            timezone: CROUtils.getTimezone()
          }
        };
      } else {
        // Update existing session
        session.lastActivity = new Date();
        session.pageViews += 1;
      }

      sessionRef.current = session;
      CROUtils.storeSessionData(session);
      
      setState(prev => ({
        ...prev,
        session,
        isLoading: false
      }));

      return session;
    } catch (error) {
      console.error('Failed to initialize CRO session:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return null;
    }
  }, []);

  // Track page view
  const trackPageView = useCallback((customData?: Record<string, any>) => {
    if (!options.trackPageViews) return;

    try {
      const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
      
      if (typeof gtag !== 'undefined' && measurementId) {
        gtag('event', 'page_view', {
          page_title: document.title,
          page_location: window.location.href,
          page_path: location.pathname,
          session_id: sessionRef.current?.sessionId,
          user_type: CROUtils.isReturningVisitor() ? 'returning' : 'new',
          device_type: sessionRef.current?.device.type,
          ...customData
        });
      }

      // Track time on previous page
      const timeOnPage = Date.now() - pageViewStartTime.current;
      if (timeOnPage > 5000) { // Only track if more than 5 seconds
        gtag('event', 'time_on_page', {
          event_category: 'engagement',
          event_label: location.pathname,
          value: Math.round(timeOnPage / 1000) // seconds
        });
      }

      pageViewStartTime.current = Date.now();
    } catch (error) {
      console.warn('Page view tracking failed:', error);
    }
  }, [location.pathname, options.trackPageViews]);

  // Track conversion event
  const trackConversion = useCallback((event: ConversionEvent) => {
    try {
      // Add session context to conversion
      const enhancedEvent: ConversionEvent = {
        ...event,
        customParameters: {
          ...event.customParameters,
          session_id: sessionRef.current?.sessionId,
          page_path: location.pathname,
          device_type: sessionRef.current?.device.type,
          user_type: CROUtils.isReturningVisitor() ? 'returning' : 'new',
          timestamp: new Date().toISOString()
        }
      };

      // Track via utility function
      CROUtils.trackConversion(enhancedEvent);

      // Update local state
      setState(prev => ({
        ...prev,
        conversions: [...prev.conversions, enhancedEvent]
      }));

      // Update session storage
      if (sessionRef.current) {
        sessionRef.current.conversions.push(enhancedEvent);
        CROUtils.storeSessionData(sessionRef.current);
      }

      return enhancedEvent;
    } catch (error) {
      console.error('Conversion tracking failed:', error);
      return event;
    }
  }, [location.pathname]);

  // A/B test variant selection
  const getVariant = useCallback((experimentId: string, variants: ExperimentVariant[]): ExperimentVariant => {
    if (!options.enableABTesting) {
      return variants[0]; // Return control variant
    }

    try {
      // Check if user already has a variant for this experiment
      const existingVariant = state.activeExperiments[experimentId];
      if (existingVariant) {
        const variant = variants.find(v => v.id === existingVariant);
        if (variant) return variant;
      }

      // Select new variant
      const selectedVariant = CROUtils.selectVariant(variants, sessionRef.current?.sessionId);
      
      // Store variant selection
      setState(prev => ({
        ...prev,
        activeExperiments: {
          ...prev.activeExperiments,
          [experimentId]: selectedVariant.id
        }
      }));

      // Update session storage
      if (sessionRef.current) {
        sessionRef.current.experiments[experimentId] = selectedVariant.id;
        CROUtils.storeSessionData(sessionRef.current);
      }

      // Track experiment participation
      trackConversion({
        eventName: 'experiment_view',
        eventCategory: 'ab_test',
        eventLabel: `${experimentId}_${selectedVariant.id}`,
        customParameters: {
          experiment_id: experimentId,
          variant_id: selectedVariant.id,
          variant_name: selectedVariant.name
        }
      });

      return selectedVariant;
    } catch (error) {
      console.error('A/B test variant selection failed:', error);
      return variants[0];
    }
  }, [state.activeExperiments, options.enableABTesting, trackConversion]);

  // Track form interactions
  const trackFormInteraction = useCallback((formName: string, fieldName: string, action: 'focus' | 'blur' | 'change') => {
    trackConversion({
      eventName: 'form_interaction',
      eventCategory: 'form',
      eventLabel: `${formName}_${fieldName}_${action}`,
      customParameters: {
        form_name: formName,
        field_name: fieldName,
        interaction_type: action
      }
    });
  }, [trackConversion]);

  // Track scroll depth
  const trackScrollDepth = useCallback((depth: number) => {
    if (depth >= 25 && depth % 25 === 0) { // Track at 25%, 50%, 75%, 100%
      trackConversion({
        eventName: 'scroll',
        eventCategory: 'engagement',
        eventLabel: `${depth}%`,
        value: depth,
        customParameters: {
          page_path: location.pathname,
          scroll_depth: depth
        }
      });
    }
  }, [trackConversion, location.pathname]);

  // Calculate lead score for form data
  const calculateLeadScore = useCallback((formData: ConversionFormData): number => {
    return CROUtils.calculateLeadScore(formData);
  }, []);

  // Get conversion metrics
  const getConversionMetrics = useCallback((): ConversionMetrics => {
    const session = sessionRef.current;
    if (!session) {
      return {
        pageViews: 0,
        uniqueVisitors: 0,
        formSubmissions: 0,
        demoRequests: 0,
        conversionRate: 0,
        averageTimeOnPage: 0,
        bounceRate: 0,
        topExitPoints: []
      };
    }

    const formSubmissions = session.conversions.filter(c => 
      c.eventName === 'form_submit' || c.eventName === 'lead_generated'
    ).length;

    const demoRequests = session.conversions.filter(c => 
      c.eventName === 'demo_request'
    ).length;

    return {
      pageViews: session.pageViews,
      uniqueVisitors: 1, // Current session
      formSubmissions,
      demoRequests,
      conversionRate: CROUtils.calculateConversionRate(formSubmissions + demoRequests, session.pageViews),
      averageTimeOnPage: (Date.now() - pageViewStartTime.current) / 1000,
      bounceRate: session.pageViews === 1 ? 100 : 0,
      topExitPoints: [] // Would need more sophisticated tracking
    };
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Track page views on route change
  useEffect(() => {
    if (sessionRef.current) {
      trackPageView();
    }
  }, [location.pathname, trackPageView]);

  // Auto-save session data periodically
  useEffect(() => {
    if (!sessionRef.current) return;

    const interval = setInterval(() => {
      if (sessionRef.current) {
        sessionRef.current.lastActivity = new Date();
        CROUtils.storeSessionData(sessionRef.current);
      }
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return {
    // State
    session: state.session,
    activeExperiments: state.activeExperiments,
    conversions: state.conversions,
    isLoading: state.isLoading,
    
    // Tracking methods
    trackConversion,
    trackPageView,
    trackFormInteraction,
    trackScrollDepth,
    
    // A/B testing
    getVariant,
    
    // Utilities
    calculateLeadScore,
    getConversionMetrics,
    isReturningVisitor: CROUtils.isReturningVisitor,
    
    // Session helpers
    sessionId: state.session?.sessionId,
    deviceType: state.session?.device.type,
    utmData: state.session?.utm_data
  };
};

// src/hooks/useAnalytics.ts
import { useState, useEffect, useCallback } from 'react';

interface AnalyticsEvent {
  name: string;
  parameters?: Record<string, any>;
  timestamp: Date;
}

interface AnalyticsConfig {
  enableDebugMode?: boolean;
  batchEvents?: boolean;
  batchSize?: number;
  flushInterval?: number; // seconds
}

export const useAnalytics = (config: AnalyticsConfig = {}) => {
  const [eventQueue, setEventQueue] = useState<AnalyticsEvent[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize analytics
  useEffect(() => {
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
    
    if (measurementId && typeof gtag !== 'undefined') {
      setIsInitialized(true);
      
      if (config.enableDebugMode) {
        console.log('Analytics initialized with ID:', measurementId);
      }
    }
  }, [config.enableDebugMode]);

  // Flush event queue
  const flushEvents = useCallback(() => {
    if (!isInitialized || eventQueue.length === 0) return;

    eventQueue.forEach(event => {
      if (typeof gtag !== 'undefined') {
        gtag('event', event.name, event.parameters);
      }
      
      if (config.enableDebugMode) {
        console.log('Analytics Event:', event);
      }
    });

    setEventQueue([]);
  }, [eventQueue, isInitialized, config.enableDebugMode]);

  // Auto-flush events
  useEffect(() => {
    if (!config.batchEvents) return;

    const interval = setInterval(() => {
      flushEvents();
    }, (config.flushInterval || 10) * 1000);

    return () => clearInterval(interval);
  }, [config.batchEvents, config.flushInterval, flushEvents]);

  // Track event
  const track = useCallback((eventName: string, parameters?: Record<string, any>) => {
    const event: AnalyticsEvent = {
      name: eventName,
      parameters,
      timestamp: new Date()
    };

    if (config.batchEvents) {
      setEventQueue(prev => {
        const newQueue = [...prev, event];
        
        // Auto-flush if batch size reached
        if (newQueue.length >= (config.batchSize || 10)) {
          // Flush in next tick
          setTimeout(() => flushEvents(), 0);
        }
        
        return newQueue;
      });
    } else {
      // Send immediately
      if (isInitialized && typeof gtag !== 'undefined') {
        gtag('event', eventName, parameters);
      }
      
      if (config.enableDebugMode) {
        console.log('Analytics Event (immediate):', event);
      }
    }
  }, [config.batchEvents, config.batchSize, isInitialized, config.enableDebugMode, flushEvents]);

  // Track page view
  const trackPageView = useCallback((path?: string, title?: string) => {
    track('page_view', {
      page_path: path || window.location.pathname,
      page_title: title || document.title,
      page_location: window.location.href
    });
  }, [track]);

  // Track user properties
  const setUserProperties = useCallback((properties: Record<string, any>) => {
    if (isInitialized && typeof gtag !== 'undefined') {
      gtag('config', import.meta.env.VITE_GA_MEASUREMENT_ID, {
        custom_map: properties
      });
    }
  }, [isInitialized]);

  // Track conversion
  const trackConversion = useCallback((conversionName: string, value?: number, currency?: string) => {
    track('conversion', {
      event_category: 'conversion',
      event_label: conversionName,
      value: value,
      currency: currency || 'INR'
    });
  }, [track]);

  // Track timing
  const trackTiming = useCallback((category: string, variable: string, value: number) => {
    track('timing_complete', {
      name: variable,
      value: Math.round(value),
      event_category: category
    });
  }, [track]);

  return {
    // State
    isInitialized,
    eventQueue: config.enableDebugMode ? eventQueue : [],
    
    // Core methods
    track,
    trackPageView,
    trackConversion,
    trackTiming,
    setUserProperties,
    
    // Batch methods
    flushEvents,
    
    // Utilities
    isDebugMode: config.enableDebugMode || false
  };
};

export default useCRO;