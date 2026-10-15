<!-- This document explains readme for CloudOps. -->
# CloudOps.Otel.Traces

.NET OpenTelemetry traces helper for CloudOps services.

```csharp
using CloudOps.Otel.Traces;
using System.Diagnostics;

var tracer = TraceInstrumentation.InitialiseTracer();

using var span = tracer.StartBasicSpan("handle-order", new SpanProps { SetActiveContext = true });
try
{
    // ... work ...
}
catch (Exception error)
{
    tracer.RecordError(error, span);
}
finally
{
    span?.Dispose();
    tracer.ExportSpans();
}
```

Set `OTEL_SERVICE_NAME` in every app. The library also merges
`OTEL_RESOURCE_ATTRIBUTES` and adds AWS runtime attributes for Lambda, ECS, and
EKS when those environment hints are available. Spans are `System.Diagnostics.Activity`
instances; trace context propagation uses the B3 single-header format via
`FetchTraceAttrs` / `ExtractTraceAttrs`.

Configuration matches the Node.js traces library:

- `OTEL_BACKEND_EXPORTERS`: JSON array or comma-separated list. Defaults to `console` (`otel` selects OTLP/HTTP).
- `TRACEID_RATIO_BASED_SAMPLER`: root sampler ratio from `0` to `1`. Defaults to `1`.
- `OTEL_SSM_PARAMETERS`: JSON object with `otel.trace.url` and `otel.trace.api_key`.
- `/tmp/otelExporterParams.json`: parameter file fallback. Set `OTEL_SSM_PARAMETERS_FILE` to override the path.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP HTTP endpoint fallback (normalised to end in `/v1/traces`).
- `OTEL_API_KEY` or `OTEL_EXPORTER_OTLP_HEADERS`: OTLP auth fallback.
