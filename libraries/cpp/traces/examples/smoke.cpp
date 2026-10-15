// This file contains smoke logic for traces examples.
// Smoke test consumer for the cloudops-otel-traces C++ library. Exercises every
// public surface and exits 0 when the library is wired correctly.
#include <cstdio>
#include <cstdlib>

#include "cloudops/otel/traces.hpp"

namespace traces = cloudops::otel::traces;

// Sets an environment variable in a cross-platform way.
static void set_env(const char* key, const char* value) {
#ifdef _WIN32
  _putenv_s(key, value);
#else
  setenv(key, value, 1);
#endif
}

// Runs the main workflow for the requested work.
int main() {
  set_env("OTEL_SERVICE_NAME", "smoke-test");
  set_env("OTEL_BACKEND_EXPORTERS", "console");

  traces::TraceInstrumentation tracer("smoke-test");

  auto root = tracer.start_basic_span("root", {.root = true, .set_active_context = true});
  auto child = tracer.start_basic_span("child", {.kind = traces::SpanKind::Consumer});
  tracer.set_attributes(child, {{"k", "v"}});
  tracer.record_error("boom", child);
  child->end();

  auto attrs = tracer.fetch_trace_attrs();
  root->end();
  tracer.export_spans();

  if (tracer.resource_attributes().at("service.name") != "smoke-test") {
    std::fprintf(stderr, "service.name not propagated\n");
    return EXIT_FAILURE;
  }
  if (child->trace_id() != root->trace_id()) {
    std::fprintf(stderr, "child did not inherit trace id\n");
    return EXIT_FAILURE;
  }
  if (!attrs.has_value() || attrs->count("b3") != 1) {
    std::fprintf(stderr, "b3 propagation header missing\n");
    return EXIT_FAILURE;
  }

  std::printf("ok — cpp traces smoke\n");
  return EXIT_SUCCESS;
}
