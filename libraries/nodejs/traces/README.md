# @cloudops/otel-traces

CloudOps OpenTelemetry traces helper for Node.js services.

Aligned with the conventions of `@cloudops/otel-logs` in this repo: `console`/`otel` exporters,
the shared `readSSMParameters` resolution (`OTEL_SSM_PARAMETERS` → params file →
`OTEL_EXPORTER_OTLP_*` env), `Bearer` auth headers, and runtime AWS resource
attributes (Lambda / ECS / EKS).

## Usage

```ts
import { tracer, AwsService } from "@cloudops/otel-traces";

const span = tracer.startBasicSpan("handle-order");
try {
  // ... work ...
} catch (error) {
  tracer.recordError(error, span);
} finally {
  span?.end();
  await tracer.exportSpans();
}

// AWS-service-aware spans
const snsSpan = tracer.startAwsSpan(AwsService.SNS, {
  snsAttributes: { topicName: "orders", topicArn: "arn:aws:sns:...:orders" },
});
snsSpan?.end();
```

## Configuration

Driven by the same `OTEL_*` env-var contract as the other libraries:

- `OTEL_BACKEND_EXPORTERS` — `console` (default) or `otel` (OTLP/HTTP).
- `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` — resource identity.
- `OTEL_SSM_PARAMETERS` (inline JSON) / `OTEL_SSM_PARAMETERS_FILE`
  (`/tmp/otelExporterParams.json` by default) — exporter config
  (`{ "otel": { "trace": { "url": "...", "api_key": "..." } } }`).
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_EXPORTER_OTLP_ENDPOINT` — endpoint
  fallback (normalised to end in `/v1/traces`); `OTEL_API_KEY` — auth fallback.
- `TRACEID_RATIO_BASED_SAMPLER` — root sampler ratio (default `1`).
- `ENABLE_OTEL_DEBUG_LOGS=true` — verbose diagnostics.

Trace context propagation uses B3, and IDs use the AWS X-Ray id generator.

## Build & test

```bash
npm install
npm run build          # tsc -> dist/
npm test               # build + node --test
npm run test:coverage  # build + node --test with coverage gates
```
