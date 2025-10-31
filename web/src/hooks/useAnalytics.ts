/ src/hooks/useAnalytics.ts
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