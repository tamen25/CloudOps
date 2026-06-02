import type { NextConfig } from "next";

/* Mirrors order-api helmet posture (backlog #101) for the HTML surface.
 * CSP is enforcing here — storefront serves HTML, unlike the JSON API.
 * 'unsafe-inline' on script/style is required by Next.js 15 app-router runtime
 * (inline bootstrap chunks + styled-jsx); promote to nonce-based CSP once the
 * middleware rewrite lands. connect-src includes wss: because the realtime WS
 * lives on a separate API Gateway origin (#86).
 *
 * 'unsafe-eval' is added ONLY in dev: the Next.js dev runtime (React Fast
 * Refresh + chunk eval) calls eval(), and without it the CSP blocks ALL client
 * hydration in `next dev` — every "use client" island stays inert (this is why
 * the /pipeline animation appeared dead locally, #151). Production builds never
 * eval, so the prod CSP stays exactly as #132 hardened it. */
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

//Next.js 15 enables the instrumentation hook by default — no experimental flag needed.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
