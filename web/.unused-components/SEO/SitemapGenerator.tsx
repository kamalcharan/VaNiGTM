// src/components/SEO/SitemapGenerator.tsx
import React, { useEffect } from 'react';
import { SitemapGenerator } from '../../utils/sitemap.utils';

const SitemapGeneratorComponent: React.FC = () => {
  useEffect(() => {
    // Generate sitemap and make it available
    if (process.env.NODE_ENV === 'development') {
      const sitemap = SitemapGenerator.generateContractNestSitemap();
      console.log('Generated Sitemap:', sitemap);
      
      // In production, this would be served as /sitemap.xml
      // You could also save it to public/sitemap.xml during build
    }
  }, []);

  return null;
};

export default SitemapGeneratorComponent;