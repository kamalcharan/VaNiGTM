import type { NextConfig } from 'next';

/**
 * The API and database live on the VPS; only this UI deploys to Vercel.
 *
 * Rather than calling the VPS cross-origin, we proxy /api/* through this
 * origin. That is deliberate and load-bearing: VaNiGTM sets its refresh token
 * as an httpOnly cookie with SameSite=Strict
 * (backend/src/auth/auth.routes.ts). A cross-site request would not carry that
 * cookie, so login would appear to succeed and then silently drop the session
 * on the next reload. Proxying keeps the cookie first-party, keeps Strict
 * intact, and means the VPS needs no public CORS surface at all.
 *
 * VANI_API_ORIGIN is the VPS origin, e.g. https://api.vikuna.io — set it in the
 * Vercel project, not here. With it unset (local UI work), no rewrite is
 * registered and auth calls fail closed rather than leaking to a wrong host.
 */
const apiOrigin = process.env.VANI_API_ORIGIN;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
