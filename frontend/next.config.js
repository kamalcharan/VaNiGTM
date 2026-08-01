/** @type {import('next').NextConfig} */

// Same-origin in development, matching production.
//
// In production, vani.vikuna.io's Nginx proxies BOTH `/` → frontend:3000
// and `/api/v1/...` → vani-backend:3001, so browser code resolves the API
// as window.location.origin and no NEXT_PUBLIC_API_URL is needed (see
// api-client.ts). Locally there is no Nginx, so this rewrite plays that
// role: /api/v1/* is forwarded to the backend dev server, keeping dev
// same-origin too. Without it, dev would need CORS that production doesn't
// have — i.e. dev would be exercising a different architecture than ships.
//
// DEV ONLY. In the deployed container Nginx handles this before Next.js
// ever sees the request, so it would be inert in production regardless —
// but it's gated explicitly rather than relying on that.
//
// Port 3002 is this repo's documented dev convention (CLAUDE.md: "Express
// API (backend/, port 3002 in dev)"), NOT the 3001 in backend/.env.example
// — those two disagree, and the running convention wins. Override with
// DEV_BACKEND_ORIGIN if your local backend uses a different port.
//
// If this port is wrong, the failure is confusing rather than obvious:
// Next.js can't reach the rewrite target and returns its own HTML 500,
// which surfaces in the UI as "Server returned 500 with non-JSON body".
// If you see that, check what port the backend actually logged on startup.
const BACKEND_ORIGIN = process.env.DEV_BACKEND_ORIGIN || 'http://localhost:3002';

const nextConfig = {
  experimental: {},

  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${BACKEND_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
