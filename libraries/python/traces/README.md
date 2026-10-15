<!-- This document explains readme for CloudOps. -->
# cloudops-otel-traces

Python OpenTelemetry traces helper for CloudOps services.

```python
from cloudops_otel_traces import tracer

span = tracer.start_basic_span("handle-order", set_active_context=True)
try:
    ...  # work
except Exception as error:
    tracer.record_error(error, span)
finally:
    if span:
        span.end()
    tracer.export_spans()
```

Set `OTEL_SERVICE_NAME` in every app. The library also merges
`OTEL_RESOURCE_ATTRIBUTES` and adds AWS runtime attributes for Lambda, ECS, and
EKS when those environment hints are available. Trace context propagation uses
B3, and IDs use the AWS X-Ray id generator when the optional
`opentelemetry-sdk-extension-aws` package is installed.

Configuration matches the Node.js traces library:

- `OTEL_BACKEND_EXPORTERS`: JSON array or comma-separated list. Defaults to `console` (`otel` selects OTLP/HTTP).
- `TRACEID_RATIO_BASED_SAMPLER`: root sampler ratio from `0` to `1`. Defaults to `1`.
- `OTEL_SSM_PARAMETERS`: JSON object with `otel.trace.url` and `otel.trace.api_key`.
- `/tmp/otelExporterParams.json`: parameter file fallback. Set `OTEL_SSM_PARAMETERS_FILE` to override the path.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP HTTP endpoint fallback (normalised to end in `/v1/traces`).
- `OTEL_API_KEY` or `OTEL_EXPORTER_OTLP_HEADERS`: OTLP auth fallback.
