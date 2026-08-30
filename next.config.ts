import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const development = process.env.NODE_ENV === "development";
const standalone = process.env.NEXT_OUTPUT === "standalone";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "frame-src 'self'",
      "img-src 'self' data:",
      "object-src 'self'",
      `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  ...(standalone
    ? { output: "standalone" as const, outputFileTracingRoot: projectRoot }
    : {}),
  poweredByHeader: false,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
