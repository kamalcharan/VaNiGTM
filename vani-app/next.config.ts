import type { NextConfig } from 'next';

/**
 * The API and database live on the VPS; only this UI deploys to Vercel.
 *
 * The browser calls api.vikuna.io DIRECTLY — see src/lib/api-client.ts. An
 * earlier draft proxied /api/* through Vercel to keep the refresh cookie
 * first-party; that was rejected on review. vani.vikuna.io and api.vikuna.io
 * share the registrable domain, so they are same-site and SameSite=Strict
 * already sends the cookie without a proxy — and proxying would have replaced
 * the browser origin with Vercel's, defeating the origin allowlist in
 * deploy/vani-main-vps/api.vikuna.io.conf.
 *
 * Set NEXT_PUBLIC_API_ORIGIN in the Vercel project, not here.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Appearance and Model Provider were top-level SYSTEM routes until
  // 2026-09-22; they are tabs of /settings now. Bookmarks and any link that
  // still says the old path land on the tab, not on a 404.
  async redirects() {
    return [
      { source: '/appearance', destination: '/settings/appearance', permanent: true },
      { source: '/model-provider', destination: '/settings/model', permanent: true },
      { source: '/knowledge', destination: '/smart-profile/knowledge', permanent: true },
      { source: '/kg', destination: '/smart-profile/knowledge', permanent: true },
    ];
  },
};

export default nextConfig;
