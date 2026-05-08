# cloudops-otel-logs (Go)

Go logging helper for CloudOps services. Mirrors the Node.js / Python /
Java / .NET libraries.

```go
import logs "github.com/cloudops/otel-logs"

logs.Logger.Info("order created", map[string]any{"order_id": orderID})
logs.Logger.Error(err)
logs.Logger.ExportLogs() // flush at end of request / Lambda invocation
```

Set `OTEL_SERVICE_NAME` in every app. AWS Lambda / ECS / EKS resource
attributes are auto-detected from runtime env hints.

## Configuration

Same env-var contract as the other libraries:

- `OTEL_BACKEND_EXPORTERS` — JSON array or comma-separated list. Default `console`.
- `OTEL_LOG_LEVEL` — JSON array or CSV of `info`, `error`, `debug`, `warn`.
- `OTEL_LOGS_SAMPLING_RATE` — percentage `0`–`100`. Errors always export.
- `OTEL_SSM_PARAMETERS` — JSON `{"otel":{"logs":{"url":"...","api_key":"..."}}}`.
- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` / `OTEL_EXPORTER_OTLP_ENDPOINT` — fallback.
- `OTEL_API_KEY` / `OTEL_EXPORTER_OTLP_HEADERS` — bearer-auth fallback.

## Build

```sh
go mod tidy
go build ./...
go test ./...
```

The library ships a JSON OTLP/HTTP logs exporter (no SDK dependency beyond
`google/uuid`); console output is the default and runs without any AWS
connectivity.
