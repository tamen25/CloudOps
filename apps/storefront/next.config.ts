import type { NextConfig } from "next";

//Next.js 15 enables the instrumentation hook by default — no experimental flag needed.
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
};

export default config;
