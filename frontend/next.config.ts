import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5001";
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || BACKEND_URL;

const nextConfig: NextConfig = {
  // @ts-ignore - Next.js 16 agentRules config
  agentRules: false,
  images: { unoptimized: true },

  async rewrites() {
    return [
      // OAuth connect routes must redirect the BROWSER to the backend (not proxy them),
      // because the backend issues HTTP 302 redirects to LinkedIn/Meta/Google/X.
      // We use beforeFiles so they take priority.
      {
        source: "/api/accounts/:platform/connect",
        destination: `${BACKEND_URL}/api/accounts/:platform/connect`,
      },
      {
        source: "/api/accounts/:platform/connect/:path*",
        destination: `${BACKEND_URL}/api/accounts/:platform/connect/:path*`,
      },
      // Catch-all API proxy for all other backend routes
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },

  async redirects() {
    // OAuth callbacks come back to localhost:3000/api/accounts/:platform/callback
    // and are proxied by the rewrite above to the backend.
    // No special redirects needed — the backend redirect to the app URL after OAuth
    // will land on the correct frontend page since NEXT_PUBLIC_APP_URL = http://localhost:3000.
    return [];
  },
};

export default nextConfig;
