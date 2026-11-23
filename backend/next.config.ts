import type { NextConfig } from "next";

/**
 * Cache-Control for fixed-name files in public/. Production: browsers reuse a
 * copy for 5 minutes. After that, a page load within a day still uses the
 * cached copy while the browser checks for a new one in the background (a
 * cheap 304 via ETag when nothing changed); the next load uses the result.
 * Development: always revalidate.
 */
function publicFileCacheControl(): string {
  return process.env.NODE_ENV === "production"
    ? "public, max-age=300, stale-while-revalidate=86400"
    : "public, max-age=0, must-revalidate";
}

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
            key: "Access-Control-Max-Age",
            value: "86400",
          },
        ],
      },
      // Files in public/ keep a fixed name across releases (the widget bundle at
      // /embed/v1/widgets.js, logos, favicons), so browsers must check back for a
      // new copy after an upgrade. /_next/ is left out: Next.js gives its own
      // hashed build files a one-year immutable cache, and this rule would
      // override it.
      {
        source: "/:path((?!_next/).*)\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)",
        headers: [{ key: "Cache-Control", value: publicFileCacheControl() }],
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
          { key: "Cache-Control", value: publicFileCacheControl() },
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