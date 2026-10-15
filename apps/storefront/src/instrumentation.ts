/**
 * Next.js OTel hook (closes backlog #89). Loaded automatically when
 * `instrumentationHook` is on. Exports a `register()` that calls
 * `@vercel/otel`'s `registerOTel`. Resource attrs match the order-api
 * pattern so traces stitch end-to-end (browser → Next.js → API GW →
 * Lambda → Express → RDS).
 */
import { registerOTel } from "@vercel/otel";

export function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "storefront",
    instrumentationConfig: {
      fetch: { propagateContextUrls: ["*"] },
    },
  });
}
