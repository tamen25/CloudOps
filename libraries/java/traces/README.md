# com.cloudops:otel-traces

Java OpenTelemetry traces helper for CloudOps services.

```java
import com.cloudops.otel.traces.TraceInstrumentation;
import com.cloudops.otel.traces.SpanProps;
import io.opentelemetry.api.trace.Span;

final TraceInstrumentation tracer = TraceInstrumentation.initialiseTracer();

Span span = tracer.startBasicSpan("handle-order", new SpanProps().setActiveContext(true));
try {
  // ... work ...
} catch (Exception error) {
  tracer.recordError(error, span);
} finally {
  if (span != null) {
    span.end();
  }
  tracer.exportSpans();
}
```

Set `OTEL_SERVICE_NAME` in every app. The library also merges
`OTEL_RESOURCE_ATTRIBUTES` and adds AWS runtime attributes for Lambda, ECS, and
EKS when those environment hints are available. Trace context propagation uses
the B3 single-header format via `fetchTraceAttrs` / `extractTraceAttrs`.

Configuration matches the Node.js traces library:

- `OTEL_BACKEND_EXPORTERS`: JSON array or comma-separated list. Defaults to `console` (`otel` selects OTLP/HTTP).
- `TRACEID_RATIO_BASED_SAMPLER`: root sampler ratio from `0` to `1`. Defaults to `1`.
- `OTEL_SSM_PARAMETERS`: JSON object with `otel.trace.url` and `otel.trace.api_key`.
- `/tmp/otelExporterParams.json`: parameter file fallback. Set `OTEL_SSM_PARAMETERS_FILE` to override the path.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP HTTP endpoint fallback (normalised to end in `/v1/traces`).
- `OTEL_API_KEY` or `OTEL_EXPORTER_OTLP_HEADERS`: OTLP auth fallback.
