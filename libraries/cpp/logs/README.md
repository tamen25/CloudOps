# cloudops-otel-logs (C++)

C++ logging helper for CloudOps services. Mirrors the Node.js / Python /
Java / .NET / Go libraries.

```cpp
#include <cloudops/otel/logs.hpp>

auto& log = cloudops::otel::logs::logger();
log.info("order created", {{ cloudops::otel::logs::LogValue{ std::string{"order_id"} } }});
log.error("upstream failed");
log.export_logs();   // flush at end of request / job
```

Set `OTEL_SERVICE_NAME` in every app. AWS Lambda / ECS / EKS resource
attributes are auto-detected from runtime env hints.

## Configuration

Same env-var contract as the other libraries:

- `OTEL_BACKEND_EXPORTERS` — JSON array or comma-separated list. Default `console`.
- `OTEL_LOG_LEVEL` — JSON array or CSV of `info`, `error`, `debug`, `warn`.
- `OTEL_LOGS_SAMPLING_RATE` — percentage `0`–`100`. Errors always export.
- `OTEL_SSM_PARAMETERS` — JSON `{"otel":{"logs":{"url":"...","api_key":"..."}}}`.
- `/tmp/otelExporterParams.json` — parameter file fallback. Set `OTEL_SSM_PARAMETERS_FILE` to override the path.
- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` / `OTEL_EXPORTER_OTLP_ENDPOINT` — fallback.
- `OTEL_API_KEY` / `OTEL_EXPORTER_OTLP_HEADERS` — bearer-auth fallback.

## Build

```sh
cmake -S . -B build
cmake --build build
ctest --test-dir build
```

The library is dependency-free. To ship logs over OTLP/HTTP, inject a
transport via `set_otlp_transport` (e.g. a libcurl wrapper) — keeps the
core lib portable across embedded / WASM / minimal runtime targets.
