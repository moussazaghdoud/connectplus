import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["rainbow-node-sdk"],
  images: {
    remotePatterns: [],
  },
  async redirects() {
    // widget.html is now served as a static file from public/cti-widget/app/
    // Zoho loads it directly → it iframes /cti-widget with Zoho SDK events
    return [];
  },
  async headers() {
    return [
      {
        // Widget routes: allow embedding in any iframe (for CRM integration)
        source: "/widget/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // Widget root
        source: "/widget",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // CTI widget routes: allow embedding in CRM iframe
        source: "/cti-widget/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // CTI widget root
        source: "/cti-widget",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // Login page: allow embedding in iframe (agent logs in from Zoho/CRM)
        source: "/login",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // API routes: allow from iframe (SSE, calls, auth)
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // All other routes: prevent iframe embedding
        source: "/((?!widget|cti-widget|login|api).*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
