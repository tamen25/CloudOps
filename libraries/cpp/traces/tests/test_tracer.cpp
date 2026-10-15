#include <cstdio>
#include <cstdlib>
#include <string>

#include "cloudops/otel/traces.hpp"

namespace traces = cloudops::otel::traces;

namespace {
int check(bool condition, const char* msg) {
  if (!condition) {
    std::fprintf(stderr, "FAIL: %s\n", msg);
    return 1;
  }
  return 0;
}

void set_env(const char* key, const char* value) {
#ifdef _WIN32
  _putenv_s(key, value);
#else
  if (value[0] == '\0') {
    unsetenv(key);
  } else {
    setenv(key, value, 1);
  }
#endif
}
}  // namespace

// Runs tracer tests.
int run_tracer_tests() {
  int failures = 0;

  set_env("OTEL_BACKEND_EXPORTERS", "console");
  set_env("OTEL_SERVICE_NAME", "orders-api");
  set_env("TRACEID_RATIO_BASED_SAMPLER", "1");

  {
    traces::TraceInstrumentation tracer("orders-api");

    auto span = tracer.start_basic_span("manual-span", {.set_active_context = true});
    failures += check(span != nullptr, "start_basic_span returns span");
    failures += check(span->trace_id().size() == 32, "trace id length");
    failures += check(span->span_id().size() == 16, "span id length");

    tracer.set_attributes(span, {{"order.id", "42"}});
    failures += check(span->attributes().at("order.id") == "42", "set_attributes");

    tracer.record_error("boom", span);
    failures += check(span->status_code() == 2, "record_error sets error status");

    auto attrs = tracer.fetch_trace_attrs();
    failures += check(attrs.has_value() && attrs->count("b3") == 1, "fetch_trace_attrs b3");
    failures += check(attrs.has_value() && attrs->at("b3").rfind(span->trace_id() + "-" + span->span_id(), 0) == 0, "b3 prefix");

    span->end();

    // Child span inherits the active trace context.
    auto child = tracer.start_basic_span("child");
    failures += check(child->trace_id() == span->trace_id(), "child inherits trace id");
    failures += check(child->parent_span_id() == span->span_id(), "child parent span id");
    child->end();
  }

  // extract_trace_attrs parses a B3 single header into the propagation context.
  {
    traces::TraceInstrumentation tracer("prop-api");
    tracer.extract_trace_attrs({{"b3", "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1"}});
    auto ctx = tracer.propagation_context();
    failures += check(ctx.first == "0af7651916cd43dd8448eb211c80319c", "extract trace id");
    failures += check(ctx.second == "b7ad6b7169203331", "extract span id");
  }

  // OTLP export ships finished spans through the injected transport.
  {
    set_env("OTEL_BACKEND_EXPORTERS", "otel");
    set_env("OTEL_SSM_PARAMETERS", "{\"otel\":{\"trace\":{\"url\":\"https://collector.example.com/v1/traces\",\"api_key\":\"secret\"}}}");
    traces::TraceInstrumentation tracer("export-api");

    std::string captured_url;
    std::string captured_body;
    tracer.set_otlp_transport([&](const std::string& url,
                                  const std::map<std::string, std::string>& headers,
                                  const std::string& body) {
      captured_url = url;
      captured_body = body;
      return headers.count("authorization") == 1;
    });

    auto span = tracer.start_basic_span("shipped-span", {.root = true});
    span->end();
    tracer.export_spans();

    failures += check(captured_url == "https://collector.example.com/v1/traces", "export url");
    failures += check(captured_body.find("shipped-span") != std::string::npos, "export payload contains span");
    set_env("OTEL_SSM_PARAMETERS", "");
    set_env("OTEL_BACKEND_EXPORTERS", "console");
  }

  set_env("OTEL_SERVICE_NAME", "");
  set_env("TRACEID_RATIO_BASED_SAMPLER", "");
  return failures;
}
