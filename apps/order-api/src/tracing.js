// Must be the very first require in the process — instruments all subsequently loaded modules.
'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

// OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES are read automatically by the SDK from env.
// We build the exporters manually so we can attach the Authorization header to all three signals.
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '';
if (!endpoint) {
  // eslint-disable-next-line no-console
  console.warn('OTEL_EXPORTER_OTLP_ENDPOINT not set — traces/metrics/logs will not be exported');
}
const headers  = { Authorization: `Bearer ${process.env.OTEL_API_KEY || ''}` };

const sdk = new NodeSDK({
  // Traces → OTel Collector /v1/traces
  traceExporter: new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
  }),

  // Metrics → OTel Collector /v1/metrics, pushed every 30s
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
      headers,
    }),
    exportIntervalMillis: 30_000,
  }),

  // Logs → OTel Collector /v1/logs
  logRecordProcessors: [
    new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: `${endpoint}/v1/logs`,
        headers,
      }),
    ),
  ],

  // Auto-instrument Express, HTTP, pg, and other loaded modules
  instrumentations: [
    getNodeAutoInstrumentations({
      // fs instrumentation generates too much noise
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

// Flush all pending telemetry before the process exits
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
