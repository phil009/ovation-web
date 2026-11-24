import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // cacheComponents (and its static PPR shells) is off: a per-request CSP nonce needs every
  // page rendered dynamically. See docs/DECISIONS.md.
  poweredByHeader: false,
  reactStrictMode: true,
  compiler: {
    // No console.log in production bundles; warnings and errors stay.
    removeConsole: isProd ? { exclude: ["error", "warn"] } : false,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must always be revalidated so updates are found.
        source: "/serwist/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
