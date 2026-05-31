// Must be the very first import in the process — instruments all subsequently
// loaded modules. Mirrors apps/order-api/src/tracing.ts: the SDK is skipped
// entirely when OTEL_EXPORTER_OTLP_ENDPOINT is unset, so the gateway runs
// cleanly with or without an observability backend (closes the equivalent of
// backlog #107 for this service).

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '';
if (!endpoint) {
  console.warn('OTEL_EXPORTER_OTLP_ENDPOINT not set — OTel SDK not started');
} else {
  const headers = { Authorization: `Bearer ${process.env.OTEL_API_KEY || ''}` };

  const sdkConfig: any = {
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, headers }),
      exportIntervalMillis: 30_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  };
  const sdk = new NodeSDK(sdkConfig);
  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}
