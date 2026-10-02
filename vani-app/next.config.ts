import path from 'path';
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
  // This app has its own lockfile inside the VaNiGTM monorepo (since
  // 2026-10-01). Without this Next infers the repo root from the root
  // package-lock.json and resolves from there.
  turbopack: { root: path.join(__dirname) },
  // Appearance and Model Provider were top-level SYSTEM routes until
  // 2026-09-22; they are tabs of /settings now. Bookmarks and any link that
  // still says the old path land on the tab, not on a 404.
  async redirects() {
    return [
      { source: '/appearance', destination: '/settings/appearance', permanent: true },
      { source: '/model-provider', destination: '/settings/model', permanent: true },
      { source: '/knowledge', destination: '/smart-profile/knowledge', permanent: true },
      { source: '/kg', destination: '/smart-profile/knowledge-graph', permanent: true },
      // D-Q9 (2026-10-02): the industry master moved under Settings, admin only.
      { source: '/agents/gtm/pool/industries', destination: '/settings/industries', permanent: true },
    ];
  },
};

export default nextConfig;
