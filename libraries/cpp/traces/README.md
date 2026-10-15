<!-- This document explains readme for CloudOps. -->
# cloudops-otel-traces (C++)

C++ OpenTelemetry traces helper for CloudOps services. Header + static library,
C++17, no third-party dependencies. Mirrors the Node.js / Python / Java / .NET /
Go libraries.

```cpp
#include <cloudops/otel/traces.hpp>

auto& tracer = cloudops::otel::traces::tracer();

auto span = tracer.start_basic_span("handle-order", {.set_active_context = true});
// ... work ...
tracer.record_error("payment failed", span);
span->end();
tracer.export_spans();
```

Set `OTEL_SERVICE_NAME` in every app. AWS Lambda / ECS / EKS resource
attributes are auto-detected from runtime env hints. Trace IDs use the AWS
X-Ray-compatible layout (epoch-prefixed) and context propagation uses the B3
single-header format via `fetch_trace_attrs` / `extract_trace_attrs`.

Console output is the default sink. OTLP/HTTP export is left to the caller:
wire a transport with `set_otlp_transport` (e.g. libcurl) and the library builds
the OTLP JSON payload — no hard dependency on libcurl / OpenSSL.

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
cmake -S . -B build -G Ninja
cmake --build build
ctest --test-dir build --output-on-failure
```
