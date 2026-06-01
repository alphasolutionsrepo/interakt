import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  compress: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // Externalize pino and related packages to prevent bundler issues
  // These packages use Node.js-specific features (worker_threads, streams)
  // and should be loaded directly from node_modules at runtime
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'thread-stream',
    '@opentelemetry/api',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/resources',
    '@opentelemetry/semantic-conventions',
  ],
  async headers() {
    return [
      // CORS headers for all routes
      {
        source: "/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
          {
            key: "Access-Control-Max-Age",
            value: "86400",
          },
        ],
      },
      // Static assets only (JS, CSS, images, fonts)
      {
        source: "/:path*\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)",
        headers: [
          {
            key: "Cache-Control",
            value: process.env.NODE_ENV === 'production'
              ? "public, max-age=31536000, immutable"  // Production: 1 year
              : "public, max-age=0, must-revalidate",   // Dev: no cache
          },
        ],
      },
      // Drop-in embed bundle — must load cross-origin from any customer site.
      // API calls made by the widget are still gated by per-experience allowedOrigins
      // via createCorsHeaders() in the access-token middleware.
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
          {
            key: "Cache-Control",
            value: process.env.NODE_ENV === 'production'
              ? "public, max-age=31536000, immutable"
              : "public, max-age=0, must-revalidate",
          },
        ],
      },
      // All API routes - NO CACHE
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  }
};

export default nextConfig;