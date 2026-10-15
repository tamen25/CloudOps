# cloudops-otel-traces (Go)

Go OpenTelemetry traces helper for CloudOps services. Mirrors the Node.js /
Python / Java / .NET libraries.

```go
import traces "github.com/cloudops/otel-traces"

span := traces.Tracer.StartBasicSpan("handle-order", &traces.SpanOptions{SetActiveContext: true})
// ... work ...
traces.Tracer.RecordError(err, span)
span.End()
traces.Tracer.ExportSpans() // flush at end of request / Lambda invocation
```

Set `OTEL_SERVICE_NAME` in every app. AWS Lambda / ECS / EKS resource
attributes are auto-detected from runtime env hints. Trace IDs use the AWS
X-Ray-compatible layout (epoch-prefixed) and context propagation uses B3.

## Configuration

Same env-var contract as the other libraries:

- `OTEL_BACKEND_EXPORTERS` — JSON array or comma-separated list. Default `console` (`otel` selects OTLP/HTTP).
- `TRACEID_RATIO_BASED_SAMPLER` — root sampler ratio `0`–`1`. Default `1`.
- `OTEL_SSM_PARAMETERS` — JSON `{"otel":{"trace":{"url":"...","api_key":"..."}}}`.
- `/tmp/otelExporterParams.json` — parameter file fallback. Set `OTEL_SSM_PARAMETERS_FILE` to override the path.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_EXPORTER_OTLP_ENDPOINT` — fallback (suffixed `/v1/traces`).
- `OTEL_API_KEY` / `OTEL_EXPORTER_OTLP_HEADERS` — bearer-auth fallback.

## Build

```sh
go build ./...
go test ./...
```

The library ships a JSON OTLP/HTTP traces exporter with no third-party
dependencies; console output is the default and runs without any AWS
connectivity.
