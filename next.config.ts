import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["argon2", "bullmq", "ioredis"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${process.env.NODE_ENV === "development" ? "ws:" : ""}; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
      {
        source: "/api/ad-frame/:id",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src https: data:; script-src https: 'unsafe-inline'; style-src https: 'unsafe-inline'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
