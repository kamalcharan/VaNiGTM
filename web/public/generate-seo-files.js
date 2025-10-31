#!/usr/bin/env node

// scripts/generate-seo-files.js
// Vite + TypeScript compatible version for Vikuna Technologies

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SitemapGenerator {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.urls = [];
  }

  addUrl(url) {
    this.urls.push({
      ...url,
      url: this.baseUrl + url.url
    });
  }

  addUrls(urls) {
    urls.forEach(url => this.addUrl(url));
  }

  generateXML() {
    const urlset = this.urls.map(url => {
      let urlElement = `    <url>\n        <loc>${url.url}</loc>\n`;
      
      if (url.lastmod) {
        urlElement += `        <lastmod>${url.lastmod}</lastmod>\n`;
      }
      
      if (url.changefreq) {
        urlElement += `        <changefreq>${url.changefreq}</changefreq>\n`;
      }
      
      if (url.priority !== undefined) {
        urlElement += `        <priority>${url.priority}</priority>\n`;
      }
      
      urlElement += `    </url>`;
      return urlElement;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlset}
</urlset>`;
  }
}

class RobotsGenerator {
  constructor() {
    this.rules = [];
    this.sitemaps = [];
    this.host = null;
    this.crawlDelay = null;
  }

  addRule(rule) {
    this.rules.push(rule);
  }

  addSitemap(sitemapUrl) {
    this.sitemaps.push(sitemapUrl);
  }

  setHost(host) {
    this.host = host;
  }

  setCrawlDelay(delay) {
    this.crawlDelay = delay;
  }

  generateRobotsTxt() {
    let robotsTxt = '';

    this.rules.forEach(rule => {
      robotsTxt += `User-agent: ${rule.userAgent}\n`;
      
      if (rule.allow) {
        rule.allow.forEach(path => {
          robotsTxt += `Allow: ${path}\n`;
        });
      }
      
      if (rule.disallow) {
        rule.disallow.forEach(path => {
          robotsTxt += `Disallow: ${path}\n`;
        });
      }
      
      if (this.crawlDelay) {
        robotsTxt += `Crawl-delay: ${this.crawlDelay}\n`;
      }
      
      robotsTxt += '\n';
    });

    if (this.host) {
      robotsTxt += `Host: ${this.host}\n\n`;
    }

    this.sitemaps.forEach(sitemap => {
      robotsTxt += `Sitemap: ${sitemap}\n`;
    });

    return robotsTxt.trim();
  }
}

// Vikuna Technologies specific configuration
const VIKUNA_CONFIG = {
  baseUrl: 'https://vikuna.io',
  pages: [
    // Main pages
    { url: '/', changefreq: 'weekly', priority: 1.0 },
    { url: '/transformation-help', changefreq: 'weekly', priority: 0.9 },
    { url: '/ai-strategy-help', changefreq: 'weekly', priority: 0.9 },
    { url: '/services', changefreq: 'monthly', priority: 0.8 },
    { url: '/our-approach', changefreq: 'monthly', priority: 0.8 },
    
    // Service pages
    { url: '/cdo-as-a-service', changefreq: 'monthly', priority: 0.8 },
    { url: '/caio-as-a-service', changefreq: 'monthly', priority: 0.8 },
    { url: '/digital-transformation-consulting', changefreq: 'monthly', priority: 0.8 },
    { url: '/ai-strategy-consulting', changefreq: 'monthly', priority: 0.8 },
    
    // Industry pages
    { url: '/industries/healthcare', changefreq: 'monthly', priority: 0.7 },
    { url: '/industries/manufacturing', changefreq: 'monthly', priority: 0.7 },
    { url: '/industries/pharma', changefreq: 'monthly', priority: 0.7 },
    { url: '/industries/financial-services', changefreq: 'monthly', priority: 0.7 },
    
    // Training and academy
    { url: '/digital-academy', changefreq: 'weekly', priority: 0.7 },
    { url: '/training/process-mining', changefreq: 'monthly', priority: 0.6 },
    { url: '/training/ai-for-leaders', changefreq: 'monthly', priority: 0.6 },
    { url: '/training/digital-transformation', changefreq: 'monthly', priority: 0.6 },
    
    // About and contact
    { url: '/about', changefreq: 'monthly', priority: 0.6 },
    { url: '/team', changefreq: 'monthly', priority: 0.5 },
    { url: '/case-studies', changefreq: 'weekly', priority: 0.7 },
    { url: '/contact', changefreq: 'monthly', priority: 0.6 },
    { url: '/join-network', changefreq: 'monthly', priority: 0.5 },
    
    // Legal pages
    { url: '/privacy-policy', changefreq: 'yearly', priority: 0.3 },
    { url: '/terms-of-service', changefreq: 'yearly', priority: 0.3 }
  ],
  
  blogPosts: [
    '/blog/digital-transformation-success-factors',
    '/blog/ai-strategy-implementation-guide',
    '/blog/process-mining-roi-calculation',
    '/blog/executive-guide-to-ai-adoption',
    '/blog/transformation-failure-analysis'
  ],
  
  resources: [
    '/resources/transformation-readiness-assessment',
    '/resources/ai-strategy-framework',
    '/resources/digital-leadership-guide',
    '/resources/roi-calculator'
  ]
};

// Generate Vikuna sitemap
function generateVikunaSitemap() {
  const generator = new SitemapGenerator(VIKUNA_CONFIG.baseUrl);
  const today = new Date().toISOString().split('T')[0];
  
  // Add main pages
  const mainPages = VIKUNA_CONFIG.pages.map(page => ({
    ...page,
    lastmod: today
  }));
  
  // Add blog posts
  const blogPages = VIKUNA_CONFIG.blogPosts.map(url => ({
    url,
    lastmod: today,
    changefreq: 'monthly',
    priority: 0.6
  }));
  
  // Add resource pages
  const resourcePages = VIKUNA_CONFIG.resources.map(url => ({
    url,
    lastmod: today,
    changefreq: 'monthly',
    priority: 0.5
  }));

  generator.addUrls([...mainPages, ...blogPages, ...resourcePages]);
  return generator.generateXML();
}

// Generate Vikuna robots.txt
function generateVikunaRobots() {
  const generator = new RobotsGenerator();
  
  // Allow all crawlers with restrictions
  generator.addRule({
    userAgent: '*',
    allow: ['/'],
    disallow: [
      '/admin/',
      '/api/',
      '/private/',
      '/temp/',
      '/node_modules/',
      '/*.json$',
      '/auth/',
      '/dashboard/',
      '/internal/',
      '/dev/',
      '/*?utm_*',
      '/*?ref=*',
      '/*?source=*',
      '/*?fbclid=*',
      '/*?gclid=*',
      '/dist/',
      '/.vite/',
      '/.next/'
    ]
  });

  // Specific rules for major search engines
  generator.addRule({
    userAgent: 'Googlebot',
    allow: [
      '/',
      '/transformation-help',
      '/ai-strategy-help',
      '/services/',
      '/industries/',
      '/case-studies/',
      '/digital-academy/'
    ]
  });

  // Block aggressive crawlers
  const blockedBots = [
    'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'BLEXBot',
    'PetalBot', 'DataForSEOBot', 'SeekportBot', 'Amazonbot'
  ];

  blockedBots.forEach(bot => {
    generator.addRule({
      userAgent: bot,
      disallow: ['/']
    });
  });

  generator.setHost(VIKUNA_CONFIG.baseUrl);
  generator.addSitemap(`${VIKUNA_CONFIG.baseUrl}/sitemap.xml`);
  
  return generator.generateRobotsTxt();
}

// Generate enhanced security.txt for consulting business
function generateSecurityTxt() {
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  
  return `Contact: mailto:security@vikuna.io
Contact: mailto:connect@vikuna.io
Expires: ${expiryDate.toISOString()}
Preferred-Languages: en
Canonical: https://vikuna.io/.well-known/security.txt
Policy: https://vikuna.io/security-policy
Hiring: https://vikuna.io/join-network

# Security Policy for Consulting Business
# We appreciate responsible disclosure of security vulnerabilities.
# Please allow up to 24 hours for our initial response.
# For non-security issues, please use our consultation channels.

# Scope
# In scope: vikuna.io and all subdomains
# Out of scope: Third-party integrations and client systems`;
}

// Generate humans.txt for consulting team
function generateHumansTxt() {
  return `/* TEAM */
Founder & Chief Digital Officer: Charan Kamal B
Email: charan [at] vikuna.io
Location: Hyderabad, Telangana, India

Executive Network: Fortune 500 Veterans
CDO/CAiO Specialists: Available On-Demand
Digital Transformation Experts: Global Network

/* THANKS */
React Team - https://reactjs.org/
Vite Team - https://vitejs.dev/
TypeScript Team - https://www.typescriptlang.org/
Styled Components - https://styled-components.com/
Framer Motion - https://www.framer.com/motion/
Open Source Community

/* SITE */
Last update: ${new Date().toISOString().split('T')[0]}
Language: English
Doctype: HTML5
Standards: W3C compliant HTML5, CSS3, ES2022
Components: React 19, TypeScript 5.7, Vite 6
IDE: VS Code
Version Control: Git
Hosting: Vercel/Netlify
CDN: Cloudflare

/* BUSINESS FOCUS */
Service: Digital Transformation Consulting
Specialty: Executive Leadership as a Service
Industries: Healthcare, Manufacturing, Pharma, Financial
Approach: Problem-first, Results-driven
Mission: Turn transformation hesitation into confident action`;
}

// Main function to generate all SEO files for Vikuna
async function generateSEOFiles() {
  const publicDir = path.join(__dirname, '../public');
  
  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  console.log('🚀 Generating SEO files for Vikuna Technologies...\n');

  try {
    // Generate sitemap.xml
    const sitemap = generateVikunaSitemap();
    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);
    console.log('✅ Generated sitemap.xml');
    
    // Generate robots.txt
    const robots = generateVikunaRobots();
    fs.writeFileSync(path.join(publicDir, 'robots.txt'), robots);
    console.log('✅ Generated robots.txt');
    
    // Generate security.txt
    const wellKnownDir = path.join(publicDir, '.well-known');
    if (!fs.existsSync(wellKnownDir)) {
      fs.mkdirSync(wellKnownDir, { recursive: true });
    }
    const securityTxt = generateSecurityTxt();
    fs.writeFileSync(path.join(wellKnownDir, 'security.txt'), securityTxt);
    console.log('✅ Generated .well-known/security.txt');
    
    // Generate humans.txt
    const humansTxt = generateHumansTxt();
    fs.writeFileSync(path.join(publicDir, 'humans.txt'), humansTxt);
    console.log('✅ Generated humans.txt');
    
    console.log('\n🎉 All SEO files generated successfully for Vikuna!');
    console.log('\n📋 Generated files:');
    console.log('   • sitemap.xml - Consulting-focused sitemap');
    console.log('   • robots.txt - Crawler instructions for consulting business');
    console.log('   • .well-known/security.txt - Security contact for business');
    console.log('   • humans.txt - Consulting team credits');

    console.log('\n🔍 Next steps:');
    console.log('   1. Submit sitemap to Google Search Console');
    console.log('   2. Test robots.txt at /robots.txt');
    console.log('   3. Verify structured data for consulting business');
    console.log('   4. Set up conversion tracking for consultation requests');
    
  } catch (error) {
    console.error('❌ Error generating SEO files:', error);
    process.exit(1);
  }
}

// CLI interface
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Vikuna Technologies SEO File Generator

Usage:
  node scripts/generate-seo-files.js [options]

Options:
  --help, -h     Show this help message

Examples:
  node scripts/generate-seo-files.js        # Generate files for consulting business
  npm run seo:generate                      # Via npm script
  `);
} else {
  generateSEOFiles().catch(console.error);
}

// Export for use in other modules
export {
  generateSEOFiles,
  generateVikunaSitemap,
  generateVikunaRobots,
  generateSecurityTxt,
  generateHumansTxt,
  SitemapGenerator,
  RobotsGenerator,
  VIKUNA_CONFIG
};